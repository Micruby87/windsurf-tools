import { create } from "zustand";
import { APIInfo } from "../api/wails";
import type { services } from "../../wailsjs/go/models";
import { createAsyncResource } from "./_async";

interface MitmStatusState {
  status: services.MitmProxyStatus | null;
  isLoading: boolean;
  isRefreshing: boolean;
  hasLoadedOnce: boolean;
  switchLoading: boolean;
  switchTargetAccountId: string;

  fetchStatus: (force?: boolean) => Promise<void>;
  ensureStatusLoaded: (maxAgeMs?: number) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  notifyVisibleAgain: () => void;
  switchToNext: () => Promise<string>;
  switchToAccount: (accountID: string) => Promise<string>;
  sessionCount: () => number;
  activeSessions: () => services.SessionBindingInfo[];
  unbindSession: (convIDPrefix: string) => Promise<boolean>;
}

const nextPollDelay = (running: boolean | undefined) =>
  running ? 8000 : 15000;

export const useMitmStatusStore = create<MitmStatusState>((set, get) => {
  // poll 状态用闭包变量持有（非状态字段，不触发渲染）
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const resource = createAsyncResource<services.MitmProxyStatus>({
    ttlMs: 1200,
    fetcher: () => APIInfo.getMitmProxyStatus(),
    apply: (data) => set({ status: data }),
    onError: (e) => console.error("GetMitmProxyStatus error:", e),
    // F3 修复：已有数据时不再阻塞 UI。否则切回 tab 触发 fetchStatus 时会闪一次骨架屏。
    isHydrated: () => get().hasLoadedOnce && get().status != null,
    setHydrated: () => set({ hasLoadedOnce: true }),
    shouldBlock: () => !get().hasLoadedOnce && get().status == null,
    setLoading: (b) => set({ isLoading: b }),
    setRefreshing: (b) => set({ isRefreshing: b }),
    defaultEnsureAgeMs: 10_000,
  });

  const scheduleNextTick = () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        scheduleNextTick();
        return;
      }
      resource.fetch().finally(scheduleNextTick);
    }, nextPollDelay(get().status?.running));
  };

  return {
    status: null,
    isLoading: false,
    isRefreshing: false,
    hasLoadedOnce: false,
    switchLoading: false,
    switchTargetAccountId: "",

    fetchStatus: (force) => resource.fetch(force),
    ensureStatusLoaded: (maxAgeMs) => resource.ensureLoaded(maxAgeMs),

    startPolling: () => {
      if (pollTimer) return;
      resource.fetch().finally(scheduleNextTick);
    },

    stopPolling: () => {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    },

    // notifyVisibleAgain 由 App.tsx 的统一 visibilitychange listener 调用。
    notifyVisibleAgain: () => {
      if (!pollTimer) {
        // polling 未启动 → 只刷一次最新状态，不重启循环
        void resource.fetch(true);
        return;
      }
      resource.fetch(true).finally(scheduleNextTick);
    },

    switchToNext: async () => {
      set({ switchLoading: true, switchTargetAccountId: "" });
      try {
        const result = await APIInfo.switchMitmToNext();
        await resource.fetch(true);
        return result;
      } finally {
        set({ switchLoading: false });
      }
    },

    switchToAccount: async (accountID) => {
      set({ switchLoading: true, switchTargetAccountId: accountID });
      try {
        const result = await APIInfo.switchMitmToAccount(accountID);
        await resource.fetch(true);
        return result;
      } finally {
        set({ switchLoading: false, switchTargetAccountId: "" });
      }
    },

    sessionCount: () => get().status?.session_count ?? 0,
    activeSessions: () => get().status?.active_sessions ?? [],

    unbindSession: async (convIDPrefix) => {
      try {
        const ok = await APIInfo.unbindMitmSession(convIDPrefix);
        if (ok) await resource.fetch(true);
        return ok;
      } catch (e) {
        console.error("UnbindMitmSession error:", e);
        return false;
      }
    },
  };
});
