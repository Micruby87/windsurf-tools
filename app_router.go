package main

// app_provider_router.go ── 适配 services.Router,
// 把 settings.MitmRouteMode + providerStore.GetActivatedByProvider
// 桥接给 MitmProxy 阶段 2 提供商分流。

import (
	"windsurf-tools-wails/backend/models"
	"windsurf-tools-wails/backend/services"
)

// routerImpl 实现 services.Router, 委托回 App。
// 单独类型避免把整个 *App 暴露给 services 包。
type routerImpl struct {
	app *App
}

func (r *routerImpl) RouteMode() string {
	if r == nil || r.app == nil || r.app.store == nil {
		return ""
	}
	return r.app.store.GetSettings().MitmRouteMode
}

func (r *routerImpl) ActivatedAccounts(provider string) []models.ProviderAccount {
	if r == nil || r.app == nil || r.app.providerStore == nil {
		return nil
	}
	return r.app.providerStore.GetActivatedByProvider(provider)
}

// 编译期校验: 确保实现接口
var _ services.Router = (*routerImpl)(nil)
