//go:build windows || darwin

package main

import "github.com/getlantern/systray"

// startTray 在后台线程运行系统托盘。
// Windows: 系统通知区图标
// macOS: 顶部菜单栏图标（NSStatusItem，由 getlantern/systray 包装 Cocoa）
// Linux 暂未启用（依赖 dbus + libappindicator，发布构建复杂）
func (a *App) startTray() {
	go func() {
		systray.Run(a.onTrayReady, func() {})
	}()
}

func traySupported() bool { return true }

func (a *App) quitTray() {
	systray.Quit()
}

func (a *App) onTrayReady() {
	systray.SetIcon(currentTrayIcon())
	systray.SetTooltip("Windsurf Tools — 号池 · MITM · 切号")

	mShow := systray.AddMenuItem("显示主窗口", "恢复完整界面")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("退出并恢复环境", "完全退出应用，并清理 MITM hosts / 证书 / Codeium 配置")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				a.activateExistingWindow()
			case <-mQuit.ClickedCh:
				// 关键：必须先标记 shuttingDown 再 runtime.Quit，否则 onBeforeClose
				// 看到 MinimizeToTray=true 会隐藏窗口阻止关闭，进程永不退出，
				// hosts/CA/Codeium 配置永远残留。requestExit 把这一步打包好。
				systray.Quit()
				a.requestExit()
				return
			}
		}
	}()
}
