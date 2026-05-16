import type { HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/** 单个骨架块：流动高光 + 圆角；用 ios-skeleton class 与 Vue 版一致。 */
export default function SkeletonBlock({ className, ...rest }: Props) {
  return (
    <div
      aria-hidden="true"
      className={["ios-skeleton", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
