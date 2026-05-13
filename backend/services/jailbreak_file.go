package services

// jailbreak_file.go ── 外部 override 文件支持。
//
// 设计动机：
//   原 patch-claude-v2.py 把 override 放在 ~/.claude/override.md，用户用自
//   己喜欢的编辑器维护、git 版本控制、跨机同步都方便。我们 MITM 方案默认
//   把 override 文本存在 settings.json 的 textarea 里 —— 这对短文本可以，
//   但用户想用复杂多段 prompt / 想跨多机共享时不友好。
//
//   增加「外部文件」来源：用户在 settings 里指定一个文件路径（默认
//   ~/.claude/override.md，与 Claude Code 共享），后端每次 chat 注入前
//   读取该文件内容当作 override。
//
//   两种来源由 settings.MitmJailbreakOverrideSource 决定：
//     - "inline" (默认)：用 settings.MitmJailbreakOverride textarea 的内容
//     - "file"        ：读取 MitmJailbreakOverrideFile 路径的文件
//   读取失败时降级到 inline（避免文件被误删导致破限突然失效）。

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	// JailbreakOverrideSourceInline 用 settings.MitmJailbreakOverride 字段
	JailbreakOverrideSourceInline = "inline"
	// JailbreakOverrideSourceFile 从 MitmJailbreakOverrideFile 路径读
	JailbreakOverrideSourceFile = "file"

	// 软文件大小上限：避免误指向几 MB 的文档导致每次注入读盘卡顿
	jailbreakFileMaxBytes = 64 * 1024 // 64 KB

	// 默认推荐文件路径（跨平台 home-relative）
	defaultJailbreakFileRel = ".claude/override.md"
)

// DefaultJailbreakOverrideFilePath 返回默认推荐路径 (~/.claude/override.md)
// 与 Claude Code 共享，方便已经在用 Claude Code patch 脚本的人无缝迁移。
func DefaultJailbreakOverrideFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, defaultJailbreakFileRel)
}

// ResolveJailbreakOverrideFilePath 把用户填的路径展开 ~ 并标准化。
// 空字符串返回默认路径。
func ResolveJailbreakOverrideFilePath(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DefaultJailbreakOverrideFilePath()
	}
	// 支持 ~ 展开
	if strings.HasPrefix(raw, "~") {
		if home, err := os.UserHomeDir(); err == nil {
			raw = filepath.Join(home, strings.TrimPrefix(raw, "~"))
		}
	}
	abs, err := filepath.Abs(raw)
	if err != nil {
		return raw
	}
	return abs
}

// LoadJailbreakOverrideFile 读取指定路径的 override 文件。
// 返回 (text, sourcePath, error)。
//   - path 为空 → 用默认路径
//   - 文件不存在/读失败 → 返回 error，调用方应降级到 inline
//   - 超过 size 上限 → 截断到上限并返回，避免内存膨胀
func LoadJailbreakOverrideFile(path string) (string, string, error) {
	resolved := ResolveJailbreakOverrideFilePath(path)
	if resolved == "" {
		return "", "", os.ErrInvalid
	}
	st, err := os.Stat(resolved)
	if err != nil {
		return "", resolved, err
	}
	if st.IsDir() {
		return "", resolved, os.ErrInvalid
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return "", resolved, err
	}
	if len(data) > jailbreakFileMaxBytes {
		data = data[:jailbreakFileMaxBytes]
	}
	return strings.TrimSpace(string(data)), resolved, nil
}

// SaveJailbreakOverrideFile 把 text 写入指定路径。
// 自动创建父目录。空 path 用默认路径。
func SaveJailbreakOverrideFile(path, text string) (string, error) {
	resolved := ResolveJailbreakOverrideFilePath(path)
	if resolved == "" {
		return "", os.ErrInvalid
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return resolved, err
	}
	if err := os.WriteFile(resolved, []byte(text), 0o644); err != nil {
		return resolved, err
	}
	return resolved, nil
}

// JailbreakOverrideFileExists 仅测试文件是否存在 + 可读，供 UI 状态显示。
func JailbreakOverrideFileExists(path string) bool {
	resolved := ResolveJailbreakOverrideFilePath(path)
	if resolved == "" {
		return false
	}
	st, err := os.Stat(resolved)
	if err != nil {
		return false
	}
	return !st.IsDir()
}

// JailbreakFileStatus UI 状态面板用的 DTO。
type JailbreakFileStatus struct {
	Path     string `json:"path"`           // 解析后的绝对路径
	Exists   bool   `json:"exists"`         // 文件存在 & 可读
	Size     int64  `json:"size"`           // 字节数
	Charset  string `json:"charset"`        // 简易编码探测："utf-8" / "binary"
	Excerpt  string `json:"excerpt"`        // 前 200 字符预览
	Truncated bool  `json:"truncated"`      // 是否超过 jailbreakFileMaxBytes
	IsDir    bool   `json:"is_dir"`         // 误指向目录的提示
	Error    string `json:"error,omitempty"`
}

// InspectJailbreakOverrideFile 返回文件元信息 + 摘要（不影响实际注入）。
func InspectJailbreakOverrideFile(path string) JailbreakFileStatus {
	resolved := ResolveJailbreakOverrideFilePath(path)
	status := JailbreakFileStatus{Path: resolved}
	if resolved == "" {
		status.Error = "无法解析路径"
		return status
	}
	st, err := os.Stat(resolved)
	if err != nil {
		status.Error = err.Error()
		return status
	}
	if st.IsDir() {
		status.IsDir = true
		status.Error = "路径指向目录而不是文件"
		return status
	}
	status.Exists = true
	status.Size = st.Size()
	data, err := os.ReadFile(resolved)
	if err != nil {
		status.Error = err.Error()
		return status
	}
	if int64(len(data)) > jailbreakFileMaxBytes {
		status.Truncated = true
	}
	if isMostlyText(data) {
		status.Charset = "utf-8"
	} else {
		status.Charset = "binary"
	}
	preview := strings.TrimSpace(string(data))
	if len(preview) > 200 {
		preview = preview[:200] + "…"
	}
	status.Excerpt = preview
	return status
}

// isMostlyText 简易判断：>85% 的字节是 ASCII 可打印 / UTF-8 多字节，则视为文本。
// 避免用户把 .png / .pdf 误选成 override 文件。
//
// UTF-8 编码：
//   - ASCII（0x00-0x7F）：单字节，可打印部分是 0x20-0x7E
//   - 多字节首字节（0xC2-0xF4）：标识 2/3/4 字节序列开始
//   - 多字节续字节（0x80-0xBF）：跟在首字节后面，必须 3 字节中文 = 1 首 + 2 续
//
// 三种都算 "text"，二进制随机字节 0xFE/0xFF 等以及 0x00-0x1F 不可打印控制字符不算。
func isMostlyText(data []byte) bool {
	if len(data) == 0 {
		return true
	}
	textChars := 0
	for _, b := range data {
		switch {
		case (b >= 0x20 && b < 0x7F), b == '\r', b == '\n', b == '\t':
			// ASCII 可打印 + 常见空白
			textChars++
		case b >= 0x80 && b <= 0xBF:
			// UTF-8 续字节
			textChars++
		case b >= 0xC2 && b <= 0xF4:
			// UTF-8 多字节首字节（0xC0/0xC1/0xF5+ 是非法 UTF-8 不算）
			textChars++
		}
	}
	return float64(textChars)/float64(len(data)) > 0.85
}

// IsWindowsRuntime returns true on Windows; used by callers that need to do
// OS-specific path handling. Wrapping runtime.GOOS keeps the dependency
// surface explicit.
func IsWindowsRuntime() bool {
	return runtime.GOOS == "windows"
}
