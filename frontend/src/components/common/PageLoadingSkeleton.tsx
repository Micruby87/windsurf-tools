import SkeletonBlock from "./SkeletonBlock";

type Variant = "dashboard" | "accounts" | "relay" | "usage" | "settings";

interface Props {
  variant?: Variant;
  className?: string;
}

/**
 * PageLoadingSkeleton — 整页骨架占位。
 *
 * Vue 版有 5 个 variant，每个 variant 一份精雕细琢的版式。React 版按相同思路
 * 拆函数实现，但面板结构略简化（保留视觉密度，不再做完整 grid 拆分）。
 */
export default function PageLoadingSkeleton({
  variant = "settings",
  className,
}: Props) {
  const wrapperCls = ["w-full pb-4", className ?? ""]
    .filter(Boolean)
    .join(" ");

  if (variant === "dashboard") {
    return (
      <div
        className={`space-y-7 ${wrapperCls} p-6`}
        aria-busy="true"
        aria-label="加载中"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="ios-glass rounded-[24px] overflow-hidden border border-black/[0.05] dark:border-white/[0.08] ios-page-enter"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="px-6 py-4 flex items-center gap-3 border-b border-black/[0.05] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.03]">
              <SkeletonBlock className="h-9 w-9 rounded-xl shrink-0" />
              <SkeletonBlock className="h-4 w-36 rounded-lg" />
            </div>
            <div className="p-6 space-y-4">
              <SkeletonBlock className="h-4 w-full rounded-lg" />
              <SkeletonBlock className="h-4 w-[92%] rounded-lg" />
              <SkeletonBlock className="h-4 w-[70%] rounded-lg" />
              <div className="flex flex-wrap gap-3 pt-2">
                <SkeletonBlock className="h-10 w-full max-w-[200px] rounded-full" />
                <SkeletonBlock className="h-10 w-24 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "accounts") {
    return (
      <div
        className={`space-y-5 p-6 ${className ?? ""}`}
        aria-busy="true"
        aria-label="加载中"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[22px] border border-black/[0.05] bg-white/70 p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#1C1C1E]/80 space-y-3"
            >
              <div className="flex items-center gap-2">
                <SkeletonBlock className="h-6 w-16 rounded-full" />
                <SkeletonBlock className="h-6 w-20 rounded-full" />
              </div>
              <SkeletonBlock className="h-7 w-[68%] rounded-xl" />
              <SkeletonBlock className="h-4 w-[82%] rounded-lg" />
              <div className="grid grid-cols-2 gap-3">
                <SkeletonBlock className="h-16 rounded-[18px]" />
                <SkeletonBlock className="h-16 rounded-[18px]" />
              </div>
              <SkeletonBlock className="h-20 rounded-[18px]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "relay") {
    return (
      <div
        className={`space-y-5 p-6 ${className ?? ""}`}
        aria-busy="true"
        aria-label="加载中"
      >
        <SkeletonBlock className="h-20 rounded-[22px]" />
        <SkeletonBlock className="h-24 rounded-[18px]" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="ios-glass rounded-[22px] border border-black/[0.05] p-5 dark:border-white/[0.08] space-y-3"
          >
            <SkeletonBlock className="h-4 w-28 rounded-lg" />
            <SkeletonBlock className="h-11 w-full rounded-[14px]" />
            <SkeletonBlock className="h-11 w-full rounded-[14px]" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "usage") {
    return (
      <div
        className={`space-y-6 max-w-5xl mx-auto p-6 md:p-8 pb-10 ${className ?? ""}`}
        aria-busy="true"
        aria-label="加载中"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <SkeletonBlock className="h-8 w-32 rounded-xl" />
            <SkeletonBlock className="h-4 w-80 max-w-full rounded-lg" />
          </div>
          <SkeletonBlock className="h-10 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="ios-glass rounded-[24px] border border-black/[0.05] p-5 dark:border-white/[0.08] space-y-3"
            >
              <SkeletonBlock className="h-3.5 w-24 rounded-lg" />
              <SkeletonBlock className="h-7 w-28 rounded-lg" />
              <SkeletonBlock className="h-4 w-[78%] rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // settings (默认)
  return (
    <div
      className={`space-y-7 ${wrapperCls} p-6`}
      aria-busy="true"
      aria-label="加载中"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="ios-glass rounded-[24px] overflow-hidden border border-black/[0.05] dark:border-white/[0.08] ios-page-enter"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="px-6 py-4 border-b border-black/[0.05] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.03] flex items-center gap-3">
            <SkeletonBlock className="h-9 w-9 rounded-xl shrink-0" />
            <SkeletonBlock className="h-4 w-36 rounded-lg" />
          </div>
          <div className="p-6 space-y-4">
            <SkeletonBlock className="h-4 w-full rounded-lg" />
            <SkeletonBlock className="h-4 w-[92%] rounded-lg" />
            <SkeletonBlock className="h-4 w-[70%] rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
