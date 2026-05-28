import { create } from "zustand";
import { APIInfo } from "../api/wails";
import { models } from "../../wailsjs/go/models";
import {
  createDefaultSettings,
  formToSettings,
  normalizeSettings,
  normalizeSwitchPlanFilter,
  settingsToForm,
} from "../utils/settingsModel";
import { createAsyncResource } from "./_async";

interface SettingsState {
  settings: models.Settings | null;
  isLoading: boolean;
  isRefreshing: boolean;
  hasLoadedOnce: boolean;

  fetchSettings: (force?: boolean) => Promise<void>;
  updateSettings: (payload: models.Settings) => Promise<void>;
  saveAutoSwitchPlanFilter: (filter: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const resource = createAsyncResource<models.Settings>({
    ttlMs: 2500,
    fetcher: () => APIInfo.getSettings(),
    apply: (data) => set({ settings: normalizeSettings(data) }),
    onError: (e) => {
      console.error("Failed to fetch settings:", e);
      set({ settings: createDefaultSettings() });
    },
    isHydrated: () => get().hasLoadedOnce && get().settings != null,
    setHydrated: () => set({ hasLoadedOnce: true }),
    shouldBlock: () => !get().hasLoadedOnce || get().settings == null,
    setLoading: (b) => set({ isLoading: b }),
    setRefreshing: (b) => set({ isRefreshing: b }),
  });

  return {
    settings: null,
    isLoading: true,
    isRefreshing: false,
    hasLoadedOnce: false,

    fetchSettings: (force) => resource.fetch(force),

    updateSettings: async (payload) => {
      await APIInfo.updateSettings(payload);
      set({ settings: normalizeSettings(payload) });
    },

    saveAutoSwitchPlanFilter: async (filter) => {
      const base = normalizeSettings(get().settings ?? createDefaultSettings());
      const form = settingsToForm(base);
      form.auto_switch_plan_filter = normalizeSwitchPlanFilter(filter);
      await get().updateSettings(formToSettings(form));
    },
  };
});
