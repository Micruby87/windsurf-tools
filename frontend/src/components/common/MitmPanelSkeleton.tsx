import SkeletonBlock from "./SkeletonBlock";

/**
 * MitmPanelSkeleton — Dashboard MitmPanel 加载占位。
 * 与 Vue 版结构一致（5 段：状态条 / 进度卡 / 说明 / 大区块 / 小按钮）。
 */
export default function MitmPanelSkeleton() {
  return (
    <div className="space-y-5 p-6">
      <div className="rounded-[22px] border border-black/[0.06] bg-black/[0.03] px-4 py-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <SkeletonBlock className="h-4 w-28 rounded-lg" />
            <SkeletonBlock className="h-4 w-[70%] rounded-lg" />
          </div>
          <SkeletonBlock className="h-9 w-20 rounded-full" />
        </div>
      </div>

      <div className="rounded-[18px] border border-black/[0.05] bg-white/70 p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SkeletonBlock className="h-4 w-28 rounded-lg" />
          <SkeletonBlock className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-12 w-full rounded-ios-block" />
          <SkeletonBlock className="h-12 w-full rounded-ios-block" />
          <SkeletonBlock className="h-12 w-full rounded-ios-block" />
        </div>
      </div>

      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-24 rounded-lg" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SkeletonBlock className="h-[84px] rounded-[18px]" />
          <SkeletonBlock className="h-[84px] rounded-[18px]" />
        </div>
      </div>

      <div className="rounded-[22px] border border-black/[0.05] bg-white/70 p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SkeletonBlock className="h-4 w-32 rounded-lg" />
          <SkeletonBlock className="h-5 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <SkeletonBlock className="h-11 w-full rounded-ios-block" />
          <SkeletonBlock className="h-11 w-full rounded-ios-block" />
          <SkeletonBlock className="h-11 w-full rounded-ios-block" />
          <SkeletonBlock className="h-11 w-full rounded-ios-block" />
        </div>
      </div>

      <SkeletonBlock className="h-11 w-full rounded-ios-block" />
    </div>
  );
}
