import { create } from "zustand";
import { APIInfo } from "../api/wails";
import { createAsyncResource } from "./_async";

type RelayStatus = {
  running?: boolean;
  port?: number;
  url?: string;
};

interface RelayStatusState {
  status: RelayStatus | null;
  isLoading: boolean;
  isRefreshing: boolean;
  hasLoadedOnce: boolean;
  fetchStatus: (force?: boolean) => Promise<void>;
  ensureStatusLoaded: (maxAgeMs?: number) => Promise<void>;
}

export const useRelayStatusStore = create<RelayStatusState>((set, get) => {
  const resource = createAsyncResource<RelayStatus>({
    ttlMs: 10_000,
    fetcher: async () => (await APIInfo.getOpenAIRelayStatus()) as RelayStatus,
    apply: (data) => set({ status: data }),
    onError: (e) => console.error("getOpenAIRelayStatus error:", e),
    isHydrated: () => get().hasLoadedOnce,
    setHydrated: () => set({ hasLoadedOnce: true }),
    shouldBlock: () => !get().hasLoadedOnce,
    setLoading: (b) => set({ isLoading: b }),
    setRefreshing: (b) => set({ isRefreshing: b }),
    defaultEnsureAgeMs: 10_000,
  });

  return {
    status: null,
    isLoading: false,
    isRefreshing: false,
    hasLoadedOnce: false,
    fetchStatus: (force) => resource.fetch(force),
    ensureStatusLoaded: (maxAgeMs) => resource.ensureLoaded(maxAgeMs),
  };
});
