import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock,
  RefreshCcw,
  TrendingUp,
} from "lucide-react";
import { APIInfo } from "../api/wails";
import type { main } from "../../wailsjs/go/models";

/**
 * F2: Dashboard 历史趋势卡
 *
 * 三块内容：
 *  1. 24h 切号趋势 SVG sparkline（按小时分桶）+ 24h/7d 总数
 *  2. 切号原因分布（manual / next / quota_exhausted / rate_limited）
 *  3. Top 5 切号最多账号列表
 *
 * 数据来源：app_metrics.go GetDashboardMetrics()。
 * 自带 30s 自动刷新（页面可见时），手动刷新按钮立即触发。
 *
 * 设计取舍：
 *  - 不引第三方 chart 库（recharts 会让 bundle +60KB）
 *  - SVG sparkline 自己画，已够「概览级」展示
 *  - 没数据时折叠成一个轻量提示，避免空 chart 让用户疑惑
 */

const REASON_LABEL: Record<string, string> = {
  manual: "手动",
  next: "下一席",
  quota_exhausted: "额度用尽",
  rate_limited: "频率限制",
  startup: "启动",
  unknown: "其他",
};

const REASON_TONE: Record<string, string> = {
  manual: "bg-ios-blue/15 text-ios-blue",
  next: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  quota_exhausted: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  rate_limited: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  startup: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  unknown: "bg-gray-500/15 text-gray-700 dark:text-gray-300",
};

const POLL_INTERVAL_MS = 30_000;

export default function DashboardMetrics() {
  const [data, setData] = useState<main.DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const next = await APIInfo.getDashboardMetrics();
      setData(next);
    } catch (e) {
      console.error("getDashboardMetrics error:", e);
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchData();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchData(true);
        }
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void fetchData(true);
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

  if (loading) {
    return (
      <div className="rounded-[18px] border border-black/[0.06] bg-white/70 dark:border-white/[0.08] dark:bg-white/[0.04] p-5 h-32 animate-pulse" />
    );
  }
  if (!data) return null;

  const total24 = data.switch_total_24h ?? 0;
  const total7d = data.switch_total_7d ?? 0;
  const total30d = data.switch_total_30d ?? 0;
  const buckets = data.switch_hourly ?? [];
  const daily = data.switch_daily_30d ?? [];
  const tops = data.switch_top_accounts ?? [];
  const reasons = data.reason_breakdown ?? {};
  const reasonEntries = Object.entries(reasons)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const noData = total7d === 0;

  return (
    <section className="rounded-[18px] border border-black/[0.06] bg-white/70 dark:border-white/[0.08] dark:bg-white/[0.04] p-5">
      <header className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-ios-blue/12 text-ios-blue">
            <TrendingUp className="h-4 w-4" strokeWidth={2.6} />
          </span>
          <span className="text-[14px] font-bold text-ios-text dark:text-ios-textDark">
            切号趋势
          </span>
          <span className="text-[10px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide">
            最近 24 小时
          </span>
        </div>
        <button
          type="button"
          className="no-drag-region flex h-7 w-7 items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => void fetchData()}
          title="立即刷新"
          aria-label="刷新趋势数据"
          disabled={refreshing}
        >
          <RefreshCcw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            strokeWidth={2.6}
          />
        </button>
      </header>

      {noData ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
            <SwitchTrend total24={total24} total7d={total7d} buckets={buckets} />

            <div className="space-y-4 min-w-0">
              <ReasonBreakdown
                total24={total24}
                entries={reasonEntries}
              />
              <TopAccountsList tops={tops} />
            </div>
          </div>

          {/* 3.3: 30 天切号热力图日历 */}
          <SwitchHeatmap30d daily={daily} total30d={total30d} />
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-ios-textSecondary dark:text-ios-textSecondaryDark">
      <BarChart3 className="h-9 w-9 opacity-30 mb-2" strokeWidth={1.6} />
      <p className="text-[13px] font-medium">最近 7 天还没有切号记录</p>
      <p className="mt-1 text-[11px] opacity-80 max-w-sm">
        当 MITM 因额度用尽 / 频率限制自动切号，或你点「下一席位」按钮，事件会被记录到这里。
      </p>
    </div>
  );
}

function SwitchTrend({
  total24,
  total7d,
  buckets,
}: {
  total24: number;
  total7d: number;
  buckets: main.HourBucket[];
}) {
  const max = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.count)),
    [buckets],
  );
  const peakHour = useMemo(() => {
    let best = -1;
    let idx = -1;
    buckets.forEach((b, i) => {
      if (b.count > best) {
        best = b.count;
        idx = i;
      }
    });
    return idx >= 0 ? { idx, count: best, at: buckets[idx]?.hour_start } : null;
  }, [buckets]);

  // 几何参数
  const W = 360;
  const H = 88;
  const PAD_X = 4;
  const PAD_Y = 8;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;
  const points = buckets.map((b, i) => {
    const x = PAD_X + i * stepX;
    const y = PAD_Y + innerH * (1 - b.count / max);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPath = (() => {
    if (!buckets.length) return "";
    const top = points.join(" L ");
    const last = PAD_X + (buckets.length - 1) * stepX;
    return `M ${PAD_X},${PAD_Y + innerH} L ${top} L ${last.toFixed(1)},${(PAD_Y + innerH).toFixed(1)} Z`;
  })();
  const linePath = points.length ? `M ${points.join(" L ")}` : "";

  return (
    <div>
      <div className="flex items-end gap-3 mb-2">
        <div>
          <div className="text-[11px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide">
            24h 切号
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-black tabular-nums text-ios-text dark:text-ios-textDark">
              {total24}
            </span>
            <span className="text-[11px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
              次
            </span>
          </div>
        </div>
        <div className="text-right ml-auto">
          <div className="text-[10px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide">
            7 天
          </div>
          <div className="text-[14px] font-black tabular-nums text-ios-text dark:text-ios-textDark">
            {total7d}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full h-[88px] rounded-[10px] bg-black/[0.02] dark:bg-white/[0.04]"
        aria-label={`24 小时切号折线图，最高一小时 ${max} 次`}
      >
        <defs>
          <linearGradient id="metric-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246 / 0.4)" />
            <stop offset="100%" stopColor="rgb(59 130 246 / 0)" />
          </linearGradient>
        </defs>
        {areaPath ? (
          <path d={areaPath} fill="url(#metric-trend-fill)" />
        ) : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke="rgb(59 130 246)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {/* 高亮峰值点 */}
        {peakHour && peakHour.count > 0 ? (
          <circle
            cx={(PAD_X + peakHour.idx * stepX).toFixed(1)}
            cy={(PAD_Y + innerH * (1 - peakHour.count / max)).toFixed(1)}
            r="2.2"
            fill="rgb(59 130 246)"
          />
        ) : null}
      </svg>
      {peakHour && peakHour.count > 0 ? (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
          <Clock className="h-3 w-3" strokeWidth={2.6} />
          <span>
            峰值 {peakHour.count} 次 · {formatHourLabel(peakHour.at)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ReasonBreakdown({
  total24,
  entries,
}: {
  total24: number;
  entries: Array<[string, number]>;
}) {
  if (total24 <= 0 || entries.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide mb-1.5">
        切换原因（24h）
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([reason, count]) => (
          <span
            key={reason}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              REASON_TONE[reason] || REASON_TONE.unknown
            }`}
          >
            {REASON_LABEL[reason] || reason}
            <span className="rounded-full bg-white/40 dark:bg-black/30 px-1 text-[9px] font-black tabular-nums">
              {count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TopAccountsList({ tops }: { tops: main.TopAccount[] }) {
  if (!tops.length) return null;
  const max = Math.max(1, ...tops.map((t) => t.count));
  return (
    <div>
      <div className="text-[11px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide mb-1.5 flex items-center gap-1">
        <Activity className="h-3 w-3" strokeWidth={2.6} />
        热度 Top {tops.length}
      </div>
      <ul className="space-y-1">
        {tops.map((t) => (
          <li
            key={t.email}
            className="flex items-center gap-2 rounded-[8px] bg-black/[0.02] px-2 py-1 dark:bg-white/[0.03]"
          >
            <span
              className="truncate text-[11px] font-semibold text-ios-text dark:text-ios-textDark min-w-0 flex-1"
              title={t.email}
            >
              {t.email}
            </span>
            <div className="w-12 h-1 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-ios-blue/70 transition-all"
                style={{ width: `${(t.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-black tabular-nums text-ios-textSecondary dark:text-ios-textSecondaryDark w-6 text-right">
              {t.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatHourLabel(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * 3.3: 30 天切号热力图日历。
 *
 * GitHub-style 方格：每方格 = 一天，颜色深浅按 count 5 档。
 * 第一行起始与今天对齐（today 是最右下），向前回滚 30 天。
 * hover 显示日期 + 计数。
 */
function SwitchHeatmap30d({
  daily,
  total30d,
}: {
  daily: main.DayBucket[];
  total30d: number;
}) {
  if (!daily || daily.length === 0) return null;
  // 计算最大值用于色阶
  const max = Math.max(1, ...daily.map((d) => d.count));
  // 5 档色阶（含 0 档）
  const colorFor = (count: number) => {
    if (count === 0) return "bg-black/[0.04] dark:bg-white/[0.05]";
    const ratio = count / max;
    if (ratio < 0.25) return "bg-ios-blue/15";
    if (ratio < 0.5) return "bg-ios-blue/30";
    if (ratio < 0.75) return "bg-ios-blue/55";
    return "bg-ios-blue/85";
  };
  // 找 daily[0].date 是星期几（0 = Sunday），把头部空格补齐
  const firstDate = new Date(`${daily[0].date}T00:00:00`);
  const firstWeekday = firstDate.getDay(); // 0~6, Sun~Sat
  const cells: Array<{ date: string; count: number } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (const d of daily) cells.push({ date: d.date, count: d.count });
  // 7 列（一周），按列填充更易读 — 但这里直接 grid 渲染（CSS grid 自动按行排）
  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const peak = daily.reduce<{ date: string; count: number } | null>(
    (acc, d) => (acc && acc.count >= d.count ? acc : d),
    null,
  );
  const formatDate = (s: string) => {
    const d = new Date(`${s}T00:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    });
  };

  return (
    <div className="rounded-[14px] border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide">
          <CalendarDays className="h-3 w-3" strokeWidth={2.6} />
          30 天切号热力图
        </div>
        <div className="text-[10px] font-bold tabular-nums text-ios-text dark:text-ios-textDark">
          共 {total30d} 次
          {peak && peak.count > 0 ? (
            <span className="ml-2 text-ios-textSecondary dark:text-ios-textSecondaryDark">
              · 单日峰值 {peak.count} 次（{formatDate(peak.date)}）
            </span>
          ) : null}
        </div>
      </div>

      {/* 周几头 — 仅显示一/三/五/日 */}
      <div className="grid grid-cols-[20px_1fr] gap-1 items-start">
        <div className="grid grid-rows-7 gap-[3px] text-[8px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
          {weekdayLabels.map((d, i) => (
            <span
              key={i}
              className={i % 2 === 0 ? "leading-[10px]" : "leading-[10px] opacity-0"}
            >
              {d}
            </span>
          ))}
        </div>
        <div
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridAutoColumns: "minmax(10px, 1fr)" }}
        >
          {cells.map((cell, i) =>
            cell === null ? (
              <span key={`pad-${i}`} className="h-[10px] w-full" />
            ) : (
              <span
                key={cell.date}
                className={[
                  "h-[10px] w-full rounded-[2px] transition-transform hover:scale-150 hover:z-10 cursor-default",
                  colorFor(cell.count),
                ].join(" ")}
                title={`${formatDate(cell.date)} · ${cell.count} 次切号`}
              />
            ),
          )}
        </div>
      </div>

      {/* 色阶图例 */}
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[9px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
        <span>少</span>
        <span className="h-2 w-2 rounded-[2px] bg-black/[0.04] dark:bg-white/[0.05]" />
        <span className="h-2 w-2 rounded-[2px] bg-ios-blue/15" />
        <span className="h-2 w-2 rounded-[2px] bg-ios-blue/30" />
        <span className="h-2 w-2 rounded-[2px] bg-ios-blue/55" />
        <span className="h-2 w-2 rounded-[2px] bg-ios-blue/85" />
        <span>多</span>
      </div>
    </div>
  );
}
