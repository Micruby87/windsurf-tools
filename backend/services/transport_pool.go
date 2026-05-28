package services

// transport_pool.go ── 全局出站 transport 池。
//
// 所有出站 HTTP 请求统一从池取 Client()，自动满足代理优先级:
//   ProxyURL(用户直填) > Clash controller 探活 > 环境变量 > 直连
// 支持 http / https / socks5。

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// ProxyConfig 代理配置。
type ProxyConfig struct {
	ProxyURL           string
	ClashControllerURL string
	ClashSecret        string
	ClashRotateEnabled bool
}

type ProxySource string

const (
	ProxySourceDirect    ProxySource = "direct"
	ProxySourceManual    ProxySource = "manual"
	ProxySourceClashNode ProxySource = "clash+nodes"
	ProxySourceClash     ProxySource = "clash"
	ProxySourceEnv       ProxySource = "env"
)

// TransportPool 全局出站 transport 池。
type TransportPool struct {
	mu             sync.RWMutex
	resolvedURL    string
	resolvedSource ProxySource
	resolvedAt     time.Time
	transport      *http.Transport
	configFn       func() ProxyConfig
}

// NewTransportPool 创建池。configFn 每次 Refresh 时取最新配置。
func NewTransportPool(configFn func() ProxyConfig) *TransportPool {
	p := &TransportPool{configFn: configFn}
	p.transport = p.buildTransport()
	p.Refresh()
	return p
}

// Client 返回走最优代理的 *http.Client。
func (p *TransportPool) Client() *http.Client {
	return &http.Client{Transport: p.transport}
}

// Transport 返回底层 RoundTripper。
func (p *TransportPool) Transport() http.RoundTripper {
	return p.transport
}

// Refresh 重新解析代理(Settings 变更时调用)。
func (p *TransportPool) Refresh() {
	cfg := p.configFn()
	resolved, source := resolveProxy(cfg.ProxyURL, cfg.ClashControllerURL, cfg.ClashSecret, cfg.ClashRotateEnabled)
	p.mu.Lock()
	p.resolvedURL = resolved
	p.resolvedSource = source
	p.resolvedAt = time.Now()
	p.mu.Unlock()
}

// RawProxyURL 返回当前代理 URL(未 redact)。
func (p *TransportPool) RawProxyURL() string {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.resolvedURL
}

// Source 返回当前代理来源。
func (p *TransportPool) Source() ProxySource {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.resolvedSource
}

// ResolvedAt 返回上次 Refresh 完成的时间(空池时返回 zero time)。
func (p *TransportPool) ResolvedAt() time.Time {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.resolvedAt
}

// ── 内部 ──

func (p *TransportPool) buildTransport() *http.Transport {
	t := &http.Transport{
		TLSClientConfig: &tls.Config{
			NextProtos: []string{"h2", "http/1.1"},
		},
		ForceAttemptHTTP2:     true,
		DisableCompression:    true,
		MaxIdleConns:          100,
		MaxConnsPerHost:       20,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 180 * time.Second,
	}
	t.Proxy = func(req *http.Request) (*url.URL, error) {
		p.mu.RLock()
		raw := p.resolvedURL
		p.mu.RUnlock()
		if raw == "" {
			return nil, nil
		}
		return url.Parse(raw)
	}
	return t
}

func resolveProxy(proxyURL, controllerURL, secret string, rotateEnabled bool) (string, ProxySource) {
	if u := strings.TrimSpace(proxyURL); u != "" {
		return u, ProxySourceManual
	}
	controllerURL = strings.TrimSpace(controllerURL)
	if controllerURL != "" {
		if entry := probeClashEntry(controllerURL, secret); entry != "" {
			if rotateEnabled {
				return entry, ProxySourceClashNode
			}
			return entry, ProxySourceClash
		}
		// controller 探活失败 — 把它直接当代理出口用(用户可能填的是 mixed-port 而非 controller)
		return controllerURL, ProxySourceClash
	}
	if env := readEnvProxy(); env != "" {
		return env, ProxySourceEnv
	}
	return "", ProxySourceDirect
}

func probeClashEntry(controllerURL, secret string) string {
	controllerURL = strings.TrimRight(strings.TrimSpace(controllerURL), "/")
	if controllerURL == "" {
		return ""
	}
	req, err := http.NewRequest(http.MethodGet, controllerURL+"/configs", nil)
	if err != nil {
		return ""
	}
	if s := strings.TrimSpace(secret); s != "" {
		req.Header.Set("Authorization", "Bearer "+s)
		q := req.URL.Query()
		q.Set("secret", s)
		req.URL.RawQuery = q.Encode()
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return ""
	}
	parsed, _ := url.Parse(controllerURL)
	if parsed == nil || parsed.Hostname() == "" {
		return ""
	}
	host := parsed.Hostname()
	var cfg struct {
		MixedPort int `json:"mixed-port"`
		Port      int `json:"port"`
		SocksPort int `json:"socks-port"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return ""
	}
	switch {
	case cfg.MixedPort > 0:
		return fmt.Sprintf("http://%s:%d", host, cfg.MixedPort)
	case cfg.Port > 0:
		return fmt.Sprintf("http://%s:%d", host, cfg.Port)
	case cfg.SocksPort > 0:
		return fmt.Sprintf("socks5://%s:%d", host, cfg.SocksPort)
	}
	return ""
}

func readEnvProxy() string {
	for _, key := range []string{"HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}
