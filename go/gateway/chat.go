package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const buildVersion = "2.0.0"

// ---------------------------------------------------------------------------
// Voice chat endpoints
//
// Flow (all frames are the same binary protocol as /api/speak):
//
//   browser mic --(PCM wav)--> POST /api/chat/asr --> analyst (faster-whisper)
//   browser     --POST /api/speak (mode=chat, text=transcript)-->
//   gateway: DeepSeek V4 (stream) -> prosody segmenter -> 2x T4 -> cloned PCM
//   browser: POST /api/chat/interrupt {session}  -> barge-in (stops everything)
// ---------------------------------------------------------------------------

// interrupt implements barge-in: the running session is cancelled server side
// (LLM stream, queued segments and the running GPU job) and the browser is told.
func (a *App) interrupt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]string{"error": "POST only"})
		return
	}
	var body struct {
		Session string `json:"session"`
		All     bool   `json:"all"`
		Reason  string `json:"reason"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&body)
	if body.Reason == "" {
		body.Reason = "user"
	}
	if body.All {
		n := a.metrics.cancelAll(body.Reason)
		writeJSON(w, 200, map[string]any{"ok": true, "interrupted": n})
		return
	}
	if body.Session == "" {
		writeJSON(w, 400, map[string]string{"error": "session required"})
		return
	}
	s := a.metrics.get(body.Session)
	if s == nil {
		writeJSON(w, 404, map[string]string{"error": "no such session"})
		return
	}
	ok := s.Interrupt(body.Reason)
	writeJSON(w, 200, map[string]any{"ok": true, "interrupted": ok, "session": body.Session})
}

// chatASR forwards the microphone recording to the analyst's ASR endpoint.
// The raw multipart body is streamed through unchanged.
func (a *App) chatASR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, map[string]string{"error": "POST only"})
		return
	}
	target := strings.TrimRight(a.cfg.AnalystURL, "/") + "/asr"
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, target, r.Body)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))
	req.Header.Set("Accept", "application/json")
	hc := &http.Client{Timeout: 5 * time.Minute}
	resp, err := hc.Do(req)
	if err != nil {
		writeJSON(w, 502, map[string]string{"error": "asr service unavailable: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	for k, v := range resp.Header {
		w.Header()[k] = v
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// SessionInfo is a compact view of a live session (used by the UI badge).
type SessionInfo struct {
	ID          string  `json:"id"`
	Profile     string  `json:"profile"`
	Mode        string  `json:"mode"`
	AgeS        float64 `json:"age_s"`
	ProducedS   float64 `json:"produced_s"`
	PlayedS     float64 `json:"played_s"`
	Underruns   int     `json:"underruns"`
	Interrupted bool    `json:"interrupted"`
}

// chatState reports what the gateway is doing right now (used by the UI badge).
func (a *App) chatState(w http.ResponseWriter, r *http.Request) {
	out := a.metrics.snapshotSessions()
	writeJSON(w, 200, map[string]any{"sessions": out, "count": len(out)})
}

// deployBundle serves the one-cell Kaggle script so the browser Launchpad can
// copy it straight into a notebook.
func (a *App) deployBundle(w http.ResponseWriter, r *http.Request) {
	candidates := []string{
		filepath.Join(a.cfg.Root, "yuyinkelong"),
		filepath.Join(a.cfg.StateDir, "..", "yuyinkelong"),
		"yuyinkelong",
	}
	for _, c := range candidates {
		b, err := os.ReadFile(c)
		if err != nil {
			continue
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", `inline; filename="yuyinkelong"`)
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(b)
		return
	}
	writeJSON(w, 404, map[string]string{"error": "bundle not found in " + a.cfg.Root})
}
