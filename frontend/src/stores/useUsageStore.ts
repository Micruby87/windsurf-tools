import { create } from "zustand";
import { APIInfo, Models } from "../api/wails";
import { createAsyncResource } from "./_async";

/**
 * useUsageStore — Phase B-3：把 Usage.tsx 619 行视图里的数据层（summary +
 * records 两个 resource、in-flight、TTL 缓存、polling、visibilitychange）
 * 全部上提到 store。视图只剩下纯展示 + 局部 filter/page state。
 *
 * 设计：
 *   - 2 个 resource 各管自己的 TTL，但 isLoading / isRefreshing 由外层
 *     fetchAll 统一驱动：首次（summary 还没加载）= isLoading；后续 = isRefreshing。
 *   - polling 在 store 内闭包持有 timer，组件 mount → startPolling()，
 *     unmount → stopPolling()。visibility 切到非可见时暂停轮询（避免后台
 *     无效请求），切回时立刻刷一次。
 */
const RECORD_LIMIT = 5000;
const POLL_INTERVAL_MS = 5000;
const SUMMARY_TTL_MS = 2500;
const RECORDS_TTL_MS = 20000;

interface UsageState {
  summary: Models.services.UsageSummary | null;
  records: Models.services.UsageRecord[];
  hasLoadedSummary: boolean;
  hasLoadedRecords: boolean;
  isLoading: boolean;
  isRefreshing: boolean;

  fetchSummary: (force?: boolean) => Promise<void>;
  fetchRecords: (force?: boolean) => Promise<void>;
  fetchAll: (opts?: {
    silent?: boolean;
    forceSummary?: boolean;
    forceRecords?: boolean;
  }) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  notifyVisibleAgain: () => void;
  clearAllUsage: () => Promise<number>;
}

export const useUsageStore = create<UsageState>((set, get) => {
  // 闭包持有 polling 状态（非渲染字段，不进 set）
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let visListener: (() => void) | null = null;

  // 2 个独立 resource：各管 TTL / in-flight，loading/refreshing 由外层 fetchAll 控
  const summaryResource = createAsyncResource<Models.services.UsageSummary>({
    ttlMs: SUMMARY_TTL_MS,
    fetcher: () => APIInfo.getUsageSummary(),
    apply: (data) => set({ summary: data }),
    onError: (e) => console.error("getUsageSummary error:", e),
    isHydrated: () => get().hasLoadedSummary,
    setHydrated: () => set({ hasLoadedSummary: true }),
    // loading 由外层 fetchAll 接管 → 这里不操作
    shouldBlock: () => false,
    setLoading: () => {},
    setRefreshing: () => {},
  });

  const recordsResource = createAsyncResource<Models.services.UsageRecord[]>({
    ttlMs: RECORDS_TTL_MS,
    fetcher: async () => (await APIInfo.getUsageRecords(RECORD_LIMIT)) || [],
    apply: (data) => set({ records: data }),
    onError: (e) => console.error("getUsageRecords error:", e),
    isHydrated: () => get().hasLoadedRecords,
    setHydrated: () => set({ hasLoadedRecords: true }),
    shouldBlock: () => false,
    setLoading: () => {},
    setRefreshing: () => {},
  });

  const clearPollTimer = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const isVisible = () =>
    typeof document === "undefined" || document.visibilityState === "visible";

  const fetchAll: UsageState["fetchAll"] = async (opts) => {
    const silent = opts?.silent ?? false;
    const forceSummary = opts?.forceSummary ?? false;
    const forceRecords = opts?.forceRecords ?? false;

    // 首次：summary 没加载 → blocking；之后任何刷新 → refreshing。
    const blocking = !silent && !get().hasLoadedSummary;
    if (blocking) set({ isLoading: true });
    else set({ isRefreshing: true });

    try {
      await Promise.all([
        summaryResource.fetch(forceSummary),
        recordsResource.fetch(forceRecords),
      ]);
    } finally {
      if (blocking) set({ isLoading: false });
      else set({ isRefreshing: false });
    }
  };

  const scheduleNextPoll = () => {
    clearPollTimer();
    pollTimer = setTimeout(() => {
      if (!isVisible()) {
        // 不可见时不发请求，但保留循环（visibility 回来再 notifyVisibleAgain）
        scheduleNextPoll();
        return;
      }
      void fetchAll({ silent: true }).finally(scheduleNextPoll);
    }, POLL_INTERVAL_MS);
  };

  return {
    summary: null,
    records: [],
    hasLoadedSummary: false,
    hasLoadedRecords: false,
    isLoading: false,
    isRefreshing: false,

    fetchSummary: (force) => summaryResource.fetch(force),
    fetchRecords: (force) => recordsResource.fetch(force),
    fetchAll,

    startPolling: () => {
      if (pollTimer) return;
      // 启动时 force 刷一次确保最新
      void fetchAll({ forceSummary: true, forceRecords: true }).finally(
        scheduleNextPoll,
      );
      // 注册 visibility 监听
      if (typeof document !== "undefined" && !visListener) {
        visListener = () => {
          if (isVisible()) {
            // 切回可见 → 立即静默刷新 + 重启轮询
            void fetchAll({ silent: true }).finally(scheduleNextPoll);
          }
        };
        document.addEventListener("visibilitychange", visListener);
      }
    },

    stopPolling: () => {
      clearPollTimer();
      if (visListener && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", visListener);
        visListener = null;
      }
    },

    notifyVisibleAgain: () => {
      if (!pollTimer) return;
      void fetchAll({ silent: true }).finally(scheduleNextPoll);
    },

    clearAllUsage: async () => {
      const deleted = await APIInfo.deleteAllUsage();
      await fetchAll({ forceSummary: true, forceRecords: true });
      return deleted;
    },
  };
});
