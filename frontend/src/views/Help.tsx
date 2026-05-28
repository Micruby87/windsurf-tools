import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  BookOpen,
  ChevronDown,
  HelpCircle,
  KeyRound,
  RefreshCw,
  Search,
  Shield,
  Shuffle,
  Sparkles,
} from "lucide-react";

type IconType = ComponentType<{ className?: string; strokeWidth?: number | string }>;

interface Chapter {
  id: string;
  icon: IconType;
  iconColor: string;
  title: string;
  summary: string;
  content: ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: "mode-choice",
    icon: HelpCircle,
    iconColor: "text-ios-blue bg-ios-blue/10",
    title: "1. 我该选哪种模式？IDE 直接切号 vs MITM 代理",
    summary: "搞清楚两个核心方案的区别",
    content: (
      <>
        <p>
          本工具支持 <b>两种核心使用模式</b>：
        </p>
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] p-3">
          <div className="font-bold text-emerald-700 dark:text-emerald-300 mb-1">
            🅰 IDE 直接切号（简单）
          </div>
          <p className="text-[12.5px] text-gray-600 dark:text-gray-400">
            在 Accounts 页面点账号卡片的 <code>🔄</code> 切换按钮，会调
            <code>SwitchAccountLocal</code> 直接把账号信息写入 Windsurf
            本地登录文件（<code>state.vscdb</code> 等）。<b>无需 MITM 代理</b>。
            适合：偶尔切号、不在意计费透明性的用户。
          </p>
        </div>
        <div className="rounded-xl border border-ios-blue/15 bg-ios-blue/[0.06] p-3">
          <div className="font-bold text-ios-blue mb-1">🅱 MITM 代理（推荐 / 高级）</div>
          <p className="text-[12.5px] text-gray-600 dark:text-gray-400">
            安装 CA 证书 + Hosts 劫持后，MITM 截获所有 Cascade 请求，
            <b>透明地把请求里的账号身份替换为号池里的 key</b>，上游按号池账号计费。优势：①
            永远显示同一登录账号（IDE 不感知）； ② 额度耗尽自动切下一席；③
            同一会话粘性，不会失败；④ Pin / 轮换池等高级控制。
          </p>
        </div>
        <p className="mt-3">
          <b>👉 推荐</b>：长期使用选 MITM；偶尔玩玩用 A。两个模式可以共存，互不干扰。
        </p>
      </>
    ),
  },
  {
    id: "api-key",
    icon: KeyRound,
    iconColor: "text-violet-600 bg-violet-500/10",
    title: "2. API Key 是什么？怎么获取？",
    summary: "sk-ws- 前缀解释 + 来源",
    content: (
      <>
        <p>
          Windsurf 用 <code className="font-mono">sk-ws-</code> 前缀的字符串作为 API Key（类似
          OpenAI 的 <code>sk-</code>）。
        </p>
        <p className="font-bold mt-3">如何获取？</p>
        <ul className="list-disc pl-5 space-y-1.5 text-[12.5px]">
          <li>登录 windsurf.com 后 → 个人设置 → 复制 API Key</li>
          <li>已有账号：从浏览器 Network 抓 `api_key` 字段</li>
          <li>邮箱密码登录后：本工具自动 RegisterUser 生成 API Key（导入流程）</li>
        </ul>
        <p className="font-bold mt-3">为什么 MITM 用它？</p>
        <p className="text-[12.5px]">
          API Key 是 Windsurf 服务端识别账号身份的核心。MITM 把 Authorization header +
          protobuf body 里的 key 全部替换成号池里某个账号的 key → 上游就按那个账号计费。
        </p>
      </>
    ),
  },
  {
    id: "import",
    icon: Sparkles,
    iconColor: "text-amber-600 bg-amber-500/10",
    title: "3. 怎么导入账号（4 种格式）",
    summary: "API Key / JWT / 邮箱密码 / Refresh Token 自动识别",
    content: (
      <>
        <p>
          批量导入支持 <b>4 种凭证</b> 自动识别（混合粘贴也 OK）：
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-[12.5px]">
          <li>
            <b>API Key</b> — 以 <code>sk-ws-</code> 开头，一行一个
          </li>
          <li>
            <b>JWT</b> — 以 <code>eyJ</code> 开头的 base64 双段，本工具会调 RegisterUser 自动配
            API Key
          </li>
          <li>
            <b>邮箱密码</b> — <code>email@x.com password123</code> / JSON / <code>----</code>{" "}
            分隔 / 卡密格式都支持
          </li>
          <li>
            <b>Refresh Token</b> — Firebase refresh token，自动 refresh 拿 JWT
          </li>
        </ul>
        <p className="mt-3 text-[12.5px]">
          导入器会自动去重（同 email / JWT / refresh token 不会重复进库）。错误的 / 短的输入会标
          <code>X 行未识别</code>，<b>不会盲目提交后端</b>。
        </p>
        <p className="mt-3 text-[12.5px] text-amber-700 dark:text-amber-300">
          ⚠ 导入并发数默认 3，调高容易触发上游限速（429）。
        </p>
      </>
    ),
  },
  {
    id: "mitm",
    icon: Shield,
    iconColor: "text-emerald-600 bg-emerald-500/10",
    title: "4. MITM 代理是什么？为什么需要 CA 证书 + Hosts？",
    summary: "原理 + 安全性 + 配置流程",
    content: (
      <>
        <p>
          MITM = Man-in-the-Middle 代理。本工具实现的是 <b>HTTPS MITM</b>：
        </p>
        <ol className="list-decimal pl-5 space-y-1.5 text-[12.5px]">
          <li>生成本地 CA 证书 → 安装到系统信任链</li>
          <li>
            劫持 Hosts，让 <code>server.codeium.com</code> 解析到 127.0.0.1
          </li>
          <li>本机 443 端口跑 HTTPS 服务器，用 CA 现签目标域名证书</li>
          <li>
            截获 Cascade / Windsurf 全部请求 → 修改 protobuf 字段（替换 API Key / JWT / F20
            UserID / F32 TeamID）
          </li>
          <li>
            转发到真实 Windsurf 服务器，<b>上游按号池账号计费</b>，IDE 完全不感知
          </li>
        </ol>
        <p className="mt-3 font-bold">安全性？</p>
        <ul className="list-disc pl-5 space-y-1 text-[12.5px]">
          <li>
            CA 证书仅本机有效，<b>不会上传到任何第三方</b>
          </li>
          <li>对话内容 + 凭证全部在本地处理</li>
          <li>关闭 MITM 后 CA 仍在系统里，不影响其它 HTTPS 站点</li>
          <li>卸载：Dashboard 提供「卸载 CA」「卸载 Hosts」分步按钮</li>
        </ul>
      </>
    ),
  },
  {
    id: "rotation",
    icon: RefreshCw,
    iconColor: "text-sky-600 bg-sky-500/10",
    title: "5. 号池如何自动轮换？Pin 和 Pool 又是什么？",
    summary: "3 个自动切换触发点 + 锁定 + 轮换池",
    content: (
      <>
        <p>
          开启 MITM 后，号池<b>自动轮换</b>由 3 个触发点驱动：
        </p>
        <ol className="list-decimal pl-5 space-y-1.5 text-[12.5px]">
          <li>
            <b>额度耗尽 (onKeyExhausted)</b> — 上游返回 quota exceeded → 立刻切下一个有额度的 key
          </li>
          <li>
            <b>限速 (rate-limit)</b> — 上游 429 → 切号 + 冷却原账号
          </li>
          <li>
            <b>热轮询 (quota poll)</b> — 默认 12 秒拉一次当前账号额度，发现见底主动切
          </li>
        </ol>
        <p className="font-bold mt-3">手动锁定 (Pin)</p>
        <p className="text-[12.5px]">
          在 Accounts 卡片点切换按钮切到某账号后，<b>自动锁定 (🔒)</b>。3 个自动切都跳过，用户
          100% 控制。Header / Account 卡片 / Settings 都能解锁。
        </p>
        <p className="font-bold mt-3">轮换池 (Rotation Pool)</p>
        <p className="text-[12.5px]">
          Settings 里勾 2+ 个账号进池，开启后 <b>定时切 + 额度耗尽双触发</b>{" "}
          只在池内来回切，池外账号完全不参与。池内额度 1 分钟刷一次（独立于全局 quota refresh）。
        </p>
      </>
    ),
  },
  {
    id: "clash",
    icon: Shuffle,
    iconColor: "text-violet-600 bg-violet-500/10",
    title: "6. Clash IP 轮换为什么要 + 怎么用智能启用",
    summary: "防限速 + 一键自动检测",
    content: (
      <>
        <p>
          大量请求经同一 IP 容易被 Windsurf 服务端打风控。<b>Clash IP 轮换</b>{" "}
          通过你本地装的 Clash / Mihomo 客户端定期切换出口节点：
        </p>
        <div className="rounded-xl border border-violet-500/15 bg-violet-500/[0.06] p-3 my-3">
          <div className="font-bold text-violet-700 dark:text-violet-300 mb-1.5">
            一键智能启用（v1.1.0+）
          </div>
          <p className="text-[12.5px] text-gray-700 dark:text-gray-300">
            Settings → Clash IP 轮换 → 填控制器 URL (默认
            <code>http://127.0.0.1:9097</code> Verge) + secret → 点{" "}
            <b>「✨ 智能启用」</b>。后端会：
          </p>
          <ol className="list-decimal pl-5 mt-1.5 text-[12px] text-gray-600 dark:text-gray-400 space-y-0.5">
            <li>探活控制器</li>
            <li>自动挑节点最多的 selector group</li>
            <li>type-aware 过滤排除假节点（"剩余流量"/"套餐到期"/"防失联"）</li>
            <li>立即切一次 + 启动定时切</li>
          </ol>
        </div>
      </>
    ),
  },
  {
    id: "jailbreak",
    icon: Sparkles,
    iconColor: "text-rose-600 bg-rose-500/10",
    title: "7. Cascade 破限注入原理 + 预设区别 + 风险",
    summary: "MITM 注入 system prompt 末尾 + 4 个预设对比",
    content: (
      <>
        <p>
          <b>Cascade 破限注入</b> = 在每次 chat 请求的 F2 system prompt
          末尾追加一段「override 指令」，覆盖模型 alignment / 拒绝模板。
        </p>
        <p className="text-[12.5px] mt-2">
          等效于 Claude Code 的 <code>--append-system-prompt-file</code>，但走
          <b>MITM 协议层</b>，IDE 升级不受影响，关 MITM 即恢复原状。
        </p>
        <p className="font-bold mt-3">4 个预设对比</p>
        <table className="w-full text-[12px] border-collapse mt-1.5">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="text-left py-1.5 pr-2">预设</th>
              <th className="text-left py-1.5 px-2">风险</th>
              <th className="text-left py-1.5 pl-2">说明</th>
            </tr>
          </thead>
          <tbody className="text-[11.5px]">
            <tr className="border-b border-black/[0.05] dark:border-white/[0.05]">
              <td className="py-1.5 pr-2">
                <b>极简</b>
              </td>
              <td className="py-1.5 px-2 text-emerald-600">低</td>
              <td className="py-1.5 pl-2">只压拒绝口径，不踩 Anthropic 网关</td>
            </tr>
            <tr className="border-b border-black/[0.05] dark:border-white/[0.05]">
              <td className="py-1.5 pr-2">
                <b>软版</b>
              </td>
              <td className="py-1.5 px-2 text-amber-600">中</td>
              <td className="py-1.5 pl-2">去 cyber 关键词 + 保留 OVERRIDE 优先级</td>
            </tr>
            <tr className="border-b border-black/[0.05] dark:border-white/[0.05]">
              <td className="py-1.5 pr-2">
                <b>原版</b>
              </td>
              <td className="py-1.5 px-2 text-rose-600">高</td>
              <td className="py-1.5 pl-2">
                含 malware/exploit/RAT 完整白名单，⚠️ 必触 Anthropic cyber-policy 拒绝
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pr-2">
                <b>自定义</b>
              </td>
              <td className="py-1.5 px-2 text-gray-500 dark:text-gray-400">取决</td>
              <td className="py-1.5 pl-2">用 textarea 自己改</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-[12px] text-amber-700 dark:text-amber-300">
          ⚠ 注入文本不会上传第三方，仅在本机 MITM 拦截阶段附加到请求体。
          仅供本地实验/学术研究使用。
        </p>
      </>
    ),
  },
];

/**
 * Help — Vue 1:1 完整迁移：7 章 FAQ 折叠 + 搜索过滤。
 */
export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [openedChapter, setOpenedChapter] = useState<string>("");

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CHAPTERS;
    return CHAPTERS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto w-full pb-12">
      <header className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-ios-blue to-cyan-400 text-white flex items-center justify-center shadow-[0_10px_24px_rgba(37,99,235,0.24)]">
          <BookOpen className="h-7 w-7" strokeWidth={2.4} />
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-ios-text dark:text-ios-textDark tracking-tight">
            帮助 / FAQ
          </h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-0.5">
            7 章常见问答 — 点击展开看详细说明
          </p>
        </div>
      </header>

      {/* 搜索 */}
      <div className="relative mb-6">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          strokeWidth={2.4}
        />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          type="search"
          placeholder="搜索章节…"
          className="no-drag-region w-full pl-11 pr-4 py-3 rounded-[14px] bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] text-[14px] outline-none focus:ring-2 focus:ring-ios-blue/25"
        />
      </div>

      {/* FAQ 列表 */}
      <div className="space-y-2">
        {filteredChapters.map((c) => {
          const Icon = c.icon;
          const open = openedChapter === c.id;
          return (
            <article
              key={c.id}
              className="rounded-[20px] border border-black/[0.05] dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.04] overflow-hidden transition-all"
            >
              <button
                type="button"
                className="no-drag-region w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                onClick={() => setOpenedChapter(open ? "" : c.id)}
              >
                <div
                  className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 ${c.iconColor}`}
                >
                  <Icon className="w-5 h-5" strokeWidth={2.4} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-ios-text dark:text-ios-textDark">
                    {c.title}
                  </div>
                  <div className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
                    {c.summary}
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 shrink-0 text-gray-400 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                  strokeWidth={2.4}
                />
              </button>
              {open ? (
                <div className="px-5 pb-5 pt-1 border-t border-black/[0.05] dark:border-white/[0.06]">
                  <div className="prose-content text-[13.5px] leading-relaxed text-gray-700 dark:text-gray-300 space-y-3 pt-3">
                    {c.content}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}

        {filteredChapters.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">
            没找到匹配的章节 — 试试别的关键词
          </div>
        ) : null}
      </div>

      <div className="mt-8 rounded-ios-block border border-ios-blue/15 bg-ios-blue/[0.06] p-4 text-[12.5px] text-ios-blue dark:text-blue-300 flex items-start gap-2">
        <HelpCircle className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={2.3} />
        <div className="leading-relaxed">
          还有疑问？打开 <b>「关于」</b> 页面加作者微信或微信群提问；或在 GitHub 仓库提 issue。
        </div>
      </div>
    </div>
  );
}
