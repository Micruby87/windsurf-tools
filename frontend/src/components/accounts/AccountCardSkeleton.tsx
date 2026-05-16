import SkeletonBlock from "../common/SkeletonBlock";

/**
 * AccountCardSkeleton — 账号卡片刷新中占位（与 AccountCard 同形）。
 */
export default function AccountCardSkeleton() {
  return (
    <div
      className="relative overflow-hidden rounded-[22px] border border-black/[0.05] bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#1C1C1E]"
      aria-busy="true"
      aria-label="账号卡片加载中"
    >
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 opacity-90" />
      <div className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SkeletonBlock className="h-6 w-16 rounded-full" />
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
          <div className="flex gap-1 rounded-full border border-black/5 bg-gray-50/95 p-1 dark:border-white/5 dark:bg-black/20">
            <SkeletonBlock className="h-[30px] w-[30px] rounded-full" />
            <SkeletonBlock className="h-[30px] w-[30px] rounded-full" />
            <SkeletonBlock className="h-[30px] w-[30px] rounded-full" />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <SkeletonBlock className="h-8 w-[68%] rounded-xl" />
          <SkeletonBlock className="h-4 w-[82%] rounded-lg" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-6 w-24 rounded-full" />
            <SkeletonBlock className="h-6 w-20 rounded-full" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[18px] border border-black/[0.05] bg-black/[0.025] p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
            <SkeletonBlock className="h-3 w-16 rounded-md" />
            <SkeletonBlock className="mt-3 h-5 w-full rounded-lg" />
            <SkeletonBlock className="mt-2 h-3 w-[72%] rounded-md" />
          </div>
          <div className="rounded-[18px] border border-black/[0.05] bg-black/[0.025] p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
            <SkeletonBlock className="h-3 w-16 rounded-md" />
            <SkeletonBlock className="mt-3 h-5 w-full rounded-lg" />
            <SkeletonBlock className="mt-2 h-3 w-[56%] rounded-md" />
          </div>
        </div>

        <div className="mt-4 rounded-[18px] border border-black/[0.05] bg-black/[0.025] p-4 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-3 w-12 rounded-md" />
              <SkeletonBlock className="h-3 w-14 rounded-md" />
            </div>
            <SkeletonBlock className="h-2 w-full rounded-full" />
            <SkeletonBlock className="h-3 w-[42%] rounded-md" />
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <SkeletonBlock className="h-3 w-12 rounded-md" />
              <SkeletonBlock className="h-3 w-14 rounded-md" />
            </div>
            <SkeletonBlock className="h-2 w-full rounded-full" />
            <SkeletonBlock className="h-3 w-[38%] rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
