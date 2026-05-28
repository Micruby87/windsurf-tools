import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Compass,
  Globe,
  HardDriveDownload,
  Heart,
  KeyRound,
  LayoutDashboard,
  Lock,
  Play,
  Plus,
  Power,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  Shuffle,
  Square,
  User,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { APIInfo } from "../api/wails";
import { useAccountStore } from "../stores/useAccountStore";
import { useMainViewStore } from "../stores/useMainViewStore";
import { useMitmStatusStore } from "../stores/useMitmStatusStore";
import { useRelayStatusStore } from "../stores/useRelayStatusStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import type { ShellViewTab } from "../utils/appMode";
import { showErrorToast, showToast } from "../utils/toast";

/**
 * 1.1: Cmd+K 命令面板。
 *
 * 通过 window CustomEvent 'open-command-palette' 触发（useGlobalHotkeys 派发）。
 * 'close-overlays' 关闭。
 *
 * 命令分组：
 * - 导航：跳转主 tab
 * - MITM：启停 / 切下一席 / 一键就绪 / 卸载
 * - Relay：启停
 * - 账号：刷 Token / 刷额度 / 解锁 Pin / 打开导入弹窗
 * - 诊断
 * - 账号搜索（动态）：按 nickname / email / plan 模糊匹配，选中跳到 Accounts 高亮
 *
 * 模糊匹配自己写（轻量）：按字符顺序连续匹配，不需要 npm 依赖。
 */

type IconType = ComponentType<{ className?: string; strokeWidth?: number | string }>;
type CommandGroup = "导航" | "MITM" | "Relay" | "账号" | "诊断" | "账号搜索";

interface PaletteCommand {
  id: string;
  group: CommandGroup;
  title: string;
  subtitle?: string;
  icon: IconType;
  /** 执行后是否自动关闭面板（默认 true）。 */
  closeAfter?: boolean;
  run: () => void | Promise<void>;
}

/**
 * 简易模糊匹配：query 字符按顺序在 target 中出现即匹配。
 * 返回 score（越小越好）+ 是否匹配。
 */
function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let lastIdx = -1;
  let gaps = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (lastIdx >= 0) gaps += ti - lastIdx - 1;
      lastIdx = ti;
      qi++;
    }
  }
  if (qi < q.length) return { match: false, score: Infinity };
  // score: gaps + 起点位置（越早越好）
  const firstIdx = t.indexOf(q[0]);
  return { match: true, score: gaps + (firstIdx >= 0 ? firstIdx : 0) };
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const setActiveTab = useMainViewStore((s) => s.setActiveTab);
  const openImportModal = useMainViewStore((s) => s.openImportModal);
  const requestDashboardDiagnostics = useMainViewStore(
    (s) => s.requestDashboardDiagnostics,
  );
  const highlightAndJumpToAccount = useMainViewStore(
    (s) => s.highlightAndJumpToAccount,
  );
  const accounts = useAccountStore((s) => s.accounts);
  const mitmStatus = useMitmStatusStore((s) => s.status);
  const relayStatus = useRelayStatusStore((s) => s.status);
  const settings = useSettingsStore((s) => s.settings);

  // 监听全局打开/关闭事件
  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setQuery("");
      setActiveIdx(0);
    };
    const onClose = () => setOpen(false);
    window.addEventListener("open-command-palette", onOpen);
    window.addEventListener("close-overlays", onClose);
    return () => {
      window.removeEventListener("open-command-palette", onOpen);
      window.removeEventListener("close-overlays", onClose);
    };
  }, []);

  // 打开后自动 focus 输入框
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── 静态命令列表 ──
  const staticCommands: PaletteCommand[] = useMemo(() => {
    const navTabs: Array<{ id: string; tab: ShellViewTab; title: string; icon: IconType }> = [
      { id: "nav-dashboard", tab: "Dashboard", title: "总览 (Dashboard)", icon: LayoutDashboard },
      { id: "nav-accounts", tab: "Accounts", title: "号池 (Accounts)", icon: Users },
      { id: "nav-usage", tab: "Usage", title: "用量统计 (Usage)", icon: Activity },
      { id: "nav-relay", tab: "Relay", title: "OpenAI Relay", icon: Globe },
      { id: "nav-cleanup", tab: "Cleanup", title: "清理优化 (Cleanup)", icon: HardDriveDownload },
      { id: "nav-settings", tab: "Settings", title: "MITM 设置 (Settings)", icon: SettingsIcon },
      { id: "nav-help", tab: "Help", title: "帮助 (Help)", icon: Compass },
      { id: "nav-about", tab: "About", title: "关于 (About)", icon: Heart },
    ];
    const navCommands: PaletteCommand[] = navTabs.map((t) => ({
      id: t.id,
      group: "导航",
      title: t.title,
      subtitle: "跳转视图",
      icon: t.icon,
      run: () => setActiveTab(t.tab),
    }));

    const mitmRunning = Boolean(mitmStatus?.running);
    const relayRunning = Boolean(relayStatus?.running);
    const poolCount = mitmStatus?.pool_status?.length ?? 0;
    const isPinned = settings?.manual_pin_enabled === true;

    const mitmCommands: PaletteCommand[] = [
      {
        id: "mitm-toggle",
        group: "MITM",
        title: mitmRunning ? "停止 MITM 代理" : "启动 MITM 代理",
        subtitle: mitmRunning ? "停止本机代理监听" : "启动 MITM 接管 IDE 流量",
        icon: mitmRunning ? Square : Play,
        run: async () => {
          try {
            if (mitmRunning) {
              await APIInfo.stopMitmProxy();
              showToast("MITM 已停止", "success");
            } else {
              await APIInfo.startMitmProxy();
              showToast("MITM 已启动", "success");
            }
            await useMitmStatusStore.getState().fetchStatus(true);
          } catch (e) {
            showErrorToast(e, "切换 MITM 失败");
          }
        },
      },
      {
        id: "mitm-next",
        group: "MITM",
        title: "切到下一席位",
        subtitle: poolCount > 0 ? `号池 ${poolCount} 个 key 可轮换` : "号池为空",
        icon: Shuffle,
        run: async () => {
          if (poolCount === 0) {
            showToast("号池为空，请先导入账号", "warning");
            return;
          }
          try {
            const target = await useMitmStatusStore.getState().switchToNext();
            showToast(`MITM 已切到下一席位${target ? `：${target}` : ""}`, "success");
          } catch (e) {
            showErrorToast(e, "手动切换失败");
          }
        },
      },
      {
        id: "mitm-setup-all",
        group: "MITM",
        title: "一键就绪 CA + Hosts",
        subtitle: "安装证书 + 配置 hosts",
        icon: ShieldCheck,
        run: async () => {
          try {
            await APIInfo.setupMitmAll();
            await useMitmStatusStore.getState().fetchStatus(true);
            showToast("CA + Hosts 一键安装完成", "success");
          } catch (e) {
            showErrorToast(e, "一键安装失败");
          }
        },
      },
      {
        id: "mitm-teardown",
        group: "MITM",
        title: "卸载 MITM（停代理 + 移 Hosts/CA）",
        subtitle: "完全停用 MITM 接管",
        icon: Power,
        run: async () => {
          try {
            await APIInfo.teardownMitm();
            await useMitmStatusStore.getState().fetchStatus(true);
            showToast("MITM 已完全卸载", "success");
          } catch (e) {
            showErrorToast(e, "卸载 MITM 失败");
          }
        },
      },
    ];

    const relayCommands: PaletteCommand[] = [
      {
        id: "relay-toggle",
        group: "Relay",
        title: relayRunning ? "停止 OpenAI Relay" : "启动 OpenAI Relay",
        subtitle: relayRunning ? "停止 8787 中转" : "启动本地兼容中转",
        icon: relayRunning ? Square : Play,
        run: async () => {
          try {
            if (relayRunning) {
              await APIInfo.stopOpenAIRelay();
              showToast("Relay 已停止", "success");
            } else {
              const port = settings?.openai_relay_port || 8787;
              const secret = settings?.openai_relay_secret || "";
              await APIInfo.startOpenAIRelay(port, secret);
              showToast("Relay 已启动", "success");
            }
            await useRelayStatusStore.getState().fetchStatus(true);
          } catch (e) {
            showErrorToast(e, "切换 Relay 失败");
          }
        },
      },
    ];

    const accountCommands: PaletteCommand[] = [
      {
        id: "import-modal",
        group: "账号",
        title: "打开导入弹窗",
        subtitle: "粘贴 / 拖拽凭证文件批量导入",
        icon: Plus,
        run: () => openImportModal(),
      },
      {
        id: "refresh-tokens",
        group: "账号",
        title: "全量刷新 Token (JWT)",
        subtitle: `共 ${accounts.length} 个账号`,
        icon: RefreshCcw,
        run: async () => {
          try {
            const map = await useAccountStore.getState().refreshAllTokens();
            const entries = Object.entries(map || {});
            const ok = entries.filter(([, v]) => String(v).includes("成功")).length;
            await useMitmStatusStore.getState().fetchStatus(true);
            showToast(`Token 刷新完成：${ok} / ${entries.length}`, "success");
          } catch (e) {
            showErrorToast(e, "刷新 Token 失败");
          }
        },
      },
      {
        id: "refresh-quotas",
        group: "账号",
        title: "全量同步额度",
        subtitle: `共 ${accounts.length} 个账号`,
        icon: KeyRound,
        run: async () => {
          try {
            const map = await useAccountStore.getState().refreshAllQuotas();
            const entries = Object.entries(map || {});
            const synced = entries.filter(([, v]) => String(v).includes("已同步")).length;
            await useMitmStatusStore.getState().fetchStatus(true);
            showToast(`额度同步完成：${synced} / ${entries.length}`, "success");
          } catch (e) {
            showErrorToast(e, "同步额度失败");
          }
        },
      },
    ];

    if (isPinned) {
      accountCommands.push({
        id: "unpin",
        group: "账号",
        title: "解锁 Manual Pin（恢复自动切换）",
        subtitle: "当前已锁定到指定账号",
        icon: Lock,
        run: async () => {
          try {
            await APIInfo.unpinManualAccount();
            await useSettingsStore.getState().fetchSettings(true);
            showToast("已解锁，自动切换已恢复", "success");
          } catch (e) {
            showErrorToast(e, "解锁失败");
          }
        },
      });
    }

    const diagCommands: PaletteCommand[] = [
      {
        id: "diagnostics",
        group: "诊断",
        title: "平台兼容性检查",
        subtitle: "打开 Dashboard 并展示完整报告",
        icon: Shield,
        run: () => requestDashboardDiagnostics(),
      },
    ];

    return [...navCommands, ...mitmCommands, ...relayCommands, ...accountCommands, ...diagCommands];
  }, [
    setActiveTab,
    openImportModal,
    requestDashboardDiagnostics,
    mitmStatus?.running,
    mitmStatus?.pool_status?.length,
    relayStatus?.running,
    settings?.manual_pin_enabled,
    settings?.openai_relay_port,
    settings?.openai_relay_secret,
    accounts.length,
  ]);

  // ── 动态：账号搜索 ──
  const accountCommands: PaletteCommand[] = useMemo(() => {
    return accounts.map((acc) => {
      const display =
        (acc.nickname || "").trim() || (acc.email || "").trim() || acc.id;
      return {
        id: `acc-${acc.id}`,
        group: "账号搜索" as const,
        title: display,
        subtitle: `${acc.plan_name || "—"}${acc.email && acc.email !== display ? ` · ${acc.email}` : ""}`,
        icon: User,
        run: () => highlightAndJumpToAccount(acc.id),
      };
    });
  }, [accounts, highlightAndJumpToAccount]);

  // ── 过滤 + 排序 ──
  const filtered: PaletteCommand[] = useMemo(() => {
    const q = query.trim();
    const all = [...staticCommands, ...accountCommands];
    if (!q) {
      // 无 query 时只返回静态命令（账号太多，避免炸列表）
      return staticCommands;
    }
    const scored = all
      .map((c) => {
        const haystack = `${c.title} ${c.subtitle ?? ""} ${c.group}`;
        const r = fuzzyMatch(q, haystack);
        return { cmd: c, score: r.score, match: r.match };
      })
      .filter((x) => x.match)
      .sort((a, b) => a.score - b.score);
    return scored.slice(0, 50).map((x) => x.cmd);
  }, [query, staticCommands, accountCommands]);

  // 重置 activeIdx 当 filtered 变化
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // 滚动到 activeIdx
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-idx="${activeIdx}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) executeCommand(cmd);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const executeCommand = (cmd: PaletteCommand) => {
    if (cmd.closeAfter !== false) setOpen(false);
    void Promise.resolve(cmd.run());
  };

  // 分组渲染
  const groups: Array<{ name: CommandGroup; items: PaletteCommand[] }> = [];
  for (const cmd of filtered) {
    let g = groups.find((x) => x.name === cmd.group);
    if (!g) {
      g = { name: cmd.group, items: [] };
      groups.push(g);
    }
    g.items.push(cmd);
  }

  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[12vh] px-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="命令面板"
    >
      <div
        className="w-full max-w-[640px] rounded-[18px] bg-white dark:bg-[#1C1C1E] shadow-2xl ring-1 ring-black/[0.05] dark:ring-white/[0.06] overflow-hidden flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <Search
            className="h-4 w-4 shrink-0 text-ios-textSecondary dark:text-ios-textSecondaryDark"
            strokeWidth={2.6}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="跳转视图、执行命令、搜索账号…"
            className="flex-1 bg-transparent text-[14px] text-ios-text dark:text-ios-textDark placeholder:text-ios-textSecondary dark:placeholder:text-ios-textSecondaryDark outline-none"
          />
          <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark">
            <kbd className="rounded bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-0.5">Esc</kbd>
            关闭
          </span>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-[12px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
              没有匹配项 · 试试「切换」「刷新」「设置」
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                  {group.name}
                </div>
                {group.items.map((cmd) => {
                  const myIdx = runningIdx++;
                  const Icon = cmd.icon;
                  const active = myIdx === activeIdx;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-cmd-idx={myIdx}
                      className={[
                        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                        active
                          ? "bg-ios-blue/10 text-ios-blue"
                          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                      ].join(" ")}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setActiveIdx(myIdx)}
                    >
                      <span
                        className={[
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]",
                          active
                            ? "bg-ios-blue/15 text-ios-blue"
                            : "bg-black/[0.04] text-ios-text dark:bg-white/[0.06] dark:text-ios-textDark",
                        ].join(" ")}
                      >
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-ios-text dark:text-ios-textDark">
                          {cmd.title}
                        </div>
                        {cmd.subtitle ? (
                          <div className="truncate text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                            {cmd.subtitle}
                          </div>
                        ) : null}
                      </div>
                      {active ? (
                        <span className="hidden md:inline-flex shrink-0 items-center gap-1 text-[9px] font-bold text-ios-blue">
                          <kbd className="rounded bg-ios-blue/15 px-1.5 py-0.5">↵</kbd>
                          回车执行
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-black/[0.06] dark:border-white/[0.08] px-3 py-2 text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-0.5">↑↓</kbd>
            导航
            <kbd className="ml-2 rounded bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-0.5">↵</kbd>
            执行
          </span>
          <span className="hidden md:inline">{filtered.length} 项</span>
        </div>
      </div>
    </div>
  );
}
