import type { ComponentType, ReactNode } from "react";

interface Props {
  /** lucide-react 图标组件（functional component） */
  icon?: ComponentType<{ className?: string; strokeWidth?: number | string }>;
  title: string;
  subtitle?: string;
  /** 图标盒色调（默认 ios-blue） */
  iconTone?: "blue" | "green" | "amber" | "violet" | "rose";
  /** 右侧操作槽 */
  actions?: ReactNode;
}

const ICON_BOX_TONE: Record<NonNullable<Props["iconTone"]>, string> = {
  blue: "bg-ios-blue/12 text-ios-blue",
  green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  rose: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
};

/**
 * ISectionHeader — 面板顶部统一样式：[图标盒][标题/副标题][右侧操作槽]。
 */
export default function ISectionHeader({
  icon: Icon,
  title,
  subtitle,
  iconTone = "blue",
  actions,
}: Props) {
  return (
    <header className="flex items-center justify-between gap-4 px-6 pt-5 pb-4">
      <div className="flex items-center gap-3 min-w-0">
        {Icon ? (
          <div
            className={[
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-tile",
              ICON_BOX_TONE[iconTone],
            ].join(" ")}
          >
            <Icon className="h-5 w-5" strokeWidth={2.4} />
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">
            {title}
          </h2>
          {subtitle ? (
            <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug truncate">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </header>
  );
}
