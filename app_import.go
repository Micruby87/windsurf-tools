package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"windsurf-tools-wails/backend/models"
	"windsurf-tools-wails/backend/services"
	"windsurf-tools-wails/backend/utils"
)

// ═══════════════════════════════════════
// 批量导入 + 单个添加
// ═══════════════════════════════════════

type ImportResult struct {
	Email   string `json:"email"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type EmailPasswordItem struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	AltPassword string `json:"alt_password,omitempty"`
	Remark      string `json:"remark"`
}
type TokenItem struct {
	Token  string `json:"token"`
	Remark string `json:"remark"`
}
type APIKeyItem struct {
	APIKey string `json:"api_key"`
	Remark string `json:"remark"`
}
type JWTItem struct {
	JWT    string `json:"jwt"`
	Remark string `json:"remark"`
}
type EmailAPIKeyItem struct {
	Email  string `json:"email"`
	APIKey string `json:"api_key"`
	Remark string `json:"remark"`
}

// importConcurrency 返回导入并发数（钳位 1～20）
func (a *App) importConcurrency() int {
	c := a.store.GetSettings().ImportConcurrency
	if c < 1 {
		c = 3
	}
	if c > 20 {
		c = 20
	}
	return c
}

// importResult 内部导入结果（携带准备好的 Account）
type importSlot struct {
	index  int
	result ImportResult
	acc    *models.Account // nil 表示失败
}

// runConcurrentImport 通用并发导入框架：对 items 并行执行 processFn，然后批量写入 store。
func (a *App) runConcurrentImport(n int, processFn func(idx int) importSlot) []ImportResult {
	defer a.syncMitmPoolKeys()

	concurrency := a.importConcurrency()
	utils.DLog("[导入] 开始导入 %d 条，并发=%d", n, concurrency)

	slots := make([]importSlot, n)
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			slots[idx] = processFn(idx)
		}(i)
	}
	wg.Wait()

	// 收集成功的账号，批量写入 store（单次持久化）
	var accs []models.Account
	accIdxMap := make([]int, 0, n) // 记录 accs 对应的 slots 下标
	for i, s := range slots {
		if s.acc != nil {
			accs = append(accs, *s.acc)
			accIdxMap = append(accIdxMap, i)
		}
	}
	if len(accs) > 0 {
		errs := a.store.AddAccountsBatch(accs)
		for j, err := range errs {
			si := accIdxMap[j]
			if err != nil {
				slots[si].result.Success = false
				slots[si].result.Error = err.Error()
			}
		}
	}

	results := make([]ImportResult, n)
	ok, fail := 0, 0
	for i, s := range slots {
		results[i] = s.result
		if s.result.Success {
			ok++
		} else {
			fail++
		}
	}
	utils.DLog("[导入] 完成: 成功=%d 失败=%d", ok, fail)
	return results
}

// friendlyLoginError 把 Firebase/auth1 的原始英文错误映射成可读中文。
// 命中关键字时返回中文短句；未命中保留原错误避免吞掉信息。
func friendlyLoginError(rawErr error) string {
	if rawErr == nil {
		return ""
	}
	s := strings.ToUpper(rawErr.Error())
	switch {
	case strings.Contains(s, "INVALID_LOGIN_CREDENTIALS"),
		strings.Contains(s, "INVALID_PASSWORD"),
		strings.Contains(s, "INVALID_EMAIL"):
		return "邮箱或密码错误"
	case strings.Contains(s, "EMAIL_NOT_FOUND"):
		return "账号不存在"
	case strings.Contains(s, "USER_DISABLED"):
		return "账号已被禁用"
	case strings.Contains(s, "TOO_MANY_ATTEMPTS_TRY_LATER"),
		strings.Contains(s, "429"):
		return "登录请求过于频繁，请稍后重试（建议把并发调到 1-2）"
	case strings.Contains(s, "MISSING_PASSWORD"):
		return "未填写密码"
	case strings.Contains(s, "OPERATION_NOT_ALLOWED"):
		return "Firebase 项目未启用邮箱登录"
	case strings.Contains(s, "网络"), strings.Contains(s, "NO SUCH HOST"),
		strings.Contains(s, "CONNECTION REFUSED"), strings.Contains(s, "TIMEOUT"):
		return "网络连接失败 — 请确认能访问 windsurf.com / firebase"
	}
	// 不命中时返回原始错误（避免吞掉信息）
	return rawErr.Error()
}

func (a *App) ImportByEmailPassword(items []EmailPasswordItem) []ImportResult {
	return a.runConcurrentImport(len(items), func(idx int) importSlot {
		item := items[idx]
		passwords := []string{item.Password}
		if item.AltPassword != "" && item.AltPassword != item.Password {
			passwords = append(passwords, item.AltPassword)
		}
		var resp *services.FirebaseSignInResp
		var err error
		var usedPassword string
		for _, pw := range passwords {
			if pw == "" {
				continue
			}
			resp, err = a.windsurfSvc.LoginWithEmail(item.Email, pw)
			if err == nil {
				usedPassword = pw
				break
			}
		}
		if err != nil {
			return importSlot{index: idx, result: ImportResult{
				Email: item.Email, Success: false, Error: friendlyLoginError(err),
			}}
		}
		nickname := item.Remark
		if nickname == "" {
			nickname = strings.Split(item.Email, "@")[0]
		}
		acc := models.NewAccount(item.Email, usedPassword, nickname)
		acc.Token = resp.IDToken
		acc.RefreshToken = resp.RefreshToken
		acc.TokenExpiresAt = time.Now().Add(1 * time.Hour).Format(time.RFC3339)
		acc.Remark = item.Remark
		a.enrichAccountInfo(acc)
		return importSlot{index: idx, result: ImportResult{Email: item.Email, Success: true}, acc: acc}
	})
}

func (a *App) ImportByRefreshToken(items []TokenItem) []ImportResult {
	return a.runConcurrentImport(len(items), func(idx int) importSlot {
		item := items[idx]
		resp, err := a.windsurfSvc.RefreshToken(item.Token)
		if err != nil {
			return importSlot{index: idx, result: ImportResult{
				Email: fmt.Sprintf("Token #%d", idx+1), Success: false, Error: err.Error(),
			}}
		}
		email, _ := a.windsurfSvc.GetAccountInfo(resp.IDToken)
		if email == "" {
			email = fmt.Sprintf("user_%s", resp.UserID[:minInt(8, len(resp.UserID))])
		}
		nickname := item.Remark
		if nickname == "" {
			nickname = strings.Split(email, "@")[0]
		}
		acc := models.NewAccount(email, "", nickname)
		acc.Token = resp.IDToken
		acc.RefreshToken = resp.RefreshToken
		acc.TokenExpiresAt = time.Now().Add(1 * time.Hour).Format(time.RFC3339)
		acc.Remark = item.Remark
		a.enrichAccountInfo(acc)
		return importSlot{index: idx, result: ImportResult{Email: email, Success: true}, acc: acc}
	})
}

func (a *App) ImportByAPIKey(items []APIKeyItem) []ImportResult {
	return a.runConcurrentImport(len(items), func(idx int) importSlot {
		item := items[idx]
		jwt, err := a.windsurfSvc.GetJWTByAPIKey(item.APIKey)
		if err != nil {
			return importSlot{index: idx, result: ImportResult{
				Email: fmt.Sprintf("Key #%d", idx+1), Success: false, Error: err.Error(),
			}}
		}

		email := fmt.Sprintf("%s...%s", item.APIKey[:minInt(12, len(item.APIKey))],
			item.APIKey[maxInt(0, len(item.APIKey)-6):])

		acc := models.NewAccount(email, "", item.Remark)
		acc.Token = jwt
		acc.WindsurfAPIKey = item.APIKey
		acc.Remark = item.Remark
		a.enrichAccountInfoLite(acc)
		if item.Remark == "" {
			acc.Nickname = strings.Split(acc.Email, "@")[0]
		}
		return importSlot{index: idx, result: ImportResult{Email: acc.Email, Success: true}, acc: acc}
	})
}

func (a *App) ImportByJWT(items []JWTItem) []ImportResult {
	return a.runConcurrentImport(len(items), func(idx int) importSlot {
		item := items[idx]
		email := fmt.Sprintf("JWT #%d", idx+1)
		acc := models.NewAccount(email, "", item.Remark)
		acc.Token = item.JWT
		acc.Remark = item.Remark
		a.enrichAccountInfoLite(acc)
		// 尝试通过 RegisterUser 获取 API Key，使账号后续可通过 GetJWTByAPIKey 持续刷新凭证
		if acc.WindsurfAPIKey == "" && acc.Token != "" {
			if reg, err := a.windsurfSvc.RegisterUser(acc.Token); err == nil && reg != nil && reg.APIKey != "" {
				acc.WindsurfAPIKey = reg.APIKey
			}
		}
		if item.Remark == "" {
			acc.Nickname = strings.Split(acc.Email, "@")[0]
		}
		return importSlot{index: idx, result: ImportResult{Email: acc.Email, Success: true}, acc: acc}
	})
}

func (a *App) ImportByEmailAPIKey(items []EmailAPIKeyItem) []ImportResult {
	return a.runConcurrentImport(len(items), func(idx int) importSlot {
		item := items[idx]
		email := strings.TrimSpace(item.Email)
		apiKey := strings.TrimSpace(item.APIKey)
		if email == "" || apiKey == "" {
			return importSlot{index: idx, result: ImportResult{
				Email: email, Success: false, Error: "邮箱或 Token 为空",
			}}
		}
		nickname := item.Remark
		if nickname == "" {
			nickname = strings.Split(email, "@")[0]
		}
		acc := models.NewAccount(email, "", nickname)
		acc.WindsurfAPIKey = apiKey
		acc.Remark = item.Remark
		a.enrichAccountInfoLite(acc)
		if acc.Nickname == "" {
			acc.Nickname = strings.Split(email, "@")[0]
		}
		return importSlot{index: idx, result: ImportResult{Email: email, Success: true}, acc: acc}
	})
}

// 单个添加
func (a *App) AddSingleAccount(mode string, value string, remark string) ImportResult {
	switch mode {
	case "api_key":
		items := []APIKeyItem{{APIKey: value, Remark: remark}}
		r := a.ImportByAPIKey(items)
		if len(r) > 0 {
			return r[0]
		}
	case "jwt":
		items := []JWTItem{{JWT: value, Remark: remark}}
		r := a.ImportByJWT(items)
		if len(r) > 0 {
			return r[0]
		}
	case "refresh_token":
		items := []TokenItem{{Token: value, Remark: remark}}
		r := a.ImportByRefreshToken(items)
		if len(r) > 0 {
			return r[0]
		}
	case "password":
		var cred struct {
			Email       string `json:"email"`
			Password    string `json:"password"`
			AltPassword string `json:"alt_password"`
		}
		if err := json.Unmarshal([]byte(strings.TrimSpace(value)), &cred); err != nil {
			return ImportResult{Email: "?", Success: false, Error: "邮箱密码格式错误"}
		}
		if cred.Email == "" || cred.Password == "" {
			return ImportResult{Email: "?", Success: false, Error: "请填写邮箱与密码"}
		}
		r := a.ImportByEmailPassword([]EmailPasswordItem{{
			Email: cred.Email, Password: cred.Password, AltPassword: cred.AltPassword, Remark: remark,
		}})
		if len(r) > 0 {
			return r[0]
		}
	}
	return ImportResult{Email: "?", Success: false, Error: "无效的导入类型"}
}

// ═══════════════════════════════════════
// 第三方 LLM 提供商账号 CRUD(独立链路,与 Windsurf Account 物理隔离)
// 仅本期实现增/删/改/查;Relay 接入留待后续 phase。
// ═══════════════════════════════════════

// ProviderKeyItem 前端 Provider 模式批量导入的单条数据。
type ProviderKeyItem struct {
	Provider string `json:"provider"`
	BaseURL  string `json:"base_url"`
	Token    string `json:"token"`
	Remark   string `json:"remark"`
	Nickname string `json:"nickname"`
}

// ImportByProvider 批量导入第三方提供商账号。
//
// 不调 Windsurf 的 GetJWTByAPIKey / RegisterUser / enrichAccountInfoLite —
// 第三方 token 不需要也不能换 Windsurf JWT。校验 → 落库 → 返回每条结果。
func (a *App) ImportByProvider(items []ProviderKeyItem) []ImportResult {
	if len(items) == 0 {
		return nil
	}
	results := make([]ImportResult, len(items))
	accounts := make([]models.ProviderAccount, 0, len(items))
	indexMap := make([]int, 0, len(items)) // accounts[k] → results[indexMap[k]]

	for i, item := range items {
		provider := strings.TrimSpace(strings.ToLower(item.Provider))
		token := strings.TrimSpace(item.Token)
		baseURL := strings.TrimRight(strings.TrimSpace(item.BaseURL), "/")
		emailLike := providerAccountDisplayName(provider, token)

		if provider == "" {
			results[i] = ImportResult{Email: emailLike, Success: false, Error: "provider 不能为空"}
			continue
		}
		if token == "" {
			results[i] = ImportResult{Email: emailLike, Success: false, Error: "token 不能为空"}
			continue
		}
		if baseURL == "" {
			results[i] = ImportResult{Email: emailLike, Success: false, Error: "base_url 不能为空"}
			continue
		}

		acc := models.NewProviderAccount(provider, baseURL, token, item.Remark)
		acc.Nickname = strings.TrimSpace(item.Nickname)
		accounts = append(accounts, *acc)
		indexMap = append(indexMap, i)
		// 占位结果,落库失败再覆盖
		results[i] = ImportResult{Email: emailLike, Success: true}
	}

	if len(accounts) == 0 {
		return results
	}

	errs := a.providerStore.AddProviderBatch(accounts)
	for k, err := range errs {
		idx := indexMap[k]
		if err != nil {
			results[idx].Success = false
			results[idx].Error = err.Error()
		}
	}
	// 入库成功的账号异步触发 model 拉取 — 不阻塞批量导入响应；
	// 失败原因写到 ModelsError 让 UI 显示。
	for k, err := range errs {
		if err != nil {
			continue
		}
		idx := indexMap[k]
		if !results[idx].Success {
			continue
		}
		acc := accounts[k]
		go a.refreshProviderModelsAsync(acc.ID, acc.Provider, acc.BaseURL, acc.AuthToken)
	}
	return results
}

// RefreshProviderModels 手动重新拉取 model 列表(UI 卡片刷新按钮)。
// 同步等结果返回，前端能直接显示新列表。
func (a *App) RefreshProviderModels(id string) error {
	if a.providerStore == nil {
		return fmt.Errorf("provider store 未初始化")
	}
	acc, err := a.providerStore.Get(id)
	if err != nil {
		return err
	}
	return a.fetchAndPersistProviderModels(acc.ID, acc.Provider, acc.BaseURL, acc.AuthToken)
}

// NextActiveAccount 总览「下一席位」按钮入口。
// 在 同 active_model + status=active 候选里翻到下一张, 把它置 activated。
//
// 返回新激活卡(供前端显示);整库无候选 / 候选只有一张时返回 error,
// 错误消息分别为 "no_candidates" / "only_one"。
func (a *App) NextActiveAccount() (models.ProviderAccount, error) {
	if a.providerStore == nil {
		return models.ProviderAccount{}, fmt.Errorf("provider store 未初始化")
	}
	return a.providerStore.NextActivated()
}

// GetActiveAccount 返回当前全局唯一激活的 provider 账号。
// 没有激活卡时返回 zero 值;前端用此查询 Sidebar / Dashboard 当前活跃显示。
func (a *App) GetActiveAccount() models.ProviderAccount {
	if a.providerStore == nil {
		return models.ProviderAccount{}
	}
	acc, _ := a.providerStore.GetActivated()
	return acc
}

// refreshProviderModelsAsync goroutine 入口：忽略 error，已写到 store 字段。
func (a *App) refreshProviderModelsAsync(id, provider, baseURL, token string) {
	_ = a.fetchAndPersistProviderModels(id, provider, baseURL, token)
}

// fetchAndPersistProviderModels 拉 + 持久化的核心。出错时也写一次
// (空 list + errMsg)，让 UI 上能看到失败原因不再瞎猜。
func (a *App) fetchAndPersistProviderModels(id, provider, baseURL, token string) error {
	if a.providerStore == nil {
		return fmt.Errorf("provider store 未初始化")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	var httpClient *http.Client
	if a.transportPool != nil {
		httpClient = a.transportPool.Client()
	}
	list, err := services.FetchProviderModels(ctx, httpClient, provider, baseURL, token)
	if err != nil {
		_ = a.providerStore.SetProviderModels(id, nil, err.Error())
		return err
	}
	return a.providerStore.SetProviderModels(id, list, "")
}

// GetAllProviderAccounts 返回全部提供商账号(含已禁用)。
func (a *App) GetAllProviderAccounts() []models.ProviderAccount {
	if a.providerStore == nil {
		return nil
	}
	return a.providerStore.GetAll()
}

// GetProviderAccount 按 ID 取单条。
func (a *App) GetProviderAccount(id string) (models.ProviderAccount, error) {
	if a.providerStore == nil {
		return models.ProviderAccount{}, fmt.Errorf("provider store 未初始化")
	}
	return a.providerStore.Get(id)
}

// UpdateProviderAccount 替换整条记录(前端先 Get,改字段,再回传)。
func (a *App) UpdateProviderAccount(acc models.ProviderAccount) error {
	if a.providerStore == nil {
		return fmt.Errorf("provider store 未初始化")
	}
	return a.providerStore.UpdateProvider(acc)
}

// DeleteProviderAccount 按 ID 删除。
func (a *App) DeleteProviderAccount(id string) error {
	if a.providerStore == nil {
		return fmt.Errorf("provider store 未初始化")
	}
	return a.providerStore.DeleteProvider(id)
}

// providerAccountDisplayName 给 ImportResult.Email 拼一个人类可读的占位名,
// 风格同 ImportByAPIKey(token 前 12 + 后 6)。
func providerAccountDisplayName(provider, token string) string {
	if token == "" {
		return fmt.Sprintf("%s|<empty>", provider)
	}
	head := minInt(12, len(token))
	tail := maxInt(0, len(token)-6)
	return fmt.Sprintf("%s|%s...%s", provider, token[:head], token[tail:])
}
