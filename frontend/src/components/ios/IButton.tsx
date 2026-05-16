import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  tone?: Tone;
  size?: Size;
  /** 禁用时的解释（自动作为 title hover tooltip 显示） */
  reason?: string;
  loading?: boolean;
  /** 整宽 */
  block?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const TONE_CLASS: Record<Tone, string> = {
  primary:
    "bg-ios-blue text-white hover:bg-ios-blue/90 active:bg-ios-blue/80 disabled:bg-ios-blue/40",
  secondary:
    "bg-black/[0.06] text-gray-800 dark:bg-white/[0.08] dark:text-gray-200 hover:bg-black/[0.1] dark:hover:bg-white/[0.12]",
  ghost:
    "text-gray-700 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
  danger:
    "bg-rose-500 text-white hover:bg-rose-500/90 active:bg-rose-500/80 disabled:bg-rose-500/40",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[12px] gap-1.5",
  md: "px-3 py-1.5 text-[13px] gap-2",
  lg: "px-4 py-2 text-[14px] gap-2",
};

/**
 * IButton — iOS 风格按钮。disabled 时通过 reason 自动给 tooltip。
 */
export default function IButton({
  tone = "primary",
  size = "md",
  reason,
  disabled,
  loading,
  block,
  leading,
  trailing,
  className,
  type = "button",
  children,
  ...rest
}: Props) {
  const cls = [
    "inline-flex items-center justify-center rounded-ios-pill font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60",
    block ? "w-full" : "",
    TONE_CLASS[tone],
    SIZE_CLASS[size],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const titleAttr = disabled && reason ? reason : rest.title;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      title={titleAttr}
      className={cls}
      {...rest}
    >
      {leading}
      {loading ? (
        <span aria-hidden="true" className="inline-block animate-spin">
          ⟳
        </span>
      ) : null}
      {children}
      {trailing}
    </button>
  );
}
