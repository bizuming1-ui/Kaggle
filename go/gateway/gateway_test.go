package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Watermark policy
// ---------------------------------------------------------------------------

func TestPolicyStartFastIsSmall(t *testing.T) {
	// The first sound must not wait for a deep buffer: that is what pushed
	// time-to-first-audio past 3 s on a slow (single T4) configuration.
	for _, agg := range []float64{0.5, 0.9, 1.0, 1.8, 2.2, 4.0} {
		p := policyFor(agg, 0)
		if p.StartFast <= 0 || p.StartFast > 0.5 {
			t.Fatalf("agg %.2f: start_fast_s = %v, want (0, 0.5]", agg, p.StartFast)
		}
	}
}

func TestPolicyIsMonotonicAndBounded(t *testing.T) {
	slow := policyFor(0.8, 0)
	fast := policyFor(3.0, 0)
	if slow.Low < fast.Low {
		t.Fatalf("a slower system needs a deeper low watermark: %v vs %v", slow.Low, fast.Low)
	}
	if slow.High < fast.High {
		t.Fatalf("a slower system needs a deeper high watermark: %v vs %v", slow.High, fast.High)
	}
	if slow.Start < fast.Start {
		t.Fatalf("a slower system needs a deeper start threshold: %v vs %v", slow.Start, fast.Start)
	}
	p := policyFor(0.9, 99)
	if p.Low > 20 || p.Start > 12 {
		t.Fatalf("underrun compensation is unbounded: %+v", p)
	}
}

func TestPolicyJSONHasFastField(t *testing.T) {
	b, _ := json.Marshal(policyFor(1.8, 0))
	if !bytes.Contains(b, []byte(`"start_fast_s"`)) {
		t.Fatalf("policy json must expose start_fast_s: %s", b)
	}
}

// ---------------------------------------------------------------------------
// LLM configuration (DeepSeek V4 family)
// ---------------------------------------------------------------------------

func TestClampTokens(t *testing.T) {
	if clampTokens(0) != defaultMaxTokens {
		t.Fatalf("0 -> %d, want %d", clampTokens(0), defaultMaxTokens)
	}
	if clampTokens(-5) != defaultMaxTokens {
		t.Fatalf("negative -> %d, want %d", clampTokens(-5), defaultMaxTokens)
	}
	if clampTokens(999999) != absoluteMaxTokens {
		t.Fatalf("huge -> %d, want %d", clampTokens(999999), absoluteMaxTokens)
	}
	if clampTokens(1234) != 1234 {
		t.Fatalf("1234 -> %d", clampTokens(1234))
	}
}

func TestParseTokens(t *testing.T) {
	if parseTokens("", 7) != 7 {
		t.Fatal("empty must fall back")
	}
	if parseTokens("abc", 7) != 7 {
		t.Fatal("garbage must fall back")
	}
	if parseTokens(" 42 ", 7) != 42 {
		t.Fatal("valid int must be used")
	}
}

func TestDefaultLLMModelIsNotRetired(t *testing.T) {
	// deepseek-chat / deepseek-reasoner were retired on 2026-07-24.
	if defaultLLMModel == "deepseek-chat" || defaultLLMModel == "deepseek-reasoner" {
		t.Fatalf("default model %q is a retired alias", defaultLLMModel)
	}
	if !strings.HasPrefix(defaultLLMModel, "deepseek") {
		t.Fatalf("unexpected default model %q", defaultLLMModel)
	}
}

func TestSystemPromptFor(t *testing.T) {
	if SystemPromptFor("detailed") == SystemPromptFor("concise") {
		t.Fatal("detailed and concise personas must differ")
	}
	for _, tone := range []string{"", "concise", "detailed", "technical", "weird"} {
		p := SystemPromptFor(tone)
		if len(p) < 40 {
			t.Fatalf("tone %q -> suspiciously short prompt", tone)
		}
		if strings.Contains(p, "```") {
			t.Fatalf("tone %q -> prompt must not contain markdown fences", tone)
		}
	}
}

func TestStreamLLMRequiresKey(t *testing.T) {
	cfg := loadConfig()
	err := StreamLLM(context.Background(), cfg, "", nil, nil, nil, nil)
	if err == nil {
		t.Fatal("a missing api key must be an error, not a silent success")
	}
	if !strings.Contains(err.Error(), "DEEPSEEK_API_KEY") {
		t.Fatalf("error must name the missing variable: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Language detection + prosody
// ---------------------------------------------------------------------------

func TestDetectLang(t *testing.T) {
	cases := map[string]string{
		"你好，今天天气不错。":          "Chinese",
		"Hello, how are you?": "English",
		"こんにちは、元気ですか":         "Japanese",
		"안녕하세요 반갑습니다":         "Korean",
	}
	for in, want := range cases {
		if got := detectLang(in); got != want {
			t.Fatalf("%q -> %q, want %q", in, got, want)
		}
	}
}

func TestChatSegmentationIsShorter(t *testing.T) {
	base := DefaultSegCfg(nil)
	chat := base
	chat.FirstMin, chat.FirstMax = 6, 15
	chat.Min, chat.Target, chat.Max = 10, 22, 56
	if chat.FirstMax >= base.FirstMax {
		t.Fatal("chat mode must use shorter first segments (lower latency)")
	}
	segs := feedAll(NewSegmenter(chat, 1), sample, 3)
	if len(segs) == 0 {
		t.Fatal("no segments")
	}
	if segs[0].Units > 16 {
		t.Fatalf("chat first segment too long: %v", segs[0].Units)
	}
}

// ---------------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------------

func TestWriteFrameRoundTrip(t *testing.T) {
	rec := httptest.NewRecorder()
	fl := httptest.NewRecorder()
	_ = fl
	payload := []byte{1, 2, 3, 4, 5}
	if err := writeFrame(rec, nopFlusher{rec}, cPCM, 7, payload); err != nil {
		t.Fatal(err)
	}
	b := rec.Body.Bytes()
	if len(b) != 9+len(payload) {
		t.Fatalf("frame length %d, want %d", len(b), 9+len(payload))
	}
	if b[0] != cPCM {
		t.Fatalf("type %d", b[0])
	}
	if got := binary.LittleEndian.Uint32(b[1:]); got != 7 {
		t.Fatalf("seg %d", got)
	}
	if got := binary.LittleEndian.Uint32(b[5:]); got != uint32(len(payload)) {
		t.Fatalf("len %d", got)
	}
	if !bytes.Equal(b[9:], payload) {
		t.Fatalf("payload mismatch")
	}
}

type nopFlusher struct{ *httptest.ResponseRecorder }

func (n nopFlusher) Flush() {}

func TestClientFrameTypesAreUnique(t *testing.T) {
	seen := map[byte]bool{}
	for _, ft := range []byte{cPCM, cSeg, cText, cStats, cEnd, cError, cPolicy, cEvent} {
		if seen[ft] {
			t.Fatalf("duplicate client frame type %d", ft)
		}
		seen[ft] = true
	}
}

// ---------------------------------------------------------------------------
// Session lifecycle / interrupt
// ---------------------------------------------------------------------------

func TestSessionInterruptCancels(t *testing.T) {
	s := &Session{
		ID: "x", ctx: context.Background(), profile: &ProfileInfo{ID: "p"},
		wake: make(chan struct{}, 1), timeline: map[string]float64{}, t0: time.Now(),
	}
	cctx, cancel := context.WithCancel(s.ctx)
	s.ctx, s.cancel = cctx, cancel
	if !s.Interrupt("user") {
		t.Fatal("first interrupt must succeed")
	}
	select {
	case <-s.ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("interrupt must cancel the session context")
	}
	if !s.isInterrupted() {
		t.Fatal("session must be marked interrupted")
	}
	if s.Interrupt("user") {
		t.Fatal("a second interrupt must be a no-op")
	}
}

func TestAllowDispatchServesStarvingClient(t *testing.T) {
	sched := NewScheduler(nil)
	s := &Session{
		ID: "x", ctx: context.Background(), profile: &ProfileInfo{ID: "p"},
		sched: sched, wake: make(chan struct{}, 1), timeline: map[string]float64{}, t0: time.Now(),
	}
	s.lastTelem = time.Now()
	s.clientState = "starved"
	s.clientBuf = 0.1
	s.urgency = 0.9
	j := &Job{sess: s, seg: Segment{Index: 5}}
	if !s.allowDispatch(j) {
		t.Fatal("a starving client must always be served")
	}
}

func TestAllowDispatchStopsAfterInterrupt(t *testing.T) {
	sched := NewScheduler(nil)
	s := &Session{
		ID: "x", ctx: context.Background(), profile: &ProfileInfo{ID: "p"},
		sched: sched, wake: make(chan struct{}, 1), timeline: map[string]float64{}, t0: time.Now(),
	}
	s.interrupted = true
	j := &Job{sess: s, seg: Segment{Index: 5}}
	if s.allowDispatch(j) {
		t.Fatal("an interrupted session must not dispatch new work")
	}
}

func TestFirstTwoSegmentsAlwaysDispatch(t *testing.T) {
	sched := NewScheduler(nil)
	s := &Session{
		ID: "x", ctx: context.Background(), profile: &ProfileInfo{ID: "p"},
		sched: sched, wake: make(chan struct{}, 1), timeline: map[string]float64{}, t0: time.Now(),
	}
	s.lastTelem = time.Now()
	s.throttled = true // watermark says "pause"
	for i := 0; i < 2; i++ {
		j := &Job{sess: s, seg: Segment{Index: i}}
		if !s.allowDispatch(j) {
			t.Fatalf("segment %d must always be dispatched (fast start)", i)
		}
	}
}

func TestChunkSizeFirstIsSmall(t *testing.T) {
	sched := NewScheduler(nil)
	s := &Session{
		ID: "x", ctx: context.Background(), profile: &ProfileInfo{ID: "p"},
		sched: sched, wake: make(chan struct{}, 1), timeline: map[string]float64{}, t0: time.Now(),
	}
	if got := s.chunkSize(0); got > 4 {
		t.Fatalf("first chunk_size = %d, want <= 4 (latency)", got)
	}
	if got := s.chunkSize(3); got < 4 {
		t.Fatalf("later chunk_size = %d, want >= 4 (throughput)", got)
	}
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

func newTestApp(t *testing.T) *App {
	t.Helper()
	sched := NewScheduler([]string{})
	sched.Start()
	return &App{cfg: loadConfig(), sched: sched, metrics: NewMetrics()}
}

func TestConfigEndpointExposesTruth(t *testing.T) {
	a := newTestApp(t)
	rec := httptest.NewRecorder()
	a.config(rec, httptest.NewRequest(http.MethodGet, "/api/config", nil))
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	var m map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"sample_rate", "model", "llm", "policy"} {
		if _, ok := m[k]; !ok {
			t.Fatalf("config is missing %q: %s", k, rec.Body.String())
		}
	}
	llm, _ := m["llm"].(map[string]any)
	if llm["model"] == "" {
		t.Fatal("config must expose the llm model id")
	}
}

func TestHealthEndpoint(t *testing.T) {
	a := newTestApp(t)
	rec := httptest.NewRecorder()
	a.health(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"workers_healthy"`) {
		t.Fatalf("body: %s", rec.Body.String())
	}
}

func TestInterruptEndpoint(t *testing.T) {
	a := newTestApp(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/chat/interrupt",
		strings.NewReader(`{"all":true,"reason":"test"}`))
	req.Header.Set("Content-Type", "application/json")
	a.interrupt(rec, req)
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
}

func TestInterruptEndpointRequiresSession(t *testing.T) {
	a := newTestApp(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/chat/interrupt", strings.NewReader(`{}`))
	a.interrupt(rec, req)
	if rec.Code != 400 {
		t.Fatalf("status %d, want 400", rec.Code)
	}
}

func TestRoutesAreRegistered(t *testing.T) {
	a := newTestApp(t)
	h := a.routes()
	for _, p := range []string{"/api/health", "/api/config", "/api/speak", "/api/chat/interrupt",
		"/api/chat/asr", "/api/chat/state", "/deploy/bundle", "/api/prep/"} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, p, nil)
		h.ServeHTTP(rec, req)
		if rec.Code == 404 && p != "/deploy/bundle" {
			t.Fatalf("route %s is not registered (404)", p)
		}
	}
}

func TestCORSHeaders(t *testing.T) {
	a := newTestApp(t)
	h := a.routes()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodOptions, "/api/speak", nil))
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("missing CORS allow-origin")
	}
	if !strings.Contains(rec.Header().Get("Access-Control-Allow-Headers"), "X-DeepSeek-Key") {
		t.Fatal("missing X-DeepSeek-Key in allow-headers")
	}
}
