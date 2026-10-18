package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// LLM (OpenAI-compatible streaming chat endpoint: DeepSeek V4 family)
//
// Model ids as of 2026-10 (see api-docs.deepseek.com):
//
//	deepseek-flash      -> DeepSeek-V4.1-Flash   (1M ctx, up to 384K output)  DEFAULT
//	deepseek-v4-pro     -> DeepSeek-V4-Pro-0813  (1M ctx, up to 384K output)
//	deepseek-chat       -> legacy alias, RETIRED 2026-07-24 (kept for old configs)
//	deepseek-reasoner   -> legacy alias, RETIRED 2026-07-24
//
// Any other OpenAI-compatible id also works (self-hosted, vLLM, ...).
// ---------------------------------------------------------------------------

const (
	defaultLLMModel    = "deepseek-flash"
	defaultLLMBase     = "https://api.deepseek.com"
	defaultMaxTokens   = 4096
	absoluteMaxTokens  = 384000
	defaultTemperature = 0.7
)

// defaultSystemPrompt is the "concise" voice persona: short clauses, natural
// pauses, no markdown - the TTS speaks it out loud.
const defaultSystemPrompt = `你是一个正在和用户面对面聊天的真人，不是机器人。
说话要求：
1. 用自然、口语化的语言回答，使用用户所用的语言。
2. 不要使用任何markdown、列表、编号、表情符号、括号注释、代码或链接。
3. 句子要短，一句话尽量不超过25个字，用逗号和句号制造自然的停顿和换气点。
4. 数字、单位用口语读法写出来。
5. 先直接回答，再补充；除非用户要求更详细，总长度控制在200字以内。
6. 语气有温度，可以有轻微的语气词，但不要夸张。`

// detailedSystemPrompt is for long-form answers (the "详细" tone in the UI).
const detailedSystemPrompt = `你是一个知识渊博、表达流畅的真人语音助手，正在为用户做讲解。
说话要求：
1. 使用用户所用的语言，内容准确、结构清晰，可以展开讲解。
2. 不要使用markdown标题、代码块、表格、链接或表情符号；用自然语言把结构说出来。
3. 句子长度适中（20–45字），用句号和逗号制造自然停顿。
4. 数字、单位用口语读法写出来。
5. 内容可以较长（1000字以上），但每一段都要能独立听懂。
6. 语气自然、有温度，像在讲给人听，而不是在念稿。`

// technicalSystemPrompt is for explanations / code-adjacent answers.
const technicalSystemPrompt = `你是一个严谨的语音讲解助手，正在把复杂的技术内容讲给用户听。
说话要求：
1. 使用用户所用的语言，结论先行，再讲原因。
2. 不用markdown、代码块或符号堆砌；专有名词可以口头解释。
3. 句子不超过30字，用逗号和句号制造停顿。
4. 允许较长篇幅（500字以上），但要口语化。
5. 语气平稳、清晰。`

// SystemPromptFor returns the persona for a tone id.
func SystemPromptFor(tone string) string {
	switch strings.ToLower(strings.TrimSpace(tone)) {
	case "detailed", "long", "详细":
		return detailedSystemPrompt
	case "technical", "tech", "技术":
		return technicalSystemPrompt
	case "concise", "short", "简洁":
		return defaultSystemPrompt
	}
	return defaultSystemPrompt
}

type ChatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

var llmClient = &http.Client{
	Transport: &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          8,
		MaxIdleConnsPerHost:   4,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   8 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
	},
}

// PreconnectLLM opens (and parks) a TLS connection so the first real request skips the handshake.
func PreconnectLLM(base string) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(base, "/")+"/models", nil)
	if err != nil {
		return
	}
	resp, err := llmClient.Do(req)
	if err == nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

// LLMModels lists the model ids the endpoint exposes (best effort).
func LLMModels(ctx context.Context, cfg *Config, key string) ([]map[string]any, error) {
	if key == "" {
		return nil, errors.New("no api key")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(cfg.LLMBase, "/")+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := llmClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 500))
		return nil, fmt.Errorf("http %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var out struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if out.Data == nil {
		out.Data = []map[string]any{}
	}
	return out.Data, nil
}

// StreamLLM calls an OpenAI-compatible streaming chat endpoint and invokes onDelta
// for every content delta as soon as it arrives.
//
// onReasoning (optional) receives the model's thinking trace; it is never spoken.
// onMeta (optional) receives small events such as "thinking"/"answering".
func StreamLLM(ctx context.Context, cfg *Config, key string, msgs []ChatMsg,
	onDelta func(string), onReasoning func(string), onMeta func(string)) error {

	if key == "" {
		return errors.New("DEEPSEEK_API_KEY is not set (add it to Kaggle secrets, or paste it in the UI)")
	}

	body := map[string]any{
		"model":          cfg.LLMModel,
		"messages":       msgs,
		"stream":         true,
		"max_tokens":     cfg.MaxTokens,
		"stream_options": map[string]any{"include_usage": false},
	}
	// Reasoning models reject/ignore some sampling knobs; only send what is safe.
	if cfg.LLMReasoning {
		body["thinking"] = map[string]any{"type": "enabled"}
	} else if cfg.Temperature > 0 {
		body["temperature"] = cfg.Temperature
	}
	raw, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(cfg.LLMBase, "/")+"/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := llmClient.Do(req)
	if err != nil {
		return fmt.Errorf("llm request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 900))
		return fmt.Errorf("llm http %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	rd := bufio.NewReaderSize(resp.Body, 32*1024)
	thinking := false
	for {
		line, err := rd.ReadString('\n')
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "data:") {
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if data == "[DONE]" {
				return nil
			}
			var ch struct {
				Choices []struct {
					Delta struct {
						Content          string `json:"content"`
						ReasoningContent string `json:"reasoning_content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if json.Unmarshal([]byte(data), &ch) == nil && len(ch.Choices) > 0 {
				d := ch.Choices[0].Delta
				if d.ReasoningContent != "" {
					if !thinking {
						thinking = true
						if onMeta != nil {
							onMeta("thinking")
						}
					}
					if onReasoning != nil {
						onReasoning(d.ReasoningContent)
					}
				}
				if d.Content != "" {
					if thinking {
						thinking = false
						if onMeta != nil {
							onMeta("answering")
						}
					}
					if onDelta != nil {
						onDelta(d.Content)
					}
				}
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

// clampTokens keeps max_tokens inside the model range and above a sane floor.
func clampTokens(v int) int {
	if v <= 0 {
		return defaultMaxTokens
	}
	if v > absoluteMaxTokens {
		return absoluteMaxTokens
	}
	return v
}

// parseTokens reads a positive int from an env string, falling back to def.
func parseTokens(s string, def int) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil || v <= 0 {
		return def
	}
	return v
}
