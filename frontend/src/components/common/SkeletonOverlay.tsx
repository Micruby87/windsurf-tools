import type { ReactNode } from "react";

interface Props {
  active: boolean;
  label?: string;
  overlayClass?: string;
  contentClass?: string;
  /** 覆盖层内容（refresh 骨架版式） */
  skeleton?: ReactNode;
  children?: ReactNode;
}

/**
 * SkeletonOverlay — 覆盖在 children 上的"刷新中"半透明骨架层。
 * active=true 时给 children 设置一个透明态，并在上层渲染 skeleton。
 */
export default function SkeletonOverlay({
  active,
  label = "加载中",
  overlayClass = "",
  contentClass = "opacity-0 pointer-events-none select-none",
  skeleton,
  children,
}: Props) {
  return (
    <div className="relative">
      <div className={active ? contentClass : ""}>{children}</div>
      {active ? (
        <div
          className={["absolute inset-0 z-10 transition-opacity duration-200", overlayClass]
            .filter(Boolean)
            .join(" ")}
          aria-busy="true"
          aria-label={label}
        >
          {skeleton}
        </div>
      ) : null}
    </div>
  );
}
