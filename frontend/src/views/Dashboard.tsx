import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Globe,
  Link2,
  Play,
  Plus,
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { APIInfo } from "../api/wails";
import F7Banner from "../components/F7Banner";
import MitmPanel from "../components/MitmPanel";
import PageLoadingSkeleton from "../components/common/PageLoadingSkeleton";
import SkeletonOverlay from "../components/common/SkeletonOverlay";
// F7-REMOVAL: useSmartFriend 仅在 F7 模式下生效，发布前一并删除
import { useSmartFriend } from "../hooks/useSmartFriend";
import { useAccountStore } from "../stores/useAccountStore";
import { useMainViewStore } from "../stores/useMainViewStore";
import { useMitmStatusStore } from "../stores/useMitmStatusStore";
import { useRelayStatusStore } from "../stores/useRelayStatusStore";
import {
  getAccountHealth,
  isWeeklyQuotaBlocked,
  truncateMiddle,
} from "../utils/account";
import { showErrorToast, showToast } from "../utils/toast";

type DiagnoseStatus = "ok" | "warn" | "error" | "n/a";
type DiagnoseCheckItem = {
  id: string;
  title: string;
  status: DiagnoseStatus;
  detail: string;
  fix_hint?: string;
};
type DiagnoseReportData = {
  platform: string;
  arch: string;
  ok: number;
  warn: number;
  error: number;
  checks: DiagnoseCheckItem[];
};

const diagnoseStatusClass = (s: DiagnoseStatus): string => {
  switch (s) {
    case "ok":
      return "border-emerald-500/15 bg-emerald-500/[0.05]";
    case "warn":
      return "border-amber-500/20 bg-amber-500/[0.06]";
    case "error":
      return "border-rose-500/20 bg-rose-500/[0.07]";
    default:
      return "border-gray-300/30 bg-gray-100/30";
  }
};

/**
 * Dashboard — Vue 1:1 完整迁移。
 * hero header / 5 summary 卡 / F7Banner / MitmPanel / onboarding 3 步 /
 * 快速跳转 actionCards / 周阻断提示 / 平台兼容性诊断 modal。
 */
export default function Dashboard() {
  const accounts = useAccountStore((s) => s.accounts);
  const accHasLoadedOnce = useAccountStore((s) => s.hasLoadedOnce);
  const mitmStatus = useMitmStatusStore((s) => s.status);
  const mitmHasLoadedOnce = useMitmStatusStore((s) => s.hasLoadedOnce);
  const relayStatus = useRelayStatusStore((s) => s.status);
  const relayHasLoadedOnce = useRelayStatusStore((s) => s.hasLoadedOnce);
  const setActiveTab = useMainViewStore((s) => s.setActiveTab);
  const sf = useSmartFriend();

  const [refreshing, setRefreshing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnoseReportData | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  const mitmPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void Promise.all([
      useAccountStore.getState().ensureAccountsLoaded(),
      useMitmStatusStore.getState().ensureStatusLoaded(),
      useRelayStatusStore.getState().ensureStatusLoaded(),
    ]);
  }, []);

  const refreshOverview = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        useAccountStore.getState().fetchAccounts(true),
        useMitmStatusStore.getState().fetchStatus(),
        useRelayStatusStore.getState().fetchStatus(true),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const r = (await APIInfo.runDiagnostics()) as DiagnoseReportData;
      setDiagnostics(r);
      setShowDiagnostics(true);
      const summary = `${r.ok} 通过 / ${r.warn} 警告 / ${r.error} 错误`;
      if (r.error > 0) {
        showToast(`平台兼容性: ${summary}（有问题需修）`, "warning", 5000);
      } else if (r.warn > 0) {
        showToast(`平台兼容性: ${summary}（建议优化）`, "info", 4000);
      } else {
        showToast("平台兼容性: 全部通过 ✓", "success", 3000);
      }
    } catch (e) {
      showErrorToast(e, "诊断失败");
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const booting = !accHasLoadedOnce || !mitmHasLoadedOnce || !relayHasLoadedOnce;

  const totalAccounts = accounts.length;
  const expiredAccounts = useMemo(
    () => accounts.filter((a) => getAccountHealth(a) === "expired").length,
    [accounts],
  );
  const criticalAccounts = useMemo(() => {
    if (sf.active) return 0;
    return accounts.filter((a) => getAccountHealth(a) === "critical").length;
  }, [accounts, sf.active]);
  const blockedAccounts = useMemo(() => {
    if (sf.active) return 0;
    return accounts.filter((a) => isWeeklyQuotaBlocked(a)).length;
  }, [accounts, sf.active]);
  const healthyAccounts = useMemo(() => {
    if (sf.active) return Math.max(0, totalAccounts - expiredAccounts);
    return accounts.filter((a) => getAccountHealth(a) === "healthy").length;
  }, [accounts, sf.active, totalAccounts, expiredAccounts]);

  const activeKey = useMemo(
    () => mitmStatus?.pool_status?.find((i) => i.is_current) ?? null,
    [mitmStatus],
  );
  const relayRunning = relayStatus?.running === true;

  const topSummaryCards: Array<{
    key: string;
    label: string;
    value: string;
    detail: string;
    tone: string;
    icon: ComponentType<{ className?: string; strokeWidth?: number | string }>;
  }> = [
    {
      key: "pool",
      label: "号池总数",
      value: String(totalAccounts),
      detail:
        healthyAccounts > 0 ? `健康 ${healthyAccounts} 个` : "等待可用账号",
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
      icon: Users,
    },
    {
      key: "mitm",
      label: "MITM 状态",
      value: mitmStatus?.running ? "运行中" : "未启动",
      detail: mitmStatus?.running
        ? activeKey?.key_short
          ? `当前 ${truncateMiddle(activeKey.key_short, 10, 5)}`
          : "等待活跃 Key"
        : "先完成证书、Hosts 与启用",
      tone: mitmStatus?.running
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      icon: ShieldCheck,
    },
    {
      key: "relay",
      label: "Relay",
      value: relayRunning ? "已启动" : "未启动",
      detail: relayRunning
        ? `127.0.0.1:${relayStatus?.port || 8787}`
        : "需要时可单独启动",
      tone: relayRunning
        ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
        : "bg-slate-500/10 text-slate-700 dark:text-slate-300",
      icon: Globe,
    },
    {
      key: "sessions",
      label: "活跃会话",
      value: String(mitmStatus?.session_count ?? 0),
      detail:
        (mitmStatus?.session_count ?? 0) > 0
          ? `${mitmStatus?.session_count} 个对话绑定中`
          : "暂无活跃会话绑定",
      tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      icon: Link2,
    },
    {
      key: "requests",
      label: "代理请求",
      value: String(mitmStatus?.total_requests ?? 0),
      detail:
        blockedAccounts > 0
          ? `周额度阻断 ${blockedAccounts}`
          : "暂未发现周额度阻断",
      tone: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
      icon: Activity,
    },
  ];

  const actionCards = [
    {
      key: "accounts",
      title: "管理号池",
      body: "导入 API Key、刷新额度、检查健康状态与到期账号。",
      tab: "Accounts" as const,
    },
    {
      key: "relay",
      title: "配置 Relay",
      body: "查看 8787 端口、复制接入地址，验证 OpenAI 兼容调用。",
      tab: "Relay" as const,
    },
    {
      key: "settings",
      title: "调整 MITM 设置",
      body: "确认后台服务、自动刷新、自动切换与启动参数。",
      tab: "Settings" as const,
    },
  ];

  // ── onboarding 3 步 ──
  const hasAccount = totalAccounts > 0;
  const caReady = Boolean(mitmStatus?.ca_installed);
  const hostsReady = Boolean(mitmStatus?.hosts_mapped);
  const setupReady = caReady && hostsReady;
  const mitmRunning = Boolean(mitmStatus?.running);

  const scrollToMitm = () => {
    mitmPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const onboardingStepsRaw = [
    {
      key: "import",
      index: 1,
      title: "导入账号到号池",
      description: hasAccount
        ? `已有 ${totalAccounts} 个账号，可继续追加。`
        : "粘贴 API Key / JWT / 邮箱密码，自动识别格式入池。",
      done: hasAccount,
      icon: Plus,
      cta: hasAccount ? "再导一批" : "去导入",
      onClick: () => setActiveTab("Accounts"),
    },
    {
      key: "ca-hosts",
      index: 2,
      title: "装 CA 证书 + Hosts 接管",
      description: setupReady
        ? "CA 已信任 + Hosts 已映射，本机接管路径就绪。"
        : !caReady && !hostsReady
          ? "下方 MITM 面板「一键安装」会同时配好两项，需要管理员密码。"
          : !caReady
            ? "CA 证书还没信任，下方 MITM 面板里点「安装证书」。"
            : "Hosts 还没配置，下方 MITM 面板里点「配置 Hosts」。",
      done: setupReady,
      icon: ShieldCheck,
      cta: setupReady ? "已就绪" : "前往配置",
      onClick: scrollToMitm,
    },
    {
      key: "mitm-on",
      index: 3,
      title: "打开 MITM 代理",
      description: mitmRunning
        ? "代理已运行，IDE 流量正在按号池切号。"
        : setupReady
          ? "下方 MITM 面板里点开关，启动后 IDE 即可正常对话。"
          : "完成上一步后再回来打开。",
      done: mitmRunning,
      icon: Play,
      cta: mitmRunning ? "运行中" : "启动代理",
      onClick: scrollToMitm,
    },
  ];

  const firstUndoneIdx = onboardingStepsRaw.findIndex((s) => !s.done);
  const onboardingSteps = onboardingStepsRaw.map((s, i) => ({
    ...s,
    current: i === firstUndoneIdx,
  }));
  const allOnboardingDone = onboardingSteps.every((s) => s.done);

  if (booting) {
    return <PageLoadingSkeleton variant="dashboard" className="w-full" />;
  }

  return (
    <SkeletonOverlay
      active={refreshing}
      label="总览刷新中"
      skeleton={<PageLoadingSkeleton variant="dashboard" className="w-full" />}
    >
      <div className="space-y-6 p-6">
        {/* hero header */}
        <section className="ios-glass overflow-hidden rounded-ios-card border border-black/[0.05] shadow-[0_20px_48px_-20px_rgba(15,23,42,0.18)] dark:border-white/[0.06]">
          <div className="border-b border-black/[0.05] dark:border-white/[0.06] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ios-blue/10 text-ios-blue shadow-inner">
                  <ShieldCheck className="h-5 w-5" strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-[17px] font-bold text-ios-text dark:text-ios-textDark">
                      MITM 总览
                    </h1>
                    <span className="rounded-full bg-ios-blue/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ios-blue">
                      Pure MITM
                    </span>
                  </div>
                  <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ios-textSecondary dark:text-ios-textSecondaryDark">
                    这里保留纯 MITM 模式最关键的启用链路：看号池健康、完成 CA 与
                    Hosts、打开代理、确认当前活跃 Key，并快速跳去 Relay 与设置页。
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="no-drag-region inline-flex items-center gap-2 rounded-full border border-violet-500/15 bg-violet-500/10 px-4 py-2 text-[12px] font-semibold text-violet-700 dark:text-violet-300 shadow-sm transition-all ios-btn hover:bg-violet-500/15 disabled:opacity-50"
                  disabled={diagnosticsLoading}
                  onClick={handleRunDiagnostics}
                >
                  <ShieldCheck
                    className={`h-3.5 w-3.5 ${
                      diagnosticsLoading ? "animate-spin" : ""
                    }`}
                    strokeWidth={2.4}
                  />
                  {diagnosticsLoading ? "检查中..." : "平台兼容性检查"}
                </button>
                <button
                  type="button"
                  className="no-drag-region inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/80 px-4 py-2 text-[12px] font-semibold text-ios-text shadow-sm transition-all ios-btn hover:bg-black/[0.04] disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-ios-textDark"
                  disabled={refreshing}
                  onClick={refreshOverview}
                >
                  <RefreshCcw
                    className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                    strokeWidth={2.4}
                  />
                  {refreshing ? "刷新中..." : "刷新总览"}
                </button>
              </div>
            </div>
          </div>

          {/* F7Banner full */}
          <F7Banner variant="full" />

          {/* summary 卡片 grid */}
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
            {topSummaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className="rounded-[20px] border border-black/[0.05] bg-white/70 p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-2xl ${card.tone}`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.4} />
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                      {card.label}
                    </div>
                  </div>
                  <div className="mt-3 text-[24px] font-extrabold leading-none text-ios-text dark:text-ios-textDark">
                    {card.value}
                  </div>
                  <div className="mt-2 text-[11.5px] leading-relaxed text-ios-textSecondary dark:text-ios-textSecondaryDark">
                    {card.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 主区 grid: MitmPanel | (onboarding + actions + warning) */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div ref={mitmPanelRef} className="min-w-0">
            <MitmPanel />
          </div>

          <div className="space-y-6">
            {/* onboarding */}
            <div className="ios-glass rounded-[24px] border border-black/[0.05] p-5 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.18)] dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl ${
                    allOnboardingDone
                      ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                      : "bg-ios-blue/12 text-ios-blue"
                  }`}
                >
                  {allOnboardingDone ? (
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} />
                  ) : (
                    <Activity className="h-4 w-4" strokeWidth={2.4} />
                  )}
                </div>
                <div>
                  <div className="text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                    {allOnboardingDone ? "已就绪 · 三步全部完成" : "三步上手"}
                  </div>
                  <div className="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                    {allOnboardingDone
                      ? "MITM 已接管 IDE 流量,可以专注号池管理或对接外部客户端。"
                      : "按顺序点击下方步骤,每步都会跳到对应位置。"}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {onboardingSteps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <button
                      key={step.key}
                      type="button"
                      className={[
                        "no-drag-region group flex w-full items-start gap-3 rounded-ios-block border px-3 py-3 text-left transition-all ios-btn",
                        step.done
                          ? "border-emerald-500/15 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.08]"
                          : step.current
                            ? "border-ios-blue/30 bg-ios-blue/[0.06] shadow-[0_8px_24px_-14px_rgba(37,99,235,0.4)] hover:-translate-y-0.5 hover:bg-ios-blue/[0.10]"
                            : "border-black/[0.05] bg-black/[0.02] dark:border-white/[0.06] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                      ].join(" ")}
                      onClick={step.onClick}
                    >
                      <span
                        className={[
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-black",
                          step.done
                            ? "bg-emerald-500 text-white"
                            : step.current
                              ? "bg-ios-blue text-white shadow-md shadow-ios-blue/30"
                              : "bg-black/[0.08] text-ios-textSecondary dark:bg-white/[0.1] dark:text-ios-textSecondaryDark",
                        ].join(" ")}
                      >
                        {step.done ? (
                          <CheckCircle2 className="h-4 w-4" strokeWidth={2.6} />
                        ) : (
                          <span>{step.index}</span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                          <Icon className="h-3.5 w-3.5 opacity-80" strokeWidth={2.5} />
                          {step.title}
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-ios-textSecondary dark:text-ios-textSecondaryDark">
                          {step.description}
                        </div>
                      </div>
                      <div
                        className={[
                          "ml-auto inline-flex shrink-0 items-center gap-0.5 self-center text-[11px] font-bold transition-all",
                          step.done
                            ? "text-emerald-600 dark:text-emerald-300"
                            : step.current
                              ? "text-ios-blue dark:text-blue-300 group-hover:gap-1.5"
                              : "text-ios-textSecondary dark:text-ios-textSecondaryDark",
                        ].join(" ")}
                      >
                        {step.cta}
                        {!step.done ? (
                          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 快速跳转 */}
            <div className="ios-glass rounded-[24px] border border-black/[0.05] p-5 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.18)] dark:border-white/[0.06]">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
                  <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                    快速跳转
                  </div>
                  <div className="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                    保留总览，但把重操作仍放回各自页面。
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {actionCards.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="no-drag-region flex w-full items-start justify-between gap-3 rounded-[18px] border border-black/[0.05] bg-white/70 px-4 py-3 text-left shadow-sm transition-all ios-btn hover:-translate-y-0.5 dark:border-white/[0.06] dark:bg-white/[0.04]"
                    onClick={() => setActiveTab(item.tab)}
                  >
                    <div>
                      <div className="text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed text-ios-textSecondary dark:text-ios-textSecondaryDark">
                        {item.body}
                      </div>
                    </div>
                    <ArrowRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-ios-textSecondary dark:text-ios-textSecondaryDark"
                      strokeWidth={2.4}
                    />
                  </button>
                ))}
              </div>
            </div>

            {blockedAccounts > 0 ? (
              <div className="rounded-[20px] border border-amber-500/18 bg-amber-500/[0.07] px-4 py-3 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
                <div className="flex items-start gap-3">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
                  <div>
                    当前检测到 {blockedAccounts}{" "}
                    个账号处于"周额度阻断"状态。即使日额度看起来还有值，这类账号也不应再参与可用候选。
                  </div>
                </div>
              </div>
            ) : null}

            {criticalAccounts > 0 || expiredAccounts > 0 ? (
              <div className="rounded-[20px] border border-rose-500/18 bg-rose-500/[0.06] px-4 py-3 text-[12px] leading-relaxed text-rose-700 dark:text-rose-300">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
                  <div>
                    {criticalAccounts > 0
                      ? `${criticalAccounts} 个账号额度告急；`
                      : ""}
                    {expiredAccounts > 0
                      ? `${expiredAccounts} 个账号已过期，建议到「号池」清理。`
                      : ""}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* 诊断结果 modal */}
      {showDiagnostics && diagnostics ? (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-md p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDiagnostics(false);
          }}
        >
          <div className="w-full max-w-[640px] max-h-[80vh] flex flex-col bg-white dark:bg-[#1c1c1e] rounded-ios-card shadow-ios-sheet ring-1 ring-white/50 dark:ring-white/10 overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06]">
              <div>
                <h2 className="text-[16px] font-bold text-ios-text dark:text-ios-textDark">
                  平台兼容性检查
                </h2>
                <p className="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                  {diagnostics.platform} · {diagnostics.arch} · 通过{" "}
                  {diagnostics.ok}，警告 {diagnostics.warn}，错误{" "}
                  {diagnostics.error}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 ios-btn"
                onClick={() => setShowDiagnostics(false)}
              >
                <X className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {diagnostics.checks.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-[14px] border p-3 ${diagnoseStatusClass(c.status)}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      {c.status === "ok" ? (
                        <CheckCircle2
                          className="h-4 w-4 text-emerald-600 dark:text-emerald-300"
                          strokeWidth={2.4}
                        />
                      ) : c.status === "error" ? (
                        <XCircle
                          className="h-4 w-4 text-rose-600 dark:text-rose-300"
                          strokeWidth={2.4}
                        />
                      ) : c.status === "warn" ? (
                        <TriangleAlert
                          className="h-4 w-4 text-amber-600 dark:text-amber-300"
                          strokeWidth={2.4}
                        />
                      ) : (
                        <AlertCircle
                          className="h-4 w-4 text-gray-500"
                          strokeWidth={2.4}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                        {c.title}
                      </div>
                      <div className="mt-1 text-[11.5px] leading-relaxed text-ios-textSecondary dark:text-ios-textSecondaryDark">
                        {c.detail}
                      </div>
                      {c.fix_hint ? (
                        <div className="mt-2 rounded-[10px] bg-black/[0.04] dark:bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-ios-text dark:text-ios-textDark">
                          💡 {c.fix_hint}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </SkeletonOverlay>
  );
}
