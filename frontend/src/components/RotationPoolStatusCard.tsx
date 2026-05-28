import { useEffect, useState } from "react";
import {
  Clock,
  Lock,
  RefreshCcw,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { APIInfo } from "../api/wails";
import { showErrorToast, showToast } from "../utils/toast";

/**
 * P2: RotationPool 状态卡
 *
 * 把后端 GetRotationPoolStatus 暴露的所有数据可视化，并提供两个手动触发按钮：
 *   - rotationPoolSwitchNow —— 立即切池内下一席
 *   - rotationPoolRefreshQuotasNow —— 立即刷新池内所有账号额度
 *
 * 数据：
 *   - enabled / member_count / interval_min / quota_refresh_min
 *   - next_switch_at / last_switched_to / last_switched_at / last_quota_refresh_at
 *   - last_error / total_switches / total_quota_refreshes
 *   - paused_by_pin
 *
 * UI 设计：
 *   - 紧凑横排：左 status pill，右 totals + 操作按钮
 *   - 倒计时下次切换 + 上次切到谁的时间相对显示
 *   - 仅在 enabled=true 时渲染（disabled 时返回 null）
 */

interface RotationPoolStatus {
  enabled: boolean;
  member_count: number;
  interval_min: number;
  quota_refresh_min: number;
  next_switch_at?: string;
  last_switched_to?: string;
  last_switched_at?: string;
  last_quota_refresh_at?: string;
  last_error?: string;
  total_switches: number;
  total_quota_refreshes: number;
  paused_by_pin: boolean;
}

const POLL_INTERVAL_MS = 8_000;

export default function RotationPoolStatusCard() {
  const [status, setStatus] = useState<RotationPoolStatus | null>(null);
  const [busy, setBusy] = useState<"switch" | "refresh" | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const r = (await APIInfo.getRotationPoolStatus()) as RotationPoolStatus;
        setStatus(r);
      } catch (e) {
        console.error("getRotationPoolStatus error:", e);
      }
    };
    void tick();
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void tick();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    start();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void tick();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (!status?.enabled) return null;

  const handleSwitchNow = async () => {
    if (busy) return;
    setBusy("switch");
    try {
      const result = await APIInfo.rotationPoolSwitchNow();
      // 后端返回 "" 且无 error = ManualPin 跳过；不能误报「已切」
      if (result) {
        showToast(`已切到 ${result}`, "success");
      } else {
        showToast("Pin 启用中 — 自动切换已跳过", "warning", 4000);
      }
      // 立即刷新一次状态
      const fresh =
        (await APIInfo.getRotationPoolStatus()) as RotationPoolStatus;
      setStatus(fresh);
    } catch (e) {
      showErrorToast(e, "立即切换失败");
    } finally {
      setBusy(null);
    }
  };

  const handleRefreshNow = async () => {
    if (busy) return;
    setBusy("refresh");
    try {
      await APIInfo.rotationPoolRefreshQuotasNow();
      showToast("已触发池内额度刷新", "success");
      const fresh =
        (await APIInfo.getRotationPoolStatus()) as RotationPoolStatus;
      setStatus(fresh);
    } catch (e) {
      showErrorToast(e, "刷新额度失败");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={[
        "rounded-[14px] border px-4 py-3",
        status.paused_by_pin
          ? "border-amber-500/25 bg-amber-500/[0.06]"
          : "border-emerald-500/20 bg-emerald-500/[0.04]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <Shuffle className="h-4 w-4" strokeWidth={2.6} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[12.5px] font-bold text-ios-text dark:text-ios-textDark">
                轮换池运行中
              </span>
              {status.paused_by_pin ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:text-amber-300"
                  title="ManualPin 已启用 → 自动切换暂停"
                >
                  <Lock className="h-2.5 w-2.5" strokeWidth={3} />
                  Pin 暂停
                </span>
              ) : null}
            </div>
            <div className="text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark mt-0.5">
              {status.member_count} 成员 · 切换 {status.interval_min}min · 刷额{" "}
              {status.quota_refresh_min}min
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <div className="text-right">
            <div className="text-[9px] text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide">
              已切 / 已刷
            </div>
            <div className="font-black tabular-nums text-ios-text dark:text-ios-textDark">
              {status.total_switches} / {status.total_quota_refreshes}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="no-drag-region inline-flex items-center gap-1 rounded-full bg-white/70 dark:bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white dark:hover:bg-white/20 disabled:opacity-50"
              onClick={handleRefreshNow}
              disabled={busy != null}
              title="立即刷新池内所有账号额度"
            >
              {busy === "refresh" ? (
                <RefreshCcw
                  className="h-3 w-3 animate-spin"
                  strokeWidth={2.6}
                />
              ) : (
                <RefreshCcw className="h-3 w-3" strokeWidth={2.6} />
              )}
              刷额度
            </button>
            <button
              type="button"
              className="no-drag-region inline-flex items-center gap-1 rounded-full bg-ios-blue px-2.5 py-1 text-[11px] font-bold text-white hover:bg-ios-blue/90 disabled:opacity-50"
              onClick={handleSwitchNow}
              disabled={busy != null || status.paused_by_pin}
              title={
                status.paused_by_pin
                  ? "Pin 启用中 — 手动切到具体账号或先解锁"
                  : "立即切池内下一席（不等周期）"
              }
            >
              {busy === "switch" ? (
                <Sparkles className="h-3 w-3 animate-pulse" strokeWidth={2.6} />
              ) : (
                <Shuffle className="h-3 w-3" strokeWidth={2.6} />
              )}
              立即切
            </button>
          </div>
        </div>
      </div>

      {/* 详细 timeline */}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10.5px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
        <Line
          icon={Clock}
          label="下次切换"
          value={formatRelativeFuture(status.next_switch_at)}
        />
        <Line
          icon={Shuffle}
          label="上次切到"
          value={
            status.last_switched_to
              ? `${truncate(status.last_switched_to, 22)}${
                  status.last_switched_at
                    ? ` · ${formatRelativePast(status.last_switched_at)}`
                    : ""
                }`
              : "—"
          }
        />
        <Line
          icon={RefreshCcw}
          label="上次刷额"
          value={
            status.last_quota_refresh_at
              ? formatRelativePast(status.last_quota_refresh_at)
              : "—"
          }
        />
      </div>

      {status.last_error ? (
        <div className="mt-2 rounded-[8px] bg-rose-500/[0.08] px-2 py-1 text-[11px] text-rose-700 dark:text-rose-300">
          ⚠ {status.last_error}
        </div>
      ) : null}
    </div>
  );
}

function Line({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <Icon className="h-3 w-3 shrink-0 opacity-60" strokeWidth={2.6} />
      <span className="opacity-70 mr-1 shrink-0">{label}</span>
      <span className="truncate font-medium text-ios-text dark:text-ios-textDark">
        {value}
      </span>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function formatRelativePast(iso: string): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 0) return "刚刚";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s 前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min 前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`;
  return new Date(t).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatRelativeFuture(iso: string | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = t - Date.now();
  if (diff <= 0) return "立即";
  if (diff < 60_000) return `${Math.ceil(diff / 1000)}s 后`;
  if (diff < 3_600_000) return `${Math.ceil(diff / 60_000)}min 后`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 后`;
  return new Date(t).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
