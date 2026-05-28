import { CheckCircle2 } from "lucide-react";
import {
  SWITCH_PLAN_FILTER_TONES,
  normalizeSwitchPlanFilter,
  switchPlanFilterToneOptions,
  type SwitchPlanTone,
} from "../../utils/settingsModel";

/**
 * D-A / D-B 共用：MITM 号池准入多选 chip 组
 *
 * 把后端早就支持的「逗号分隔多 tone」filter 完整暴露到 UI：
 *   - 一个「全部计划」chip：勾上 = 存 "all"，所有 tone chip 都不激活
 *   - 7 个 tone chip：任意点击 → 自动取消「全部」、把该 tone 加入/移出集
 *   - 若 7 个都被选中 → 等价于「全部」，会自动 normalize 回 "all"
 *
 * 受控组件：filter 字符串由父层维护（Settings 写 settings.auto_switch_plan_filter
 * 或 Accounts 写回 settings via useSettingsStore）。
 */

interface PlanFilterChipsProps {
  /** 当前 filter 字符串："all" 或逗号分隔 tone */
  filter: string;
  /** 用户选完后回调，参数已经 normalize 过 */
  onChange: (next: string) => void;
  /** 各 tone 当前账号数（用于 chip 上的徽标） */
  counts?: Partial<Record<SwitchPlanTone, number>>;
  /** 是否禁用（保存中等） */
  disabled?: boolean;
  /** 紧凑模式（Accounts 顶部用，去掉外框）；默认 false */
  compact?: boolean;
}

const TONE_DOT_CLASS: Record<SwitchPlanTone, string> = {
  pro: "bg-ios-blue",
  max: "bg-violet-500",
  team: "bg-indigo-500",
  enterprise: "bg-slate-500",
  trial: "bg-amber-500",
  free: "bg-slate-400",
  unknown: "bg-gray-400",
};

export default function PlanFilterChips({
  filter,
  onChange,
  counts,
  disabled = false,
  compact = false,
}: PlanFilterChipsProps) {
  const normalized = normalizeSwitchPlanFilter(filter);
  const isAll = normalized === "all";
  const selected = new Set<SwitchPlanTone>(
    isAll ? [] : (normalized.split(",") as SwitchPlanTone[]),
  );

  const toggleTone = (tone: SwitchPlanTone) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(tone)) {
      next.delete(tone);
    } else {
      next.add(tone);
    }
    if (next.size === 0) {
      onChange("all");
      return;
    }
    const orderedKept = SWITCH_PLAN_FILTER_TONES.filter((t) => next.has(t));
    if (orderedKept.length === SWITCH_PLAN_FILTER_TONES.length) {
      onChange("all");
      return;
    }
    onChange(normalizeSwitchPlanFilter(orderedKept.join(",")));
  };

  const chooseAll = () => {
    if (disabled) return;
    if (!isAll) onChange("all");
  };

  return (
    <div
      className={`no-drag-region flex flex-wrap items-center gap-2 ${
        compact ? "" : "rounded-[14px] border border-black/[0.06] bg-black/[0.02] p-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]"
      }`}
    >
      {/* 「全部计划」chip */}
      <button
        type="button"
        onClick={chooseAll}
        disabled={disabled}
        className={[
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
          isAll
            ? "bg-ios-blue text-white shadow-sm"
            : "bg-black/[0.04] text-ios-textSecondary hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-ios-textSecondaryDark dark:hover:bg-white/[0.1]",
          disabled ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
        aria-pressed={isAll}
      >
        {isAll ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.6} /> : null}
        <span>全部计划</span>
      </button>

      {/* 7 个 tone chip */}
      {switchPlanFilterToneOptions.map((o) => {
        const active = selected.has(o.value);
        const count = counts?.[o.value] ?? null;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggleTone(o.value)}
            disabled={disabled}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
              active
                ? "bg-ios-blue text-white shadow-sm"
                : "bg-black/[0.04] text-ios-textSecondary hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-ios-textSecondaryDark dark:hover:bg-white/[0.1]",
              disabled ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
            aria-pressed={active}
            title={active ? "点击移出准入计划" : "点击加入准入计划"}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT_CLASS[o.value]} ${active ? "opacity-100" : "opacity-70"}`}
            />
            <span>{o.label}</span>
            {count != null && count > 0 ? (
              <span
                className={[
                  "rounded-full px-1.5 py-0 text-[10px] font-black",
                  active
                    ? "bg-white/20 text-white"
                    : "bg-black/[0.06] text-ios-textSecondary dark:bg-white/[0.08] dark:text-ios-textSecondaryDark",
                ].join(" ")}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
