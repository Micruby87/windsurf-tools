package main

// app_shell.go ── 跨平台调起系统默认应用打开文件 / 在 Finder/Explorer
// 中显示文件位置。给 OpenJailbreakOverrideFile / RevealJailbreakOverrideFolder
// 等 App 方法使用。

import (
	"fmt"
	"os/exec"
	"runtime"
)

// openPathWithSystem 用系统默认应用打开文件。
//   - macOS: `open <path>` → 用 Finder 注册的默认 app（.md 一般是 TextEdit）
//   - Windows: `cmd /c start "" <path>`
//   - Linux: `xdg-open <path>`
//
// 不阻塞等待编辑器退出（用 Start 而非 Run），即返回。
func openPathWithSystem(path string) error {
	if path == "" {
		return fmt.Errorf("empty path")
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		// 用 cmd /c start 而非直接 explorer，让 Windows 默认 app 关联生效
		cmd = exec.Command("cmd", "/c", "start", "", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("open failed: %w", err)
	}
	return nil
}

// revealPathInFileManager 在文件管理器中选中并显示文件位置。
//   - macOS: `open -R <path>` → Finder 高亮该文件
//   - Windows: `explorer /select,<path>`
//   - Linux: 退化为打开父目录（`xdg-open <dir>`），因为 xdg 无 reveal 概念
func revealPathInFileManager(path string) error {
	if path == "" {
		return fmt.Errorf("empty path")
	}
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-R", path)
	case "windows":
		cmd = exec.Command("explorer", "/select,"+path)
	default:
		// Linux: 没有标准 "reveal" 命令，打开父目录退化处理
		dir := path
		if i := lastSepIndex(path); i > 0 {
			dir = path[:i]
		}
		cmd = exec.Command("xdg-open", dir)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("reveal failed: %w", err)
	}
	return nil
}

func lastSepIndex(s string) int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i] == '/' || s[i] == '\\' {
			return i
		}
	}
	return -1
}
