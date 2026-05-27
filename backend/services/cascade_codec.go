package services

// cascade_codec.go ── Cascade ↔ OpenAI/Anthropic/Gemini 双向编解码。
//
// 阶段 2-F:
//   ▸ Decode: IDE 发出的 GetChatMessage protobuf body → IR(model+messages+system)
//   ▸ Encode: 把上游 SSE 流式响应翻译为 cascade gRPC 流式 frame
//
// Cascade 协议要素(从 chat_proto.go 反向解出):
//
//   请求 body 字段(GetChatMessage):
//     F2  = system prompt (顶层 string)
//     F3  = chat messages (repeated)  子: F2=role(varint 1=user/2=bot), F3=content
//     F21 = model 名 (string, IDE 风格如 "claude-opus-4-7-medium")
//
//   响应流 frame 结构(每帧):
//     F1  = bot id "bot-XXXX"
//     F2  = {F1=unix_sec, F2=nanos} 时间戳子消息
//     F3  = string delta                ← 文本增量
//     F4  = varint 序号
//     F5  = varint end-of-turn 标志(末帧出现, 非 0)
//     F17 = 对话 UUID
//
//   gRPC envelope:
//     5 字节: [flag(1)] [length(BE32)]
//     flag bit 0 (0x01) = compressed (gzip)
//     flag bit 1 (0x02) = end-stream (Connect 终结帧, payload 是 JSON {error:{...}} 或 {})
//
// 编码策略(SSE delta → cascade):
//   每收到 OpenAI 一段 delta 文本 → 编一帧 (F1+F3+F4)
//   收到 [DONE] / Anthropic message_stop → 编 EOT 帧 (F1+F3+F4+F5=4) + 写 EOS frame {} 收尾
//   上游错误 → 写 EOS frame {error:{code,message}}

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"windsurf-tools-wails/backend/utils"
)

// ──────────────────────────────────────────────
// Decode: cascade GetChatMessage body → IR
// ──────────────────────────────────────────────

// CascadeChatRequest 是一次 GetChatMessage 解码后的极简 IR。
// 只保留协议转换最低需要 — 不含 metadata / generation config / conversation 上下文。
type CascadeChatRequest struct {
	// Model IDE 期望的 model 名(F21 字符串)。空字符串 = IDE 用 cascade 默认模型,
	// 此时上层应回落到卡片 ActiveModel。
	Model string
	// System 顶层 F2 system prompt(可空)
	System string
	// Messages 按 F3 出现顺序排列的对话列表
	Messages []ChatMessage
}

// DecodeCascadeChatRequest 解一段已经去 gRPC 5 字节 envelope+gzip 后的 protobuf body。
// 调用方负责先剥 envelope(用同包 stripGRPCEnvelopeMaybeGzip)。
//
// 找不到 messages 字段时返回错误 — 上层应跳过路由分流回落号池。
func DecodeCascadeChatRequest(body []byte) (*CascadeChatRequest, error) {
	if len(body) == 0 {
		return nil, fmt.Errorf("cascade decode: empty body")
	}
	fields := parseProtobuf(body)
	if len(fields) == 0 {
		return nil, fmt.Errorf("cascade decode: parseProtobuf 0 fields")
	}
	out := &CascadeChatRequest{}
	for _, f := range fields {
		switch {
		case f.FieldNum == 2 && f.WireType == 2:
			out.System = string(f.Bytes)
		case f.FieldNum == 3 && f.WireType == 2:
			msg, ok := decodeCascadeChatMessage(f.Bytes)
			if !ok {
				continue
			}
			out.Messages = append(out.Messages, msg)
		case f.FieldNum == 21 && f.WireType == 2:
			out.Model = strings.TrimSpace(string(f.Bytes))
		}
	}
	if len(out.Messages) == 0 && strings.TrimSpace(out.System) == "" {
		return nil, fmt.Errorf("cascade decode: 既无 system 也无 messages")
	}
	return out, nil
}

func decodeCascadeChatMessage(data []byte) (ChatMessage, bool) {
	subFields := parseProtobuf(data)
	var msg ChatMessage
	gotSomething := false
	for _, f := range subFields {
		switch {
		case f.FieldNum == 2 && f.WireType == 0:
			gotSomething = true
			switch f.Varint {
			case 1:
				msg.Role = "user"
			case 2:
				msg.Role = "assistant"
			default:
				msg.Role = "user"
			}
		case f.FieldNum == 3 && f.WireType == 2:
			msg.Content = string(f.Bytes)
			gotSomething = true
		}
	}
	if !gotSomething {
		return ChatMessage{}, false
	}
	if msg.Role == "" {
		msg.Role = "user"
	}
	return msg, true
}

// ──────────────────────────────────────────────
// Encode: IR text delta → cascade gRPC frame
// ──────────────────────────────────────────────

// EncodeCascadeDeltaFrame 把一段文本 delta 编成一个 cascade 数据帧
// (5 字节 envelope + protobuf body)。
//
// botID 在整个流期间保持稳定(用于 IDE 端关联消息);seq 从 0 单调递增。
// gzipPayload=true 时 envelope flag 设 0x01 + payload gzip 压缩(IDE 兼容两种)。
func EncodeCascadeDeltaFrame(botID, delta string, seq uint64, gzipPayload bool) []byte {
	payload := buildCascadeFramePayload(botID, delta, seq, false)
	return wrapEnvelope(payload, 0x00, gzipPayload)
}

// EncodeCascadeEOTFrame 编一个"end-of-turn"数据帧 — F5 标志位非零让 IDE 知道
// 本轮回复结束(但流可能还没关,后面还有 EOS frame 收尾)。
func EncodeCascadeEOTFrame(botID string, seq uint64, gzipPayload bool) []byte {
	payload := buildCascadeFramePayload(botID, "", seq, true)
	return wrapEnvelope(payload, 0x00, gzipPayload)
}

// EncodeCascadeEOSSuccess 编 Connect 协议的成功结束帧(EOS, flag=0x02, body={})。
func EncodeCascadeEOSSuccess() []byte {
	return wrapEnvelope([]byte("{}"), 0x02, false)
}

// EncodeCascadeEOSError 编 Connect 协议的错误结束帧(EOS, flag=0x02, body={"error":{...}})。
//
// code 应为 Connect 错误码("unauthenticated" / "resource_exhausted" / "internal" / ...);
// message 是人类可读的解释(IDE 会展示给用户看)。
func EncodeCascadeEOSError(code, message string) []byte {
	payload := ConnectEOSPayload{
		Error: &ConnectError{Code: code, Message: message},
	}
	body, _ := json.Marshal(payload)
	return wrapEnvelope(body, 0x02, false)
}

// buildCascadeFramePayload 构造一帧响应的 protobuf payload(不含 5 字节 envelope)。
//
// 字段布局:
//
//	F1  = bot id (string)
//	F2  = sub-message{F1=unix_sec, F2=nanos}
//	F3  = delta string  (空字符串时跳过 — 末帧 EOT 没有文本只有 F5)
//	F4  = seq varint
//	F5  = end-of-turn varint (4 是 IDE 抓包观察到的常见值)
func buildCascadeFramePayload(botID, delta string, seq uint64, isEOT bool) []byte {
	var body []byte
	body = append(body, utils.EncodeStringField(1, botID)...)

	now := time.Now()
	var ts []byte
	ts = append(ts, encodeVarintField(1, uint64(now.Unix()))...)
	ts = append(ts, encodeVarintField(2, uint64(now.Nanosecond()))...)
	body = append(body, encodeBytesField(2, ts)...)

	if delta != "" {
		body = append(body, utils.EncodeStringField(3, delta)...)
	}
	body = append(body, encodeVarintField(4, seq)...)
	if isEOT {
		body = append(body, encodeVarintField(5, 4)...)
	}
	return body
}

// wrapEnvelope 给 protobuf payload 加 5 字节 Connect/gRPC 信封。
//
// flag 取 0x00(数据帧) 或 0x02(EOS Connect 终结帧)。
// gzipBody=true 时 payload 走 gzip 压缩并在 flag 上 OR 0x01。
func wrapEnvelope(payload []byte, flag byte, gzipBody bool) []byte {
	body := payload
	if gzipBody {
		var buf bytes.Buffer
		gw := gzip.NewWriter(&buf)
		_, _ = gw.Write(payload)
		_ = gw.Close()
		body = buf.Bytes()
		flag |= 0x01
	}
	out := make([]byte, 5+len(body))
	out[0] = flag
	binary.BigEndian.PutUint32(out[1:5], uint32(len(body)))
	copy(out[5:], body)
	return out
}

// NewCascadeBotID 生成一个 cascade 风格的 bot id ("bot-" + 12 hex)。
// 流式响应每个 turn 用同一个 bot id 关联所有数据帧。
func NewCascadeBotID() string {
	return "bot-" + generateStableHexHash()[:12]
}
