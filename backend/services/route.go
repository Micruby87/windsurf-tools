package services

// provider_transport.go ── 提供商上游传输层。
//
// MITM 入口判定胶囊=providers + chat path 命中后, 把 cascade body 喂给本文件:
//   1. DecodeCascadeChatRequest 拆出 model + messages
//   2. 选 ProviderAccount(同 provider 多卡 round-robin)
//   3. 走 *http.Client(承袭 MitmProxy.upstreamBase 的 Clash/系统代理)
//      发 OpenAI/Anthropic/Gemini 上游请求
//   4. 上游 SSE 流式响应 → cascade gRPC frame 实时回写到 IDE ResponseWriter
//   5. 上游错误 / 流结束 → 写 Connect EOS frame 收尾
//
// 复用同包 cascade_codec.go 的 Encode* helpers — 不在这里直接拼字节。

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"windsurf-tools-wails/backend/models"
)

// Router MITM 入口分流时由 App 注入的实现。隔离接口避免 services 反向依赖 store。
type Router interface {
	// RouteMode 当前总览胶囊状态;空 / "pool" → 走号池;"providers" → 提供商分流
	RouteMode() string
	// ActivatedAccounts 按 provider 拿激活账号(按 ID 排序保证轮询稳定)
	ActivatedAccounts(provider string) []models.ProviderAccount
}

// Route 处理一次 IDE chat 请求 — 整个生命周期都在这里。
//
// w 应该是 MITM ServeHTTP 的 ResponseWriter;cascadeBody 是已剥 envelope+gzip 的
// 原始 protobuf body;httpClient 通常注入 MitmProxy.upstreamBase 包装的 client。
//
// 写响应规则(对齐 Connect 流式):
//   - status: 200
//   - Content-Type: application/connect+proto
//   - body: 一连串 5 字节 envelope 数据帧(F1+F3+F4) + 末尾 EOT 帧 + EOS frame
//
// 路由 / 选账号失败时仍写 200 + 单个 EOS error frame(IDE 才能正确解析为错误而不是连接中断)。
func Route(
	ctx context.Context,
	w http.ResponseWriter,
	httpClient *http.Client,
	router Router,
	cascadeBody []byte,
) {
	// 提前固化响应头 — 后续无论成功/失败都走 cascade frame
	w.Header().Set("Content-Type", "application/connect+proto")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	flusher, _ := w.(http.Flusher)

	botID := NewCascadeBotID()
	var seq uint64

	writeFrame := func(b []byte) {
		_, _ = w.Write(b)
		if flusher != nil {
			flusher.Flush()
		}
	}
	writeText := func(text string) {
		if text == "" {
			return
		}
		writeFrame(EncodeCascadeDeltaFrame(botID, text, seq, false))
		seq++
	}
	writeEnd := func() {
		writeFrame(EncodeCascadeEOTFrame(botID, seq, false))
		seq++
		writeFrame(EncodeCascadeEOSSuccess())
	}
	writeErr := func(code, message string) {
		writeFrame(EncodeCascadeEOSError(code, message))
	}

	// 1. 解 cascade 请求
	decoded, err := DecodeCascadeChatRequest(cascadeBody)
	if err != nil {
		writeErr("invalid_argument", "无法解 cascade 请求: "+err.Error())
		return
	}

	// 2. 选 provider 账号
	provider, account := pickProviderAccount(router, decoded.Model)
	if account == nil {
		writeErr("unavailable", "没有任何激活的 provider 账号")
		return
	}

	// 3. 决定真实下发的 model 名(卡片 ActiveModel 优先, 兜底用 IDE 传的)
	model := strings.TrimSpace(account.ActiveModel)
	if model == "" {
		model = decoded.Model
	}
	if model == "" {
		writeErr("invalid_argument",
			fmt.Sprintf("provider=%s 账号未设 active_model 且 IDE 未带 model 名", provider))
		return
	}

	// 4. 编上游 HTTP 请求
	httpReq, err := buildProviderHTTPRequest(provider, account, model, decoded)
	if err != nil {
		writeErr("internal", "构造 provider 请求失败: "+err.Error())
		return
	}
	httpReq = httpReq.WithContext(ctx)

	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		writeErr("unavailable", fmt.Sprintf("provider 上游不可达 [%s]: %v", provider, err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		writeErr("upstream_error",
			fmt.Sprintf("provider=%s HTTP %d: %s",
				provider, resp.StatusCode, strings.TrimSpace(string(body))))
		return
	}

	// 5. 流式翻译: 上游 SSE delta → cascade text frame(实时 flush)
	if err := streamSSEAsCascade(resp.Body, provider, writeText); err != nil {
		writeErr("internal", "流式解析失败: "+err.Error())
		return
	}

	writeEnd()
}

// ──────────────────────────────────────────────
// pickProviderAccount: 选哪家 provider 的哪张卡
// ──────────────────────────────────────────────

var routeRRCounters sync.Map // map[string]*atomic.Uint64

// pickProviderAccount 阶段 2 简化版:按优先级遍历 provider, 命中第一个有
// 激活账号的 provider 内做 round-robin。后续阶段 3 model_discovery 接入后改为
// 按 model 名反查表。
func pickProviderAccount(router Router, modelHint string) (string, *models.ProviderAccount) {
	priority := []string{
		"openai", "anthropic", "google",
		"deepseek", "moonshot", "qwen", "xai",
		"zhipu", "minimax", "doubao",
	}
	for _, p := range priority {
		accs := router.ActivatedAccounts(p)
		if len(accs) == 0 {
			continue
		}
		v, _ := routeRRCounters.LoadOrStore(p, new(atomic.Uint64))
		idx := int((v.(*atomic.Uint64).Add(1) - 1) % uint64(len(accs)))
		acc := accs[idx]
		return p, &acc
	}
	return "", nil
}

// ──────────────────────────────────────────────
// buildProviderHTTPRequest: IR → 三家上游 *http.Request
// ──────────────────────────────────────────────

func buildProviderHTTPRequest(provider string, acc *models.ProviderAccount, model string, ir *CascadeChatRequest) (*http.Request, error) {
	provider = strings.ToLower(provider)
	switch provider {
	case "anthropic":
		return buildAnthropicRequest(acc, model, ir)
	case "google":
		return buildGeminiRequest(acc, model, ir)
	default:
		// openai / deepseek / moonshot / qwen / xai / zhipu / minimax / doubao
		return buildOpenAICompatRequest(acc, model, ir)
	}
}

type openAICompatPayload struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

func buildOpenAICompatRequest(acc *models.ProviderAccount, model string, ir *CascadeChatRequest) (*http.Request, error) {
	msgs := make([]ChatMessage, 0, len(ir.Messages)+1)
	if strings.TrimSpace(ir.System) != "" {
		msgs = append(msgs, ChatMessage{Role: "system", Content: ir.System})
	}
	msgs = append(msgs, ir.Messages...)
	body, err := json.Marshal(openAICompatPayload{
		Model:    model,
		Messages: msgs,
		Stream:   true,
	})
	if err != nil {
		return nil, err
	}
	endpoint := strings.TrimRight(acc.BaseURL, "/") + "/v1/chat/completions"
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+acc.AuthToken)
	req.Header.Set("Accept", "text/event-stream")
	return req, nil
}

type anthropicPayload struct {
	Model     string                  `json:"model"`
	System    string                  `json:"system,omitempty"`
	Messages  []anthropicMessageEntry `json:"messages"`
	Stream    bool                    `json:"stream"`
	MaxTokens int                     `json:"max_tokens"`
}

type anthropicMessageEntry struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

const anthropicDefaultMaxTokens = 8192

func buildAnthropicRequest(acc *models.ProviderAccount, model string, ir *CascadeChatRequest) (*http.Request, error) {
	msgs := make([]anthropicMessageEntry, 0, len(ir.Messages))
	for _, m := range ir.Messages {
		if m.Role == "system" {
			continue
		}
		msgs = append(msgs, anthropicMessageEntry{Role: m.Role, Content: m.Content})
	}
	if len(msgs) == 0 {
		return nil, fmt.Errorf("anthropic: messages 解码后为空")
	}
	body, err := json.Marshal(anthropicPayload{
		Model:     model,
		System:    ir.System,
		Messages:  msgs,
		Stream:    true,
		MaxTokens: anthropicDefaultMaxTokens,
	})
	if err != nil {
		return nil, err
	}
	endpoint := strings.TrimRight(acc.BaseURL, "/") + "/v1/messages"
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", acc.AuthToken)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("Accept", "text/event-stream")
	return req, nil
}

type geminiPayload struct {
	Contents          []geminiContent       `json:"contents"`
	SystemInstruction *geminiSystemInstruct `json:"systemInstruction,omitempty"`
}

type geminiContent struct {
	Role  string              `json:"role"`
	Parts []geminiContentPart `json:"parts"`
}

type geminiContentPart struct {
	Text string `json:"text"`
}

type geminiSystemInstruct struct {
	Parts []geminiContentPart `json:"parts"`
}

func buildGeminiRequest(acc *models.ProviderAccount, model string, ir *CascadeChatRequest) (*http.Request, error) {
	contents := make([]geminiContent, 0, len(ir.Messages))
	for _, m := range ir.Messages {
		role := m.Role
		switch role {
		case "assistant":
			role = "model"
		case "system":
			continue
		case "":
			role = "user"
		}
		contents = append(contents, geminiContent{
			Role:  role,
			Parts: []geminiContentPart{{Text: m.Content}},
		})
	}
	if len(contents) == 0 {
		return nil, fmt.Errorf("gemini: contents 解码后为空")
	}
	payload := geminiPayload{Contents: contents}
	if strings.TrimSpace(ir.System) != "" {
		payload.SystemInstruction = &geminiSystemInstruct{
			Parts: []geminiContentPart{{Text: ir.System}},
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	// Gemini 流式必须用 streamGenerateContent + alt=sse
	endpoint := fmt.Sprintf("%s/v1beta/models/%s:streamGenerateContent?key=%s&alt=sse",
		strings.TrimRight(acc.BaseURL, "/"),
		url.PathEscape(model),
		url.QueryEscape(acc.AuthToken),
	)
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	return req, nil
}

// ──────────────────────────────────────────────
// streamSSEAsCascade: 三家流式响应 → 文本 delta 回调
// ──────────────────────────────────────────────

// streamSSEAsCascade 读上游 SSE 流, 调 emit(text) 把每段 delta 喂给 caller(由
// caller 编 cascade 帧 flush)。三家 SSE 字段名不同, 内部分支处理。
//
// 终止信号(三家不同):
//   - OpenAI 兼容: data: [DONE]
//   - Anthropic: event: message_stop
//   - Gemini: 上游主动 close body(SSE 流自然结束)
func streamSSEAsCascade(body io.Reader, provider string, emit func(text string)) error {
	provider = strings.ToLower(provider)
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		// SSE 字段格式: "data: ...". 其它字段(event:/id:/retry:)直接忽略
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(line[5:])
		if data == "" || data == "[DONE]" {
			if data == "[DONE]" {
				return nil
			}
			continue
		}

		switch provider {
		case "anthropic":
			if text := parseAnthropicSSEDelta(data); text != "" {
				emit(text)
			}
		case "google":
			if text := parseGeminiSSEDelta(data); text != "" {
				emit(text)
			}
		default:
			if text := parseOpenAISSEDelta(data); text != "" {
				emit(text)
			}
		}
	}
	if err := scanner.Err(); err != nil && err != io.EOF {
		return err
	}
	return nil
}

// OpenAI Chat Completions SSE: { "choices": [ {"delta": {"content": "..." } } ] }
func parseOpenAISSEDelta(data string) string {
	var payload struct {
		Choices []struct {
			Delta struct {
				Content string `json:"content"`
			} `json:"delta"`
		} `json:"choices"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return ""
	}
	if len(payload.Choices) == 0 {
		return ""
	}
	return payload.Choices[0].Delta.Content
}

// Anthropic Messages SSE: 多种 event 类型;只关心 content_block_delta.delta.text
func parseAnthropicSSEDelta(data string) string {
	var payload struct {
		Type  string `json:"type"`
		Delta struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"delta"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return ""
	}
	// Anthropic 流的 content_block_delta + text_delta 才是文字
	if payload.Type == "content_block_delta" && payload.Delta.Type == "text_delta" {
		return payload.Delta.Text
	}
	// 也兼容旧版 message_delta(无 type 嵌套, delta.text 直出)
	if payload.Delta.Text != "" {
		return payload.Delta.Text
	}
	return ""
}

// Gemini: { "candidates": [ {"content": {"parts": [{"text": "..."}]}} ] }
func parseGeminiSSEDelta(data string) string {
	var payload struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return ""
	}
	if len(payload.Candidates) == 0 {
		return ""
	}
	parts := payload.Candidates[0].Content.Parts
	if len(parts) == 0 {
		return ""
	}
	var sb strings.Builder
	for _, p := range parts {
		sb.WriteString(p.Text)
	}
	return sb.String()
}

// ──────────────────────────────────────────────
// providerHTTPClient — 拿一个能复用 MitmProxy 上游代理的 client
// ──────────────────────────────────────────────

// HTTPClientFromTransport 用任意 *http.Transport 包一个 *http.Client。
// 调用方传 MitmProxy.upstreamBase 进来 — 该 transport 已含 Clash/系统代理 + 连接池。
//
// 不设 client.Timeout(stream 场景全局 Timeout 反而会把流式打断), 由 ctx 控制。
// 没有 transport 时回退 DefaultClient。
func HTTPClientFromTransport(t http.RoundTripper) *http.Client {
	if t == nil {
		return http.DefaultClient
	}
	return &http.Client{
		Transport: t,
	}
}

// routeTimeout 单次 IDE → provider 请求总超时(ctx 用)。
// 流式响应可能跑到 3min, 不能设太短。
const routeTimeout = 3 * time.Minute
