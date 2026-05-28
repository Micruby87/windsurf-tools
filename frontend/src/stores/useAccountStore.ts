import { create } from "zustand";
import { APIInfo } from "../api/wails";
import type { models } from "../../wailsjs/go/models";
import { createAsyncResource } from "./_async";

interface AccountState {
  accounts: models.Account[];
  isLoading: boolean;
  isRefreshing: boolean;
  hasLoadedOnce: boolean;
  actionLoading: boolean;

  patchAccount: (account: models.Account | null | undefined) => models.Account | null;
  fetchAccounts: (force?: boolean) => Promise<void>;
  ensureAccountsLoaded: (maxAgeMs?: number) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  cleanExpiredAccounts: () => Promise<number>;
  deleteFreePlanAccounts: () => Promise<number>;
  refreshAllTokens: () => Promise<Record<string, string>>;
  refreshAllQuotas: () => Promise<Record<string, string>>;
  refreshAccountQuota: (id: string) => Promise<models.Account | null>;
}

export const useAccountStore = create<AccountState>((set, get) => {
  const resource = createAsyncResource<models.Account[]>({
    ttlMs: 1500,
    // yieldBeforeApply: 让出主线程一帧，减轻大列表回填时的界面卡顿
    yieldBeforeApply: true,
    fetcher: async () => (await APIInfo.getAllAccounts()) || [],
    apply: (data) => set({ accounts: data }),
    onError: (e) => console.error("Failed to fetch accounts:", e),
    isHydrated: () => get().hasLoadedOnce && get().accounts.length > 0,
    setHydrated: () => set({ hasLoadedOnce: true }),
    shouldBlock: () => !get().hasLoadedOnce && get().accounts.length === 0,
    setLoading: (b) => set({ isLoading: b }),
    setRefreshing: (b) => set({ isRefreshing: b }),
    defaultEnsureAgeMs: 20_000,
  });

  return {
    accounts: [],
    isLoading: false,
    isRefreshing: false,
    hasLoadedOnce: false,
    actionLoading: false,

    patchAccount: (account) => {
      if (!account?.id) return null;
      set((s) => {
        const next = [...s.accounts];
        const idx = next.findIndex((item) => item.id === account.id);
        if (idx >= 0) {
          next[idx] = account;
        } else {
          next.unshift(account);
        }
        return { accounts: next };
      });
      return account;
    },

    fetchAccounts: (force) => resource.fetch(force),
    ensureAccountsLoaded: (maxAgeMs) => resource.ensureLoaded(maxAgeMs),

    deleteAccount: async (id) => {
      await APIInfo.deleteAccount(id);
      await resource.fetch(true);
    },

    cleanExpiredAccounts: async () => {
      const n = await APIInfo.deleteExpiredAccounts();
      await resource.fetch(true);
      return n;
    },

    deleteFreePlanAccounts: async () => {
      const n = await APIInfo.deleteFreePlanAccounts();
      await resource.fetch(true);
      return n;
    },

    refreshAllTokens: async () => {
      set({ actionLoading: true });
      try {
        const result = await APIInfo.refreshAllTokens();
        await resource.fetch(true);
        return result || {};
      } finally {
        set({ actionLoading: false });
      }
    },

    refreshAllQuotas: async () => {
      set({ actionLoading: true });
      try {
        const result = await APIInfo.refreshAllQuotas();
        await resource.fetch(true);
        return result || {};
      } finally {
        set({ actionLoading: false });
      }
    },

    refreshAccountQuota: async (id) => {
      await APIInfo.refreshAccountQuota(id);
      const updated = await APIInfo.getAccount(id);
      return get().patchAccount(updated);
    },
  };
});
