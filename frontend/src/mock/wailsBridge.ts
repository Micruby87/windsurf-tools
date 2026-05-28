// frontend/src/mock/wailsBridge.ts
//
// 浏览器 dev 模式下伪造 window.go.main.App + window.runtime,让 React 能正常渲染。
// 用途:用 playwright 在浏览器里截图 README 预览图,完全脱敏(数据全是假的)。
// 触发:vite dev 时 import.meta.env.VITE_MOCK_BRIDGE === '1' 才注入,生产构建不会带。
//
// 数据原则:看着像真号池(几十个账号 + Pro/Free/Trial 混搭 + 用量曲线),
// 但所有 email / token / IP 都是占位串,绝无真实信息。

import { createDefaultSettings } from '../utils/settingsModel'

// ── 假数据生成 ──

const PLANS = ['windsurf-pro-monthly', 'windsurf-free', 'windsurf-trial', 'windsurf-pro-annual', 'windsurf-max']
const NICKS = [
  'demo-alpha', 'demo-beta', 'demo-gamma', 'demo-delta', 'demo-epsilon',
  'sky-blue', 'forest-green', 'sunset-rose', 'midnight-violet', 'aurora-cyan',
  'pixel-01', 'pixel-02', 'pixel-03', 'pixel-04', 'pixel-05',
  'rocket', 'comet', 'planet', 'galaxy', 'nebula',
  'ocean', 'mountain', 'desert', 'glacier', 'volcano',
  'eagle', 'falcon', 'condor', 'sparrow', 'phoenix',
  'crimson', 'emerald', 'sapphire', 'amber', 'pearl',
]

function randomEmail(i: number): string {
  return `demo-user-${String(i).padStart(3, '0')}@example.com`
}

function randomKey(prefix: string, i: number): string {
  return `${prefix}-${String(i).padStart(2, '0')}-${'x'.repeat(28)}${i.toString(16).padStart(4, '0')}`
}

function randomDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86400000)
  return d.toISOString()
}

const ACCOUNTS = Array.from({ length: 36 }, (_, i) => {
  const planIdx = i % PLANS.length
  const plan = PLANS[planIdx]
  const isPro = plan.includes('pro') || plan.includes('max')
  const isTrial = plan.includes('trial')
  const isFree = plan.includes('free')
  const total = isPro ? 1500 : isTrial ? 300 : 50
  const used = Math.floor(total * (0.05 + (i * 13 % 90) / 100))
  return {
    id: `acc-${String(i).padStart(3, '0')}`,
    email: randomEmail(i + 1),
    nickname: NICKS[i % NICKS.length],
    password: '',
    refresh_token: '',
    token: `eyJhbGciOiJIUzI1NiJ9.${'X'.repeat(50)}.${i.toString(16)}`,
    windsurf_api_key: randomKey('sk-ws', i + 1),
    plan_name: plan,
    plan_quota_total: total,
    plan_quota_used: used,
    plan_quota_remaining: total - used,
    plan_period_start: randomDate(28 + (i % 5)),
    plan_period_end: randomDate(-2 - (i % 5)),
    user_id: `uid-${i + 1000}`,
    team_id: `team-demo`,
    created_at: randomDate(60 - i),
    last_used_at: randomDate(i % 7),
    remark: i % 4 === 0 ? '主力号' : i % 4 === 1 ? '备用' : i % 4 === 2 ? '开发测试' : '',
    last_refresh_status: 'ok',
    last_refresh_at: randomDate(i % 3),
    last_quota_refresh_at: randomDate(i % 2),
    last_quota_refresh_status: 'ok',
    runtime_exhausted: i % 11 === 10,
    block_until: '',
  }
})

const PROVIDER_ACCOUNTS = [
  { id: 'p-001', provider: 'openai', base_url: 'https://api.openai.com/v1', auth_token: 'sk-proj-' + 'x'.repeat(48) + '01', nickname: '主力 GPT-4o', remark: '团队共享', status: 'active', created_at: randomDate(20), activated: true, active_model: 'gpt-4o', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini', 'gpt-4o-2024-11-20'], models_refreshed_at: randomDate(0) },
  { id: 'p-002', provider: 'anthropic', base_url: 'https://api.anthropic.com', auth_token: 'sk-ant-' + 'x'.repeat(50) + '02', nickname: 'Claude Opus', remark: '', status: 'active', created_at: randomDate(15), activated: false, active_model: 'claude-opus-4-5', models: ['claude-opus-4-5', 'claude-sonnet-4-6', 'claude-haiku-4-5'], models_refreshed_at: randomDate(1) },
  { id: 'p-003', provider: 'google', base_url: 'https://generativelanguage.googleapis.com', auth_token: 'AIza' + 'X'.repeat(35) + '03', nickname: 'Gemini Pro', remark: '免费配额', status: 'active', created_at: randomDate(10), activated: false, active_model: 'gemini-2.0-flash-exp', models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'], models_refreshed_at: randomDate(2) },
  { id: 'p-004', provider: 'deepseek', base_url: 'https://api.deepseek.com', auth_token: 'sk-' + 'x'.repeat(48) + '04', nickname: 'DeepSeek V3', remark: '', status: 'active', created_at: randomDate(8), activated: false, active_model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'], models_refreshed_at: randomDate(0) },
  { id: 'p-005', provider: 'moonshot', base_url: 'https://api.moonshot.cn/v1', auth_token: 'sk-' + 'x'.repeat(48) + '05', nickname: 'Kimi K1.5', remark: '长上下文', status: 'active', created_at: randomDate(6), activated: false, active_model: 'moonshot-v1-128k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], models_refreshed_at: randomDate(1) },
  { id: 'p-006', provider: 'qwen', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', auth_token: 'sk-' + 'x'.repeat(48) + '06', nickname: '通义 Plus', remark: '', status: 'disabled', created_at: randomDate(30), activated: false, active_model: '', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], models_refreshed_at: randomDate(15) },
  { id: 'p-007', provider: 'doubao', base_url: 'https://ark.cn-beijing.volces.com/api/v3', auth_token: 'xxxxxxxx-xxxx-xxxx-xxxx-' + 'x'.repeat(12) + '07', nickname: '豆包 Pro', remark: '火山方舟', status: 'active', created_at: randomDate(5), activated: false, active_model: 'doubao-pro-128k', models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-128k'], models_refreshed_at: randomDate(0) },
  { id: 'p-008', provider: 'xai', base_url: 'https://api.x.ai/v1', auth_token: 'xai-' + 'x'.repeat(44) + '08', nickname: 'Grok-2', remark: '', status: 'active', created_at: randomDate(3), activated: false, active_model: 'grok-2-1212', models: ['grok-2-1212', 'grok-2-vision-1212'], models_refreshed_at: randomDate(0) },
]

const POOL_STATUS = ACCOUNTS.slice(0, 18).map((a, i) => ({
  account_id: a.id,
  email: a.email,
  nickname: a.nickname,
  key_short: a.windsurf_api_key.slice(0, 12) + '…' + a.windsurf_api_key.slice(-6),
  api_key: a.windsurf_api_key,
  is_current: i === 5,
  healthy: i !== 11 && i !== 17,
  exhausted: i === 11,
  plan_name: a.plan_name,
  quota_used: a.plan_quota_used,
  quota_total: a.plan_quota_total,
}))

const SESSIONS = Array.from({ length: 4 }, (_, i) => ({
  conversation_id: `conv-${String(i + 1).padStart(3, '0')}`,
  api_key_short: POOL_STATUS[i + 2].key_short,
  bound_at: randomDate(0),
  request_count: 12 + i * 7,
}))

const RECENT_EVENTS = [
  { at: randomDate(0), kind: 'switch', summary: 'MITM 切换到 demo-alpha (sk-ws-01-…0001)', api_key: POOL_STATUS[5].api_key },
  { at: randomDate(0), kind: 'quota-exhausted', summary: '账号 demo-pixel-03 额度耗尽,自动跳过', api_key: POOL_STATUS[11].api_key },
  { at: randomDate(0), kind: 'switch', summary: 'MITM 切换到 demo-pixel-02 (sk-ws-02-…0002)', api_key: POOL_STATUS[2].api_key },
  { at: randomDate(0), kind: 'request', summary: '/api/v1/chat 上游 200,耗时 312ms', api_key: POOL_STATUS[5].api_key },
  { at: randomDate(0), kind: 'request', summary: '/api/v1/completions 上游 200,耗时 289ms', api_key: POOL_STATUS[5].api_key },
  { at: randomDate(1), kind: 'rotation', summary: '轮换池触发: 5 个账号纳入轮换', api_key: '' },
  { at: randomDate(1), kind: 'switch', summary: 'MITM 切换到 demo-sky-blue (sk-ws-06-…0006)', api_key: POOL_STATUS[5].api_key },
]

const MITM_STATUS = {
  running: true,
  port: 443,
  ca_installed: true,
  hosts_installed: true,
  pool_status: POOL_STATUS,
  recent_events: RECENT_EVENTS,
  session_count: SESSIONS.length,
  total_requests: 8472,
  upstream_error: null,
  last_proxy_issue: null,
  full_capture_enabled: false,
}

const RELAY_STATUS = {
  running: true,
  port: 8787,
  url: 'http://127.0.0.1:8787',
}

const UPSTREAM_PROXY = {
  source: 'clash+nodes',
  url: 'http://127.0.0.1:7890',
  last_applied_at: randomDate(0),
}

// 用量统计 — 6 KPI / 30d 趋势 / 模型分布 / 流水
const USAGE_RECORDS = Array.from({ length: 56 }, (_, i) => {
  const models = ['cascade', 'gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-6', 'gemini-2.0-flash', 'deepseek-chat']
  const m = models[i % models.length]
  const reqM = i % 7 === 0 ? 'gpt-4-turbo' : m
  const prompt = 600 + (i * 73) % 4000
  const completion = 200 + (i * 41) % 1500
  return {
    id: `rec-${String(i).padStart(4, '0')}`,
    at: randomDate(i * 0.05),
    model: m,
    request_model: reqM,
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    duration_ms: 180 + (i * 17) % 1200,
    api_key_short: POOL_STATUS[i % POOL_STATUS.length].key_short,
    status: i % 23 === 22 ? 'error' : 'ok',
    error_detail: i % 23 === 22 ? 'rate limited' : '',
    format: i % 5 === 0 ? 'anthropic' : 'openai',
  }
})

const USAGE_SUMMARY = {
  total_requests: 12384,
  total_prompt_tokens: 4_236_812,
  total_completion_tokens: 1_847_290,
  total_tokens: 6_084_102,
  estimated_cost_usd: 28.46,
  error_count: 47,
  by_model: { 'cascade': 4218, 'gpt-4o': 2914, 'claude-sonnet-4-6': 1893, 'gpt-4o-mini': 1542, 'gemini-2.0-flash': 891, 'deepseek-chat': 612, 'gpt-4-turbo': 314 },
  by_model_tokens: { 'cascade': 2_134_812, 'gpt-4o': 1_456_209, 'claude-sonnet-4-6': 1_098_435, 'gpt-4o-mini': 712_438, 'gemini-2.0-flash': 412_891, 'deepseek-chat': 198_234, 'gpt-4-turbo': 71_083 },
  by_date: Object.fromEntries(Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)
    const base = 200 + (Math.sin(i / 4) + 1) * 250 + (i * 13) % 100
    return [d, Math.floor(base)]
  })),
  by_date_tokens: Object.fromEntries(Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)
    const base = 80_000 + (Math.cos(i / 5) + 1) * 60_000 + (i * 1100) % 30_000
    return [d, Math.floor(base)]
  })),
}

// Cleanup categories
const CLEANUP_CATEGORIES = [
  { id: 'cascade-conversations', name: 'Cascade 对话历史', description: '本地存的 IDE 对话流水,清掉后 IDE 历史会消失但当前对话不受影响', size_bytes: 1_287_654_321, size_human: '1.20 GB', file_count: 8423, safe: true },
  { id: 'render-cache', name: '渲染缓存', description: 'Electron 渲染进程缓存,清掉后下次启动会重新生成', size_bytes: 412_876_543, size_human: '393 MB', file_count: 2188, safe: true },
  { id: 'shader-cache', name: 'Shader 缓存', description: 'GPU shader 编译产物', size_bytes: 134_567_890, size_human: '128 MB', file_count: 156, safe: true },
  { id: 'logs', name: '日志文件', description: 'IDE 启动日志、扩展日志、网络抓包', size_bytes: 87_654_321, size_human: '83 MB', file_count: 412, safe: true },
  { id: 'service-worker', name: 'Service Worker 缓存', description: 'web 资源缓存', size_bytes: 56_789_012, size_human: '54 MB', file_count: 89, safe: true },
  { id: 'extensions-state', name: '扩展状态', description: '已安装扩展的本地状态(谨慎清理,会丢失扩展配置)', size_bytes: 23_456_789, size_human: '22 MB', file_count: 67, safe: false },
]

const PERFORMANCE_TIPS = [
  { id: 'disable-telemetry', title: '关闭 Telemetry 上报', description: '修改 Windsurf 设置禁用匿名数据上报,减少后台请求', category: 'privacy', impact: 'low', applied: false },
  { id: 'limit-extensions', title: '禁用未使用扩展', description: '检测到 12 个扩展长期未激活,禁用可加快启动 1-2s', category: 'startup', impact: 'medium', applied: false },
  { id: 'reduce-cache-size', title: '限制对话历史大小', description: '当前累计 1.2GB,建议设置上限 500MB,自动滚动清理', category: 'storage', impact: 'high', applied: false },
]

// Tasks
const TASKS = [
  { id: 'task-001', kind: 'import', title: '批量导入 (52 条)', total: 52, completed: 48, succeeded: 47, failed: 1, items: [], started_at: randomDate(0), running: false, finished_at: randomDate(0) },
  { id: 'task-002', kind: 'refresh', title: '刷新所有额度', total: 36, completed: 36, succeeded: 35, failed: 1, items: [], started_at: randomDate(0), finished_at: randomDate(0), running: false },
]

// Dashboard metrics
const DASHBOARD_METRICS = {
  switch_total_24h: 47,
  switch_total_7d: 312,
  switch_total_30d: 1284,
  switch_hourly: Array.from({ length: 24 }, (_, i) => ({
    hour_start: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
    count: Math.max(0, Math.floor(Math.sin(i / 3) * 4 + 6 + (i * 7) % 5)),
  })),
  switch_daily_30d: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
    count: Math.floor(20 + Math.cos(i / 4) * 15 + (i * 11) % 12),
  })),
  switch_top_accounts: [
    { email: 'demo-user-006@example.com', count: 142 },
    { email: 'demo-user-002@example.com', count: 98 },
    { email: 'demo-user-014@example.com', count: 76 },
    { email: 'demo-user-009@example.com', count: 54 },
    { email: 'demo-user-021@example.com', count: 41 },
  ],
  reason_breakdown: { 'quota-exhausted': 487, 'manual-pin-cycle': 312, 'rotation-pool-rotate': 285, 'request-error-fallback': 134, 'pool-key-changed': 66 },
}

// Rotation pool status
const ROTATION_POOL_STATUS = {
  enabled: true,
  pool_size: 5,
  current_account_id: ACCOUNTS[5].id,
  current_email: ACCOUNTS[5].email,
  next_switch_in_seconds: 247,
  account_ids: [ACCOUNTS[2].id, ACCOUNTS[5].id, ACCOUNTS[7].id, ACCOUNTS[14].id, ACCOUNTS[19].id],
  last_switch_at: randomDate(0),
}

const MANUAL_PIN_STATUS = {
  enabled: false,
  account_id: '',
  pinned_email: '',
  pinned_at: '',
}

const JAILBREAK_RUNTIME = {
  enabled: false,
  override_text: '',
  bytes: 0,
  preset_id: '',
}

const DISK_USAGE = {
  total_bytes: 2_002_345_678,
  total_human: '1.86 GB',
  by_category: CLEANUP_CATEGORIES.map(c => ({ category: c.id, size_bytes: c.size_bytes, size_human: c.size_human })),
  scanned_at: randomDate(0),
}

// Settings — 让前端 createDefaultSettings 出值,保证 schema 一致
const SETTINGS = (() => {
  const s = createDefaultSettings()
  return {
    ...s,
    auto_refresh_tokens: true,
    auto_refresh_quotas: true,
    quota_hot_poll_seconds: 12,
    auto_switch_on_quota_exhausted: true,
    rotation_pool_enabled: true,
    rotation_pool_account_ids: ROTATION_POOL_STATUS.account_ids,
    clash_controller_url: 'http://127.0.0.1:9090',
    clash_secret: '',
    clash_rotate_enabled: true,
    clash_rotate_interval_seconds: 600,
    clash_group: 'PROXY',
    openai_relay_enabled: true,
    openai_relay_port: 8787,
    openai_relay_secret: '',
    proxy_url: '',
    mitm_route_mode: 'pool',
    desktop_notifications: true,
    minimize_to_tray: true,
  } as any
})()

function notImplemented(name: string) {
  return async (..._args: any[]) => {
    console.warn(`[mock] ${name} 未实现,返回 null`)
    return null
  }
}

// ── window.go.main.App ──
const AppMethods: Record<string, (...args: any[]) => any> = {
  GetAllAccounts: async () => ACCOUNTS,
  GetAccount: async (id: string) => ACCOUNTS.find(a => a.id === id) ?? null,
  DeleteAccount: async () => null,
  DeleteExpiredAccounts: async () => 0,
  DeleteFreePlanAccounts: async () => 0,
  DeleteAccountsByGroup: async () => 0,
  ExportAccountsByGroup: async () => '[]',

  ImportByEmailPassword: async (items: any[]) => items.map((it, i) => ({ email: it.email, success: i % 7 !== 0, error: i % 7 === 0 ? 'demo: 模拟失败' : '' })),
  ImportByJWT: async (items: any[]) => items.map(it => ({ email: it.email || '', success: true })),
  ImportByAPIKey: async (items: any[]) => items.map(it => ({ email: it.api_key.slice(0, 12) + '…', success: true })),
  ImportByEmailAPIKey: async (items: any[]) => items.map(it => ({ email: it.email, success: true })),
  ImportByRefreshToken: async (items: any[]) => items.map(_ => ({ email: 'demo', success: true })),
  AddSingleAccount: async () => ({ email: 'demo', success: true }),

  RefreshAllTokens: async () => Object.fromEntries(ACCOUNTS.map(a => [a.id, 'ok'])),
  RefreshAllQuotas: async () => Object.fromEntries(ACCOUNTS.map(a => [a.id, 'ok'])),
  RefreshAccountQuota: async () => null,

  GetSettings: async () => SETTINGS,
  UpdateSettings: async () => null,
  ExportSettings: async () => JSON.stringify(SETTINGS, null, 2),
  ImportSettings: async () => null,

  // MITM
  GetMitmProxyStatus: async () => MITM_STATUS,
  StartMitmProxy: async () => null,
  StopMitmProxy: async () => null,
  SetupMitmCA: async () => null,
  SetupMitmHosts: async () => null,
  SetupMitmAll: async () => [
    { step: 'ca', ok: true, detail: '已安装 CA 到系统钥匙串' },
    { step: 'hosts', ok: true, detail: '已写入 hosts 条目' },
    { step: 'listener', ok: true, detail: '已绑定 127.0.0.1:443' },
  ],
  UninstallMitmCA: async () => null,
  UninstallMitmHosts: async () => null,
  TeardownMitm: async () => null,
  GetMitmCAPath: async () => '/Users/demo/.config/WindsurfTools/ca.crt',
  SwitchMitmToNext: async () => POOL_STATUS[6].account_id,
  SwitchMitmToAccount: async () => '',
  SwitchAccountLocal: async () => 'ok',
  GetMitmSessionBindings: async () => SESSIONS,
  UnbindMitmSession: async () => true,
  GetMitmFullCaptureEnabled: async () => false,
  ToggleMitmFullCapture: async () => null,
  ToggleMitmDebugDump: async () => null,
  ClearMitmKeyExhausted: async () => true,
  ClearAllMitmExhausted: async () => 0,

  // Relay
  GetOpenAIRelayStatus: async () => RELAY_STATUS,
  StartOpenAIRelay: async () => null,
  StopOpenAIRelay: async () => null,

  // Upstream proxy
  GetUpstreamProxyStatus: async () => UPSTREAM_PROXY,

  // Provider
  GetAllProviderAccounts: async () => PROVIDER_ACCOUNTS,
  GetProviderAccount: async (id: string) => PROVIDER_ACCOUNTS.find(p => p.id === id) ?? null,
  ImportByProvider: async (items: any[]) => items.map(_ => ({ email: 'provider', success: true })),
  UpdateProviderAccount: async () => null,
  DeleteProviderAccount: async () => null,
  RefreshProviderModels: async () => null,
  NextActiveAccount: async () => PROVIDER_ACCOUNTS[1],
  GetActiveAccount: async () => PROVIDER_ACCOUNTS[0],
  ActiveAccount: async () => PROVIDER_ACCOUNTS[0],
  RouteMode: async () => SETTINGS.mitm_route_mode,

  // Usage
  GetUsageRecords: async () => USAGE_RECORDS,
  GetUsageSummary: async () => USAGE_SUMMARY,
  DeleteAllUsage: async () => 0,

  // Tasks
  GetTasks: async () => TASKS,
  ClearFinishedTasks: async () => null,

  // Dashboard
  GetDashboardMetrics: async () => DASHBOARD_METRICS,

  // Rotation pool
  GetRotationPoolStatus: async () => ROTATION_POOL_STATUS,
  RotationPoolRefreshQuotasNow: async () => null,
  RotationPoolSwitchNow: async () => ACCOUNTS[7].email,
  GetManualPinStatus: async () => MANUAL_PIN_STATUS,
  UnpinManualAccount: async () => null,

  // Clash
  GetClashRotatorRunning: async () => true,
  AutoDetectClashGroup: async () => ({ ok: true, group: 'PROXY', candidates: ['PROXY', 'GLOBAL', 'auto'] }),
  AutoSetupClash: async () => ({ ok: true, group: 'PROXY', node_count: 12, from: 'HK-01', to: 'JP-Tokyo-03' }),
  TriggerClashRotate: async () => true,
  TestClashController: async () => ({ ok: true, version: 'mihomo v1.18.5', mixed_port: 7890, port: 7890, socks_port: 7891 }),
  ListClashGroupNodes: async () => ['HK-01', 'JP-Tokyo-03', 'SG-Singapore-02', 'US-LA-05', 'TW-Taipei-01'],

  // Cleanup
  GetWindsurfDiskUsage: async () => DISK_USAGE,
  GetWindsurfProcessInfo: async () => [],
  CleanupWindsurf: async (cats: string[]) => cats.map(id => {
    const c = CLEANUP_CATEGORIES.find(x => x.id === id)
    return { category: id, success: true, freed_bytes: c?.size_bytes ?? 0, freed_human: c?.size_human ?? '0 B', deleted_dirs: c?.file_count ?? 0 }
  }),
  CleanupStartupCache: async () => CLEANUP_CATEGORIES.slice(0, 3).map(c => ({ category: c.id, success: true, freed_bytes: c.size_bytes, freed_human: c.size_human, deleted_dirs: c.file_count })),
  CleanupAllSafe: async () => CLEANUP_CATEGORIES.filter(c => c.safe).map(c => ({ category: c.id, success: true, freed_bytes: c.size_bytes, freed_human: c.size_human, deleted_dirs: c.file_count })),
  GetPerformanceTips: async () => PERFORMANCE_TIPS,
  ApplyPerformanceFix: async () => ({}),
  ApplyAllPerformanceFixes: async () => Object.fromEntries(PERFORMANCE_TIPS.map(t => [t.id, 'ok'])),

  // Jailbreak
  GetJailbreakRuntime: async () => JAILBREAK_RUNTIME,
  GetJailbreakDefaultOverride: async () => '',
  ListJailbreakPresets: async () => [],
  SaveJailbreakOverrideFile: async () => '/Users/demo/.config/WindsurfTools/jailbreak.txt',
  OpenJailbreakOverrideFile: async () => '',
  RevealJailbreakOverrideFolder: async () => '',
  ResetJailbreakStats: async () => null,

  // Diagnostics
  RunDiagnostics: async () => ({
    platform: 'darwin', arch: 'arm64', ok: 8, warn: 1, error: 0,
    checks: [
      { id: 'os-version', title: '操作系统版本', status: 'ok', detail: 'macOS 15.0 (Apple Silicon)', fix_hint: '' },
      { id: 'webview', title: 'WebView', status: 'ok', detail: 'WebKit2 内置', fix_hint: '' },
      { id: 'port-443', title: '端口 443', status: 'ok', detail: '可绑定', fix_hint: '' },
      { id: 'ca', title: 'MITM CA 证书', status: 'ok', detail: '已安装到系统钥匙串', fix_hint: '' },
      { id: 'hosts', title: 'Hosts 配置', status: 'ok', detail: '已写入劫持条目', fix_hint: '' },
      { id: 'clash', title: 'Clash controller', status: 'ok', detail: '127.0.0.1:9090 通,mihomo v1.18.5', fix_hint: '' },
      { id: 'system-proxy', title: '系统代理', status: 'ok', detail: '已读取 HTTPS_PROXY', fix_hint: '' },
      { id: 'wails', title: 'Wails runtime', status: 'ok', detail: 'v2.12.0', fix_hint: '' },
      { id: 'tray', title: '系统托盘', status: 'warn', detail: 'macOS 当前版本未启用', fix_hint: '' },
    ]
  }),

  // 其他
  RevealCaptureDir: async () => '',
  RevealProtoDumpDir: async () => '',
  SendDesktopNotification: async () => null,
  SetSilentFromFlag: async () => null,
  SaveWindowGeometry: async () => null,
  RestoreWindowGeometry: async () => ({ x: 100, y: 100, width: 1280, height: 800, maximized: false }),
}

// ── window.runtime ──
const Runtime = {
  EventsEmit: (_name: string, ..._data: any[]) => {},
  EventsOn: (_name: string, _cb: (...d: any[]) => void) => () => {},
  EventsOnMultiple: (_name: string, _cb: (...d: any[]) => void) => () => {},
  EventsOnce: (_name: string, _cb: (...d: any[]) => void) => () => {},
  EventsOff: (_name: string, ..._extra: string[]) => {},
  WindowSetTitle: (_title: string) => {},
  WindowFullscreen: () => {},
  WindowUnfullscreen: () => {},
  WindowIsFullscreen: async () => false,
  WindowCenter: () => {},
  WindowReload: () => location.reload(),
  WindowReloadApp: () => location.reload(),
  WindowSetSystemDefaultTheme: () => {},
  WindowSetLightTheme: () => {},
  WindowSetDarkTheme: () => {},
  WindowGetSize: async () => ({ w: 1280, h: 800 }),
  WindowSetSize: () => {},
  WindowGetPosition: async () => ({ x: 100, y: 100 }),
  WindowSetPosition: () => {},
  WindowSetAlwaysOnTop: () => {},
  WindowMinimise: () => {},
  WindowUnminimise: () => {},
  WindowMaximise: () => {},
  WindowToggleMaximise: () => {},
  WindowUnmaximise: () => {},
  WindowIsMaximised: async () => false,
  WindowIsMinimised: async () => false,
  WindowIsNormal: async () => true,
  WindowShow: () => {},
  WindowHide: () => {},
  Show: () => {},
  Hide: () => {},
  Quit: () => {},
  Environment: async () => ({ buildType: 'dev', platform: 'darwin', arch: 'arm64' }),
  LogPrint: () => {},
  LogTrace: () => {},
  LogDebug: () => {},
  LogInfo: () => {},
  LogWarning: () => {},
  LogError: () => {},
  LogFatal: () => {},
  LogSetLogLevel: () => {},
  ClipboardGetText: async () => '',
  ClipboardSetText: async () => true,
  BrowserOpenURL: (_url: string) => {},
  ScreenGetAll: async () => [{ isCurrent: true, isPrimary: true, width: 2560, height: 1440 }],
  Hostname: async () => 'demo-host',
}

export function installMockBridge() {
  const w = window as any
  // 挂方法,所有未在 AppMethods 列表里的 binding 都 fallback 到 notImplemented
  const handler = new Proxy({}, {
    get(_target, prop: string) {
      if (prop in AppMethods) return AppMethods[prop]
      return notImplemented(prop)
    },
  })
  w.go = { main: { App: handler } }
  w.runtime = Runtime
  w.__mockBridgeInstalled = true
  console.info('[mock] Wails bridge installed (browser preview only)')
}

