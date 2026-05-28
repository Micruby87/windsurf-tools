import type { ReactNode } from "react";
import IInfoTooltip from "./IInfoTooltip";

interface Props {
  title?: string;
  description?: string;
  /** 用于标记 destructive 行（红色调） */
  destructive?: boolean;
  /** 隐藏底分隔线（用在 section 最后一行） */
  noBorder?: boolean;
  /** 强制堆叠布局（适合 control 很宽，比如 textarea） */
  stacked?: boolean;
  /** 自定义左侧 label 区（覆盖 title/description 默认渲染） */
  label?: ReactNode;
  /** 二级附加内容（折叠区/警告条 等） */
  extra?: ReactNode;
  /** 右侧 control（IToggle / INumberStepper / 输入框 / 按钮等） */
  children?: ReactNode;
  /** 4.4: 标题旁的 ? 详细说明（hover/click 弹气泡） */
  tooltip?: ReactNode;
}

/**
 * ISettingRow — iOS Settings.app 风格的设置行。
 */
export default function ISettingRow({
  title,
  description,
  destructive = false,
  noBorder = false,
  stacked = false,
  label,
  extra,
  children,
  tooltip,
}: Props) {
  const wrapperCls = [
    "px-5 sm:px-6 py-4 transition-colors",
    !noBorder ? "border-b border-black/[0.04] dark:border-white/[0.04]" : "",
    destructive ? "bg-rose-500/[0.02]" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const innerCls = [
    "flex gap-4",
    stacked
      ? "flex-col items-stretch"
      : "flex-col sm:flex-row sm:items-center sm:justify-between",
  ].join(" ");
  return (
    <div className={wrapperCls}>
      <div className={innerCls}>
        {label || title || description ? (
          <div className="min-w-0 flex-1">
            {label ?? (
              <>
                {title ? (
                  <div
                    className={[
                      "text-[15px] font-bold leading-snug mb-0.5 inline-flex items-center",
                      destructive
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-gray-900 dark:text-gray-100",
                    ].join(" ")}
                  >
                    {title}
                    {tooltip ? <IInfoTooltip>{tooltip}</IInfoTooltip> : null}
                  </div>
                ) : null}
                {description ? (
                  <div className="text-[12.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    {description}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div
          className={[
            "shrink-0 flex items-center",
            stacked ? "w-full" : "sm:justify-end",
          ].join(" ")}
        >
          {children}
        </div>
      </div>
      {extra ? <div className="mt-3">{extra}</div> : null}
    </div>
  );
}
