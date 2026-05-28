//go:build !windows

package main

// startTray 在非 Windows 平台禁用。
//
// macOS 不启用的原因:getlantern/systray 在 darwin 自己定义了 AppDelegate
// (systray_darwin.m),与 wails 的 AppDelegate (internal/frontend/desktop/
// darwin/AppDelegate.h) Objective-C 类名硬冲突,linker duplicate symbol。
// 想加 macOS 顶栏托盘需要换不冲突的托盘库,或改用 wails 自带 menu API。
//
// Linux 不启用的原因:依赖 dbus + libappindicator,发布构建复杂。
func (a *App) startTray() {}

func traySupported() bool { return false }

func (a *App) quitTray() {}
