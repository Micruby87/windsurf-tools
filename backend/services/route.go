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
	"time"
	"windsurf-tools-wails/backend/models"
	"windsurf-tools-wails/backend/utils"
)

// Router MITM 入口分流时由 App 注入的实现。隔离接口避免 services 反向依赖 store。
type Router interface {
	// RouteMode 当前总览胶囊状态;空 / "pool" → 走号池;"providers" → 提供商分流
	RouteMode() string
	// ActiveAccount 返回当前全局唯一激活的 provider 账号。
	// 整库无激活卡时返回 (zero, false)。
	ActiveAccount() (models.ProviderAccount, bool)
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

	// 2. 选 provider 账号 — 阶段 3:全局唯一 activated 卡。同 model 多卡用户用
	// 总览「下一席位」按钮翻动,这里只取当前 active 那张。
	acc, ok := router.ActiveAccount()
	if !ok {
		writeErr("unavailable", "没有任何激活的 provider 账号")
		return
	}
	account := &acc
	provider := strings.TrimSpace(strings.ToLower(account.Provider))
	if provider == "" {
		writeErr("invalid_argument", "active provider 账号 provider 字段为空")
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
	utils.DLog("[Route] upstream request: %s %s", httpReq.Method, httpReq.URL.String())

	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		writeErr("unavailable", fmt.Sprintf("provider 上游不可达 [%s]: %v", provider, err))
		return
	}
	defer resp.Body.Close()
	utils.DLog("[Route] upstream response: HTTP %d, Content-Type=%s", resp.StatusCode, resp.Header.Get("Content-Type"))

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		writeErr("upstream_error",
			fmt.Sprintf("provider=%s HTTP %d: %s",
				provider, resp.StatusCode, strings.TrimSpace(string(body))))
		return
	}

	// 5. 流式翻译: 上游 SSE delta → cascade text frame(实时 flush)
	//    同时处理 tool_calls → cascade F6 frame
	utils.DLog("[Route] 开始流式翻译: provider=%s model=%s", provider, model)
	hasToolCalls, err := streamSSEAsCascade(resp.Body, provider, writeText, func(tc OpenAIToolCallDelta) {
		utils.DLog("[Route] tool_call delta: idx=%d id=%q name=%q args=%q", tc.Index, tc.ID, tc.Name, tc.ArgsDelta)
		if tc.ID != "" || tc.Name != "" {
			// 工具调用头帧: 携带 id + name
			writeFrame(EncodeCascadeToolCallFrame(botID, seq, tc.ID, tc.Name, ""))
			seq++
		}
		if tc.ArgsDelta != "" {
			// JSON input 增量帧
			writeFrame(EncodeCascadeToolCallFrame(botID, seq, "", "", tc.ArgsDelta))
			seq++
		}
	})
	if err != nil {
		writeErr("internal", "流式解析失败: "+err.Error())
		return
	}

	if hasToolCalls {
		writeFrame(EncodeCascadeEOTFrameToolCalls(botID, seq, false))
		seq++
		writeFrame(EncodeCascadeEOSSuccess())
	} else {
		writeEnd()
	}
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
	Model    string               `json:"model"`
	Messages []json.RawMessage    `json:"messages"`
	Stream   bool                 `json:"stream"`
	Tools    []openAITool         `json:"tools,omitempty"`
}

type openAITool struct {
	Type     string         `json:"type"`
	Function openAIFunction `json:"function"`
}

type openAIFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
}

func buildOpenAICompatRequest(acc *models.ProviderAccount, model string, ir *CascadeChatRequest) (*http.Request, error) {
	msgs := buildOpenAIMessages(ir)

	payload := openAICompatPayload{
		Model:    model,
		Messages: msgs,
		Stream:   true,
	}
	for _, t := range ir.Tools {
		var params json.RawMessage
		if t.Schema != "" {
			params = json.RawMessage(t.Schema)
		}
		payload.Tools = append(payload.Tools, openAITool{
			Type: "function",
			Function: openAIFunction{
				Name:        t.Name,
				Description: t.Description,
				Parameters:  params,
			},
		})
	}

	body, err := json.Marshal(payload)
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

// buildOpenAIMessages 将 CascadeMessage 列表转为 OpenAI Chat 格式的 JSON 消息数组。
func buildOpenAIMessages(ir *CascadeChatRequest) []json.RawMessage {
	var msgs []json.RawMessage
	if strings.TrimSpace(ir.System) != "" {
		m, _ := json.Marshal(map[string]string{"role": "system", "content": ir.System})
		msgs = append(msgs, m)
	}
	for _, cm := range ir.Messages {
		switch cm.Role {
		case "assistant":
			msg := map[string]interface{}{"role": "assistant"}
			if cm.Content != "" {
				msg["content"] = cm.Content
			} else {
				msg["content"] = nil
			}
			if len(cm.ToolUses) > 0 {
				var toolCalls []map[string]interface{}
				for _, tu := range cm.ToolUses {
					toolCalls = append(toolCalls, map[string]interface{}{
						"id":   tu.ID,
						"type": "function",
						"function": map[string]string{
							"name":      tu.Name,
							"arguments": tu.Input,
						},
					})
				}
				msg["tool_calls"] = toolCalls
			}
			m, _ := json.Marshal(msg)
			msgs = append(msgs, m)
		case "tool":
			msg := map[string]string{
				"role":         "tool",
				"content":      cm.Content,
				"tool_call_id": cm.ToolUseID,
			}
			m, _ := json.Marshal(msg)
			msgs = append(msgs, m)
		default:
			m, _ := json.Marshal(map[string]string{"role": "user", "content": cm.Content})
			msgs = append(msgs, m)
		}
	}
	return msgs
}

type anthropicPayload struct {
	Model    string          `json:"model"`
	System   string          `json:"system,omitempty"`
	Messages json.RawMessage `json:"messages"`
	Stream   bool            `json:"stream"`
	Tools    []anthropicTool `json:"tools,omitempty"`
}

type anthropicTool struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	InputSchema json.RawMessage `json:"input_schema"`
}

func buildAnthropicRequest(acc *models.ProviderAccount, model string, ir *CascadeChatRequest) (*http.Request, error) {
	msgs := buildAnthropicMessages(ir)
	if len(msgs) == 0 {
		return nil, fmt.Errorf("anthropic: messages 解码后为空")
	}

	msgsJSON, err := json.Marshal(msgs)
	if err != nil {
		return nil, err
	}

	payload := anthropicPayload{
		Model:    model,
		System:   ir.System,
		Messages: msgsJSON,
		Stream:   true,
	}
	for _, t := range ir.Tools {
		schema := json.RawMessage(`{"type":"object","properties":{}}`)
		if t.Schema != "" {
			schema = json.RawMessage(t.Schema)
		}
		payload.Tools = append(payload.Tools, anthropicTool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: schema,
		})
	}

	body, err := json.Marshal(payload)
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

// buildAnthropicMessages 将 CascadeMessage 转为 Anthropic Messages API 格式。
// assistant: content=[{type:text},{type:tool_use,id,name,input}]
// user/tool_result: content=[{type:text}] 或 content=[{type:tool_result,tool_use_id,content}]
func buildAnthropicMessages(ir *CascadeChatRequest) []map[string]interface{} {
	var msgs []map[string]interface{}
	for _, cm := range ir.Messages {
		if cm.Role == "system" {
			continue
		}
		switch cm.Role {
		case "assistant":
			var content []map[string]interface{}
			if cm.Content != "" {
				content = append(content, map[string]interface{}{
					"type": "text",
					"text": cm.Content,
				})
			}
			for _, tu := range cm.ToolUses {
				var input interface{}
				if err := json.Unmarshal([]byte(tu.Input), &input); err != nil {
					input = map[string]interface{}{}
				}
				content = append(content, map[string]interface{}{
					"type":  "tool_use",
					"id":    tu.ID,
					"name":  tu.Name,
					"input": input,
				})
			}
			if len(content) == 0 {
				content = append(content, map[string]interface{}{
					"type": "text",
					"text": "",
				})
			}
			msgs = append(msgs, map[string]interface{}{
				"role":    "assistant",
				"content": content,
			})
		case "tool":
			msgs = append(msgs, map[string]interface{}{
				"role": "user",
				"content": []map[string]interface{}{
					{
						"type":        "tool_result",
						"tool_use_id": cm.ToolUseID,
						"content":     cm.Content,
					},
				},
			})
		default:
			msgs = append(msgs, map[string]interface{}{
				"role": "user",
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": cm.Content,
					},
				},
			})
		}
	}
	return msgs
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
// emitToolCall 在识别到工具调用时被调用:
//   - 首帧(id+name 非空): 工具调用头
//   - 后续帧(argsDelta 非空): JSON input 增量
//
// 返回 hasToolCalls=true 表示本轮包含了工具调用。
//
// 终止信号(三家不同):
//   - OpenAI 兼容: data: [DONE]
//   - Anthropic: event: message_stop
//   - Gemini: 上游主动 close body(SSE 流自然结束)
func streamSSEAsCascade(body io.Reader, provider string, emit func(text string), emitToolCall func(tc OpenAIToolCallDelta)) (hasToolCalls bool, err error) {
	provider = strings.ToLower(provider)
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	lineCount := 0
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(line[5:])
		if data == "" || data == "[DONE]" {
			if data == "[DONE]" {
				utils.DLog("[SSE] [DONE] received, lineCount=%d hasToolCalls=%v", lineCount, hasToolCalls)
				return hasToolCalls, nil
			}
			continue
		}
		lineCount++
		// 前 5 条和含 tool_calls 的记录完整 data
		if lineCount <= 5 {
			utils.DLog("[SSE] line#%d data=%s", lineCount, truncateForLog(data, 500))
		}

		switch provider {
		case "anthropic":
			if isAnthropicStopEvent(data) {
				utils.DLog("[SSE] anthropic message_stop, lineCount=%d", lineCount)
				return hasToolCalls, nil
			}
			d := parseAnthropicSSEDeltaFull(data)
			if d.Text != "" {
				emit(d.Text)
			}
			if d.ToolStart != nil {
				hasToolCalls = true
				utils.DLog("[SSE] anthropic tool_use start: id=%q name=%q", d.ToolStart.ID, d.ToolStart.Name)
				if emitToolCall != nil {
					emitToolCall(OpenAIToolCallDelta{ID: d.ToolStart.ID, Name: d.ToolStart.Name})
				}
			}
			if d.ToolDelta != "" {
				hasToolCalls = true
				if emitToolCall != nil {
					emitToolCall(OpenAIToolCallDelta{ArgsDelta: d.ToolDelta})
				}
			}
		case "google":
			if text := parseGeminiSSEDelta(data); text != "" {
				emit(text)
			}
		default:
			d := parseOpenAISSEDeltaFull(data)
			if d.Content != "" {
				emit(d.Content)
			}
			for _, tc := range d.ToolCalls {
				hasToolCalls = true
				utils.DLog("[SSE] tool_call in SSE: idx=%d id=%q name=%q argsLen=%d", tc.Index, tc.ID, tc.Name, len(tc.ArgsDelta))
				if emitToolCall != nil {
					emitToolCall(tc)
				}
			}
		}
	}
	if err := scanner.Err(); err != nil && err != io.EOF {
		utils.DLog("[SSE] scanner error: %v", err)
		return hasToolCalls, err
	}
	utils.DLog("[SSE] stream ended naturally, lineCount=%d hasToolCalls=%v", lineCount, hasToolCalls)
	return hasToolCalls, nil
}

func truncateForLog(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// OpenAIToolCallDelta 表示流式 SSE 中的一个工具调用增量。
type OpenAIToolCallDelta struct {
	Index    int    // tool_calls 数组下标(通常 0)
	ID       string // 首帧携带 tool call id
	Name     string // 首帧携带函数名
	ArgsDelta string // 后续帧的 arguments 增量
}

// OpenAIDelta 表示一个 OpenAI SSE chunk 中的 delta 字段解析结果。
type OpenAIDelta struct {
	Content   string
	ToolCalls []OpenAIToolCallDelta
}

// parseOpenAISSEDeltaFull 解析 OpenAI Chat Completions SSE chunk，
// 同时提取 content 和 tool_calls。
func parseOpenAISSEDeltaFull(data string) OpenAIDelta {
	var payload struct {
		Choices []struct {
			Delta struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					Index    int    `json:"index"`
					ID       string `json:"id"`
					Type     string `json:"type"`
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"delta"`
		} `json:"choices"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return OpenAIDelta{}
	}
	if len(payload.Choices) == 0 {
		return OpenAIDelta{}
	}
	delta := payload.Choices[0].Delta
	result := OpenAIDelta{Content: delta.Content}
	for _, tc := range delta.ToolCalls {
		result.ToolCalls = append(result.ToolCalls, OpenAIToolCallDelta{
			Index:     tc.Index,
			ID:        tc.ID,
			Name:      tc.Function.Name,
			ArgsDelta: tc.Function.Arguments,
		})
	}
	return result
}

// parseOpenAISSEDelta 向后兼容 — 仅返回 content 文本。
func parseOpenAISSEDelta(data string) string {
	d := parseOpenAISSEDeltaFull(data)
	return d.Content
}

// Anthropic Messages SSE: 多种 event 类型;只关心 content_block_delta.delta.text
// AnthropicDelta 表示 Anthropic SSE 事件解析结果。
type AnthropicDelta struct {
	Text      string               // text_delta 文本
	Thinking  string               // thinking_delta 文本
	ToolStart *AnthropicToolStart  // content_block_start type=tool_use
	ToolDelta string               // input_json_delta 增量 JSON
}

type AnthropicToolStart struct {
	ID   string
	Name string
}

// parseAnthropicSSEDeltaFull 完整解析 Anthropic SSE 事件,
// 包括 text_delta / thinking_delta / tool_use start / input_json_delta。
func parseAnthropicSSEDeltaFull(data string) AnthropicDelta {
	var payload struct {
		Type         string `json:"type"`
		Index        int    `json:"index"`
		ContentBlock struct {
			Type string `json:"type"`
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"content_block"`
		Delta struct {
			Type        string `json:"type"`
			Text        string `json:"text"`
			Thinking    string `json:"thinking"`
			PartialJSON string `json:"partial_json"`
		} `json:"delta"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return AnthropicDelta{}
	}

	switch payload.Type {
	case "content_block_start":
		if payload.ContentBlock.Type == "tool_use" {
			return AnthropicDelta{
				ToolStart: &AnthropicToolStart{
					ID:   payload.ContentBlock.ID,
					Name: payload.ContentBlock.Name,
				},
			}
		}
	case "content_block_delta":
		switch payload.Delta.Type {
		case "text_delta":
			return AnthropicDelta{Text: payload.Delta.Text}
		case "thinking_delta":
			return AnthropicDelta{Thinking: payload.Delta.Thinking}
		case "input_json_delta":
			return AnthropicDelta{ToolDelta: payload.Delta.PartialJSON}
		}
	}
	return AnthropicDelta{}
}

func parseAnthropicSSEDelta(data string) string {
	d := parseAnthropicSSEDeltaFull(data)
	return d.Text
}

// isAnthropicStopEvent 检查 Anthropic SSE data 是否为 message_stop 终止帧。
// 流终止后即便上游不主动 close body 我们也能立即收尾, 避免 IDE 干等到超时。
func isAnthropicStopEvent(data string) bool {
	var payload struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil {
		return false
	}
	return payload.Type == "message_stop"
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

// routeTimeout 单次 IDE → provider 请求总超时(ctx 用)。
// 流式响应可能跑到 3min, 不能设太短。
const routeTimeout = 3 * time.Minute
