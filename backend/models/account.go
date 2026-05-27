package models

import (
	"time"

	"github.com/google/uuid"
)

// Account 账号信息
type Account struct {
	ID                    string `json:"id"`
	Email                 string `json:"email"`
	Password              string `json:"password,omitempty"`
	Nickname              string `json:"nickname"`
	Token                 string `json:"token,omitempty"`
	RefreshToken          string `json:"refresh_token,omitempty"`
	WindsurfAPIKey        string `json:"windsurf_api_key,omitempty"`
	PlanName              string `json:"plan_name"`
	UsedQuota             int    `json:"used_quota"`
	TotalQuota            int    `json:"total_quota"`
	DailyRemaining        string `json:"daily_remaining"`  // 例如 "85.3%"
	WeeklyRemaining       string `json:"weekly_remaining"` // 例如 "72.1%"
	DailyResetAt          string `json:"daily_reset_at"`
	WeeklyResetAt         string `json:"weekly_reset_at"`
	SubscriptionExpiresAt string `json:"subscription_expires_at"`
	TokenExpiresAt        string `json:"token_expires_at"`
	Status                string `json:"status"`
	Tags                  string `json:"tags"`
	Remark                string `json:"remark"`
	LastLoginAt           string `json:"last_login_at"`
	LastQuotaUpdate       string `json:"last_quota_update"`
	CreatedAt             string `json:"created_at"`
}

func NewAccount(email, password, nickname string) *Account {
	return &Account{
		ID:        uuid.New().String(),
		Email:     email,
		Password:  password,
		Nickname:  nickname,
		PlanName:  "unknown",
		Status:    "active",
		CreatedAt: time.Now().Format(time.RFC3339),
	}
}

// ProviderAccount 第三方 LLM 提供商账号(OpenAI / Anthropic / DeepSeek 等)。
//
// 与 Account(Windsurf 专用)物理隔离:独立 schema、独立存储文件
// (provider_accounts.json)、独立 Store 方法。当前阶段只做 CRUD,
// Relay 层接入留待后续 phase。
type ProviderAccount struct {
	ID         string `json:"id"`
	Provider   string `json:"provider"` // openai / anthropic / deepseek / moonshot / qwen / google / xai / ...
	BaseURL    string `json:"base_url"`
	AuthToken  string `json:"auth_token"`
	Nickname   string `json:"nickname,omitempty"`
	Remark     string `json:"remark,omitempty"`
	Status     string `json:"status"` // active / disabled
	CreatedAt  string `json:"created_at"`
	LastUsedAt string `json:"last_used_at,omitempty"`
	UsedQuota  int    `json:"used_quota,omitempty"`
	TotalQuota int    `json:"total_quota,omitempty"`
}

func NewProviderAccount(provider, baseURL, token, remark string) *ProviderAccount {
	return &ProviderAccount{
		ID:        uuid.New().String(),
		Provider:  provider,
		BaseURL:   baseURL,
		AuthToken: token,
		Remark:    remark,
		Status:    "active",
		CreatedAt: time.Now().Format(time.RFC3339),
	}
}
