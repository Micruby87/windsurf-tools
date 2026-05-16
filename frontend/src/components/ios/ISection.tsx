import type { HTMLAttributes, ReactNode } from "react";

interface Props extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  /** 'card' = 顶层大面板（带 backdrop-blur）；'inset' = 嵌套小区块 */
  tone?: "card" | "inset";
  /** 是否给一个 ring 强调阴影（默认 card 带，inset 不带） */
  ring?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * ISection — iOS 风格标准面板。
 *
 * 替代各 view 散落的「rounded-ios-card backdrop-blur-2xl border border-black/[0.05]
 * bg-white/72 dark:border-white/[0.08] dark:bg-[#1C1C1E]/82」长串 utility。
 */
export default function ISection({
  tone = "card",
  ring = true,
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    "flex flex-col",
    tone === "inset"
      ? "rounded-ios-block bg-white/60 dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.05]"
      : "rounded-ios-card backdrop-blur-2xl border border-black/[0.05] bg-white/72 dark:border-white/[0.08] dark:bg-[#1C1C1E]/82",
    ring && tone !== "inset" ? "shadow-ios-card" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={cls} {...rest}>
      {children}
    </section>
  );
}
