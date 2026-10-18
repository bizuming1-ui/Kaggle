package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Config struct {
	Bind         string
	Port         int
	WorkerURLs   []string
	AnalystURL   string
	WebDir       string
	StateDir     string
	Root         string
	LLMKey       string
	LLMBase      string
	LLMModel     string
	MaxTokens    int
	Temperature  float64
	LLMReasoning bool
}

func env(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}

func loadConfig() *Config {
	c := &Config{
		Bind:        env("QTTS_BIND", "127.0.0.1"),
		StateDir:    env("QTTS_STATE", "./state"),
		WebDir:      env("QTTS_WEB", "./web"),
		Root:        env("QTTS_ROOT", "."),
		LLMKey:      env("DEEPSEEK_API_KEY", ""),
		LLMBase:     env("DEEPSEEK_BASE_URL", defaultLLMBase),
		LLMModel:    env("DEEPSEEK_MODEL", defaultLLMModel),
		MaxTokens:   clampTokens(parseTokens(env("DEEPSEEK_MAX_TOKENS", ""), defaultMaxTokens)),
		Temperature: 0.7,
		LLMReasoning: strings.EqualFold(env("DEEPSEEK_REASONING", "0"), "1") ||
			strings.EqualFold(env("DEEPSEEK_REASONING", "0"), "true"),
	}
	if t := parseTokens(env("DEEPSEEK_TEMPERATURE_X100", ""), 0); t > 0 {
		c.Temperature = float64(t) / 100.0
	}
	c.Port, _ = strconv.Atoi(env("QTTS_GATEWAY_PORT", "7860"))
	for _, p := range strings.Split(env("QTTS_WORKER_PORTS", "7001,7002"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			c.WorkerURLs = append(c.WorkerURLs, "http://127.0.0.1:"+p)
		}
	}
	c.AnalystURL = "http://127.0.0.1:" + env("QTTS_ANALYST_PORT", "7010")
	return c
}

type App struct {
	cfg     *Config
	sched   *Scheduler
	metrics *Metrics
}

func newID() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func detectLang(s string) string {
	cjk, kana, hangul, latin := 0, 0, 0, 0
	for _, r := range s {
		switch {
		case r >= 0x3040 && r <= 0x30ff:
			kana++
		case r >= 0xac00 && r <= 0xd7af:
			hangul++
		case r >= 0x3400 && r <= 0x9fff:
			cjk++
		case (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z'):
			latin++
		}
	}
	switch {
	case kana > 0 && float64(kana) >= float64(cjk)*0.2:
		return "Japanese"
	case hangul > cjk && hangul > 0:
		return "Korean"
	case cjk > 0 && float64(cjk) >= float64(latin)*0.35:
		return "Chinese"
	}
	return "English"
}

func (a *App) newSession(ctx context.Context, req SpeakReq, prof *ProfileInfo) *Session {
	cctx, cancel := context.WithCancel(ctx)
	lang := req.Language
	if lang == "" || strings.EqualFold(lang, "auto") {
		lang = detectLang(req.Text)
	}
	seed := time.Now().UnixNano() & 0x3fffffff
	cfg := DefaultSegCfg(prof)
	if req.Mode == "chat" {
		// conversational answers: slightly shorter breath groups -> lower latency
		cfg.FirstMin, cfg.FirstMax = 6, 15
		cfg.Min, cfg.Target, cfg.Max = 10, 22, 56
	}
	return &Session{
		ID: newID(), ctx: cctx, cancel: cancel, t0: time.Now(), profile: prof, lang: lang, seed: seed,
		sched: a.sched, seg: NewSegmenter(cfg, seed), wake: make(chan struct{}, 1),
		timeline: map[string]float64{}, mode: req.Mode,
	}
}

func (a *App) speak(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]string{"error": "POST only"})
		return
	}
	var req SpeakReq
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<20)).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json: " + err.Error()})
		return
	}
	req.Text = strings.TrimSpace(req.Text)
	if req.Text == "" {
		writeJSON(w, 400, map[string]string{"error": "text is empty"})
		return
	}
	if req.Mode != "read" {
		req.Mode = "chat"
	}
	pid := req.Profile
	if pid == "" {
		pid = activeProfileID(a.cfg.StateDir)
	}
	if pid == "" {
		writeJSON(w, 400, map[string]string{"error": errNoProfile.Error()})
		return
	}
	prof, err := loadProfileInfo(a.cfg.StateDir, pid)
	if err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	fl, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, 500, map[string]string{"error": "streaming unsupported"})
		return
	}
	sess := a.newSession(r.Context(), req, prof)
	a.metrics.register(sess)
	defer a.metrics.unregister(sess.ID)
	h := w.Header()
	h.Set("Content-Type", "application/octet-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Accel-Buffering", "no")
	h.Set("X-Session-Id", sess.ID)
	h.Set("Access-Control-Expose-Headers", "X-Session-Id")
	w.WriteHeader(200)
	fl.Flush()

	key := r.Header.Get("X-DeepSeek-Key")
	if key == "" {
		key = a.cfg.LLMKey
	}
	go sess.produce(a.cfg, req, key)
	sess.serve(w, fl, a.metrics)
}

func (a *App) telemetry(w http.ResponseWriter, r *http.Request) {
	var t Telemetry
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&t); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	s := a.metrics.get(t.Session)
	if s == nil {
		writeJSON(w, 404, map[string]string{"error": "no such session"})
		return
	}
	s.telemetry(t)
	w.WriteHeader(204)
}

func (a *App) report(w http.ResponseWriter, r *http.Request) {
	var m map[string]any
	if err := json.NewDecoder(io.LimitReader(r.Body, 256<<10)).Decode(&m); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	id, _ := m["session"].(string)
	writeJSON(w, 200, map[string]bool{"merged": a.metrics.mergeClient(id, m)})
}

func (a *App) health(w http.ResponseWriter, r *http.Request) {
	ws := a.sched.Snapshots()
	healthy := 0
	for _, x := range ws {
		if b, _ := x["healthy"].(bool); b {
			healthy++
		}
	}
	writeJSON(w, 200, map[string]any{
		"ok": true, "workers_total": len(ws), "workers_healthy": healthy, "workers": ws,
		"agg_rtf": a.sched.AggRTF(), "policy": policyFor(a.sched.AggRTF(), 0),
		"llm_key_set": a.cfg.LLMKey != "", "llm_model": a.cfg.LLMModel,
		"active_profile":  activeProfileID(a.cfg.StateDir),
		"active_sessions": a.metrics.activeCount(),
	})
}

// config exposes the *actual* runtime configuration so the UI never has to guess.
func (a *App) config(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"sample_rate": sampleRate,
		"model":       env("QTTS_MODEL", "Qwen/Qwen3-TTS-12Hz-1.7B-Base"),
		"workers":     a.cfg.WorkerURLs,
		"analyst":     a.cfg.AnalystURL,
		"llm": map[string]any{
			"base": a.cfg.LLMBase, "model": a.cfg.LLMModel, "max_tokens": a.cfg.MaxTokens,
			"temperature": a.cfg.Temperature, "reasoning": a.cfg.LLMReasoning,
			"key_set": a.cfg.LLMKey != "",
		},
		"policy":         policyFor(a.sched.AggRTF(), 0),
		"active_profile": activeProfileID(a.cfg.StateDir),
		"version":        buildVersion,
	})
}

func (a *App) llmModels(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("X-DeepSeek-Key")
	if key == "" {
		key = a.cfg.LLMKey
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	models, err := LLMModels(ctx, a.cfg, key)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error(), "models": []any{}})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "models": models})
}

func (a *App) listProfiles(w http.ResponseWriter, r *http.Request) {
	dir := filepath.Join(a.cfg.StateDir, "profiles")
	ents, _ := os.ReadDir(dir)
	out := []map[string]any{}
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, e.Name(), "profile.json"))
		if err != nil {
			continue
		}
		var m map[string]any
		if json.Unmarshal(b, &m) == nil {
			out = append(out, m)
		}
	}
	sort.Slice(out, func(i, j int) bool { return fmt.Sprint(out[i]["created"]) > fmt.Sprint(out[j]["created"]) })
	writeJSON(w, 200, map[string]any{"profiles": out, "active": activeProfileID(a.cfg.StateDir)})
}

// activate selects the profile and makes every GPU worker build its voice-clone prompt cache.
func (a *App) activate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil || req.ID == "" {
		writeJSON(w, 400, map[string]string{"error": "id required"})
		return
	}
	if _, err := loadProfileInfo(a.cfg.StateDir, req.ID); err != nil {
		writeJSON(w, 404, map[string]string{"error": err.Error()})
		return
	}
	b, _ := json.Marshal(map[string]string{"id": req.ID})
	tmp := filepath.Join(a.cfg.StateDir, "active.json.tmp")
	if err := os.WriteFile(tmp, b, 0o644); err == nil {
		_ = os.Rename(tmp, filepath.Join(a.cfg.StateDir, "active.json"))
	}
	res := make([]map[string]any, len(a.cfg.WorkerURLs))
	var wg sync.WaitGroup
	hc := &http.Client{Timeout: 15 * time.Minute}
	for i, u := range a.cfg.WorkerURLs {
		wg.Add(1)
		go func(i int, u string) {
			defer wg.Done()
			body, _ := json.Marshal(map[string]string{"profile": req.ID})
			resp, err := hc.Post(u+"/profile/load", "application/json", bytes.NewReader(body))
			if err != nil {
				res[i] = map[string]any{"ok": false, "error": err.Error()}
				return
			}
			defer resp.Body.Close()
			var m map[string]any
			_ = json.NewDecoder(resp.Body).Decode(&m)
			res[i] = m
		}(i, u)
	}
	wg.Wait()
	writeJSON(w, 200, map[string]any{"active": req.ID, "workers": res})
}

func (a *App) proxy() http.Handler {
	u, _ := url.Parse(a.cfg.AnalystURL)
	rp := httputil.NewSingleHostReverseProxy(u)
	rp.FlushInterval = -1
	orig := rp.Director
	rp.Director = func(r *http.Request) {
		orig(r)
		r.URL.Path = strings.TrimPrefix(r.URL.Path, "/api/prep")
		if r.URL.Path == "" {
			r.URL.Path = "/"
		}
		r.Host = u.Host
	}
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		writeJSON(w, 502, map[string]string{"error": "analyst service unavailable: " + err.Error()})
	}
	return rp
}

// cors keeps the browser able to talk to the gateway from any origin (the page
// may be opened from the Kaggle tunnel while the API is on localhost).
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Headers", "Content-Type, X-DeepSeek-Key, X-Requested-With")
		h.Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		h.Set("Access-Control-Allow-Private-Network", "true")
		h.Set("Access-Control-Expose-Headers", "X-Session-Id")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *App) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", a.health)
	mux.HandleFunc("/api/config", a.config)
	mux.HandleFunc("/api/workers", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, a.sched.Snapshots()) })
	mux.HandleFunc("/api/metrics", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, a.metrics.snapshot()) })
	mux.HandleFunc("/api/speak", a.speak)
	mux.HandleFunc("/api/telemetry", a.telemetry)
	mux.HandleFunc("/api/report", a.report)
	mux.HandleFunc("/api/profiles", a.listProfiles)
	mux.HandleFunc("/api/profiles/activate", a.activate)
	mux.HandleFunc("/api/llm/models", a.llmModels)
	// voice chat
	mux.HandleFunc("/api/chat/interrupt", a.interrupt)
	mux.HandleFunc("/api/chat/asr", a.chatASR)
	mux.HandleFunc("/api/chat/state", a.chatState)
	mux.Handle("/api/prep/", a.proxy())
	// the one-cell bundle, so the browser "Launchpad" can copy it straight to Kaggle
	mux.HandleFunc("/deploy/bundle", a.deployBundle)
	fs := http.FileServer(http.Dir(a.cfg.WebDir))
	mux.Handle("/", fs)
	// Nothing is ever cached: a stale module graph next to fresh HTML is the
	// classic "page renders but every button is dead" failure mode.
	nostore := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
	return cors(nostore)
}

func main() {
	cfg := loadConfig()
	sched := NewScheduler(cfg.WorkerURLs)
	sched.Start()
	app := &App{cfg: cfg, sched: sched, metrics: NewMetrics()}
	go PreconnectLLM(cfg.LLMBase)
	srv := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", cfg.Bind, cfg.Port),
		Handler:           app.routes(),
		ReadHeaderTimeout: 15 * time.Second,
		IdleTimeout:       180 * time.Second,
	}
	log.Printf("qtts gateway on %s  workers=%v analyst=%s web=%s llm=%s key=%v",
		srv.Addr, cfg.WorkerURLs, cfg.AnalystURL, cfg.WebDir, cfg.LLMModel, cfg.LLMKey != "")

	// graceful shutdown: stop accepting, cancel live sessions, let workers exit
	idle := make(chan struct{})
	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		log.Printf("shutting down…")
		app.metrics.cancelAll("shutdown")
		sched.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		close(idle)
	}()
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
	<-idle
}
