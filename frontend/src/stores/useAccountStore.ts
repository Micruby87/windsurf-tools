import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { APIInfo } from "../api/wails";
import { models } from "../../wailsjs/go/models";

export const useAccountStore = defineStore("account", () => {
  const accounts = ref<models.Account[]>([]);
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const hasLoadedOnce = ref(false);
  const actionLoading = ref(false);
  let fetchInFlight: Promise<void> | null = null;
  let lastFetchedAt = 0;

  const patchAccount = (account: models.Account | null | undefined) => {
    if (!account?.id) {
      return null;
    }
    const next = [...accounts.value];
    const idx = next.findIndex((item) => item.id === account.id);
    if (idx >= 0) {
      next[idx] = account;
    } else {
      next.unshift(account);
    }
    accounts.value = next;
    return account;
  };

  const fetchAccounts = async (force = false) => {
    const now = Date.now();
    if (fetchInFlight) {
      return fetchInFlight;
    }
    if (!force && now - lastFetchedAt < 1500) {
      return;
    }
    const blocking = !hasLoadedOnce.value && accounts.value.length === 0;
    if (blocking) {
      isLoading.value = true;
    } else {
      isRefreshing.value = true;
    }
    fetchInFlight = (async () => {
      try {
        const data = await APIInfo.getAllAccounts();
        // 让出主线程一帧，减轻大列表回填时的界面卡顿
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        accounts.value = data || [];
        lastFetchedAt = Date.now();
        hasLoadedOnce.value = true;
      } catch (e) {
        console.error("Failed to fetch accounts:", e);
      } finally {
        hasLoadedOnce.value = true;
        if (blocking) {
          isLoading.value = false;
        } else {
          isRefreshing.value = false;
        }
        fetchInFlight = null;
      }
    })();
    return fetchInFlight;
  };

  const ensureAccountsLoaded = async (maxAgeMs = 20_000) => {
    const now = Date.now();
    if (hasLoadedOnce.value && now - lastFetchedAt < maxAgeMs) {
      return;
    }
    return fetchAccounts();
  };

  const deleteAccount = async (id: string) => {
    await APIInfo.deleteAccount(id);
    await fetchAccounts(true);
  };

  /** 返回删除条数，失败抛错由调用方处理 */
  const cleanExpiredAccounts = async (): Promise<number> => {
    const n = await APIInfo.deleteExpiredAccounts();
    await fetchAccounts(true);
    return n;
  };

  /** 删除 plan 归类为 Free/Basic 的账号（与 getPlanTone === 'free' 一致） */
  const deleteFreePlanAccounts = async (): Promise<number> => {
    const n = await APIInfo.deleteFreePlanAccounts();
    await fetchAccounts(true);
    return n;
  };

  const refreshAllTokens = async (): Promise<Record<string, string>> => {
    actionLoading.value = true;
    try {
      const result = await APIInfo.refreshAllTokens();
      await fetchAccounts(true);
      return result || {};
    } finally {
      actionLoading.value = false;
    }
  };

  const refreshAllQuotas = async (): Promise<Record<string, string>> => {
    actionLoading.value = true;
    try {
      const result = await APIInfo.refreshAllQuotas();
      await fetchAccounts(true);
      return result || {};
    } finally {
      actionLoading.value = false;
    }
  };

  const refreshAccountQuota = async (id: string) => {
    await APIInfo.refreshAccountQuota(id);
    const updated = await APIInfo.getAccount(id);
    return patchAccount(updated);
  };

  return {
    accounts,
    isLoading,
    isRefreshing,
    hasLoadedOnce,
    actionLoading,
    patchAccount,
    fetchAccounts,
    ensureAccountsLoaded,
    deleteAccount,
    cleanExpiredAccounts,
    deleteFreePlanAccounts,
    refreshAllTokens,
    refreshAllQuotas,
    refreshAccountQuota,
  };
});

// ════════════════════════════════════════════════════════════════
// useProviderAccountStore — 第三方 LLM 提供商账号(独立链路)
//
// 与 useAccountStore 物理隔离:不同后端 store(provider_accounts.json),
// 不同 API(importByProvider / getAllProviderAccounts / ...)。
// Windsurf 老逻辑完全不动。
// ════════════════════════════════════════════════════════════════

export interface ProviderAccountModel {
  id: string;
  provider: string;
  base_url: string;
  auth_token: string;
  nickname?: string;
  remark?: string;
  status: string;
  created_at: string;
  last_used_at?: string;
  used_quota?: number;
  total_quota?: number;
  // 阶段 2: 路由调度字段
  activated?: boolean;
  active_model?: string;
  models?: string[];
  models_refreshed_at?: string;
  models_error?: string;
}

export interface ProviderImportItem {
  provider: string;
  base_url: string;
  token: string;
  remark?: string;
  nickname?: string;
}

export const useProviderAccountStore = defineStore("providerAccount", () => {
  const accounts = ref<ProviderAccountModel[]>([]);
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const hasLoadedOnce = ref(false);
  const actionLoading = ref(false);
  let fetchInFlight: Promise<void> | null = null;
  let lastFetchedAt = 0;

  const fetchAccounts = async (force = false) => {
    const now = Date.now();
    if (fetchInFlight) {
      return fetchInFlight;
    }
    if (!force && now - lastFetchedAt < 1500) {
      return;
    }
    const blocking = !hasLoadedOnce.value && accounts.value.length === 0;
    if (blocking) {
      isLoading.value = true;
    } else {
      isRefreshing.value = true;
    }
    fetchInFlight = (async () => {
      try {
        const data = await APIInfo.getAllProviderAccounts();
        accounts.value = (data || []) as ProviderAccountModel[];
        lastFetchedAt = Date.now();
        hasLoadedOnce.value = true;
      } catch (e) {
        console.error("Failed to fetch provider accounts:", e);
      } finally {
        hasLoadedOnce.value = true;
        if (blocking) {
          isLoading.value = false;
        } else {
          isRefreshing.value = false;
        }
        fetchInFlight = null;
      }
    })();
    return fetchInFlight;
  };

  const ensureAccountsLoaded = async (maxAgeMs = 20_000) => {
    const now = Date.now();
    if (hasLoadedOnce.value && now - lastFetchedAt < maxAgeMs) {
      return;
    }
    return fetchAccounts();
  };

  const deleteAccount = async (id: string) => {
    await APIInfo.deleteProviderAccount(id);
    await fetchAccounts(true);
  };

  const importBatch = async (items: ProviderImportItem[]): Promise<ImportResultItem[]> => {
    actionLoading.value = true;
    try {
      const results = (await APIInfo.importByProvider(items)) as ImportResultItem[];
      await fetchAccounts(true);
      return results || [];
    } finally {
      actionLoading.value = false;
    }
  };

  const updateAccount = async (acc: ProviderAccountModel) => {
    await APIInfo.updateProviderAccount(acc);
    await fetchAccounts(true);
  };

  // 阶段 2: 拉 {base_url}/v1/models 写到 ProviderAccount.models
  const refreshModels = async (id: string) => {
    actionLoading.value = true;
    try {
      await APIInfo.refreshProviderModels(id);
      await fetchAccounts(true);
    } finally {
      actionLoading.value = false;
    }
  };

  // 阶段 3: 当前全局唯一激活卡 (activated=true && status!=disabled && 配置完整)
  const activeAccount = computed<ProviderAccountModel | null>(() => {
    const found = accounts.value.find((a) =>
      a.activated === true &&
      String(a.status || "active") !== "disabled" &&
      Boolean(String(a.base_url || "").trim()) &&
      Boolean(String(a.auth_token || "").trim())
    );
    return found ?? null;
  });

  // 阶段 3: 「下一席位」— 同 active_model 候选里翻到下一张, 失败抛 error
  // 错误 msg 可能为 "no_candidates" / "only_one"
  const next = async (): Promise<ProviderAccountModel> => {
    actionLoading.value = true;
    try {
      const next = (await APIInfo.nextActiveAccount()) as ProviderAccountModel;
      await fetchAccounts(true);
      return next;
    } finally {
      actionLoading.value = false;
    }
  };

  return {
    accounts,
    isLoading,
    isRefreshing,
    hasLoadedOnce,
    actionLoading,
    activeAccount,
    fetchAccounts,
    ensureAccountsLoaded,
    deleteAccount,
    importBatch,
    updateAccount,
    refreshModels,
    next,
  };
});

// 向 useProviderAccountStore.importBatch 暴露的 ImportResult 类型(与 wails.ts 同源)。
type ImportResultItem = {
  email: string;
  success: boolean;
  error?: string;
};
