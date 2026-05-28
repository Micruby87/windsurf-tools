package main

import (
	"strings"
	"time"
)

// app_proxy.go ── 上游代理状态查询(Wails binding 薄壳)。
//
// 实际解析 / 应用走 backend/services/transport_pool.go;
// 这里只把 TransportPool 的状态映射成前端 schema 暴露。
// 用户在 Dashboard 看一眼就知道当前请求走 clash / 系统代理 / 直连,
// 不用翻日志去猜「为啥我开了 clash 但请求还在被风控」。

// UpstreamProxyStatus 给前端展示当前上游代理出口。
type UpstreamProxyStatus struct {
	// Source 取自 services.ProxySource:
	//   "direct" / "manual" / "clash+nodes" / "clash" / "env" / "unknown"
	Source string `json:"source"`
	// URL 已 redact 掉 userinfo (http://user:pass@host:port → http://***@host:port)。
	// 空字符串 / "<direct>" 表示直连。
	URL string `json:"url"`
	// LastAppliedAt 上次成功 Refresh 的时间(RFC3339); zero = 还没探活过。
	LastAppliedAt string `json:"last_applied_at"`
}

// GetUpstreamProxyStatus 返回 transportPool 的当前状态。
func (a *App) GetUpstreamProxyStatus() UpstreamProxyStatus {
	if a.transportPool == nil {
		return UpstreamProxyStatus{Source: "unknown"}
	}
	src := string(a.transportPool.Source())
	if src == "" {
		src = "unknown"
	}
	at := ""
	if t := a.transportPool.ResolvedAt(); !t.IsZero() {
		at = t.Format(time.RFC3339)
	}
	return UpstreamProxyStatus{
		Source:        src,
		URL:           redactProxyURL(a.transportPool.RawProxyURL()),
		LastAppliedAt: at,
	}
}

// redactProxyURL 隐藏代理 URL 里的 userinfo。
func redactProxyURL(s string) string {
	if s == "" {
		return "<direct>"
	}
	if i := strings.Index(s, "@"); i >= 0 {
		if j := strings.Index(s, "://"); j >= 0 && j < i {
			return s[:j+3] + "***@" + s[i+1:]
		}
	}
	return s
}
