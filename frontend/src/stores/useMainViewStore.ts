import { create } from "zustand";
import { DEFAULT_MAIN_VIEW, type ShellViewTab } from "../utils/appMode";

/**
 * 主界面当前标签（纯 MITM 模式下保留总览 / 号池 / 中转 / 设置）。
 *
 * 扩展字段：
 * - highlightAccountId：跨视图跳转时短暂高亮某账号卡。Accounts 页订阅，1.5s 后自动清。
 * - importModalOpen：全局 ImportModal 开关，让 Dashboard/Sidebar 等任意位置都能调起导入。
 */
type MainViewState = {
  activeTab: ShellViewTab;
  setActiveTab: (tab: ShellViewTab) => void;
  highlightAccountId: string | null;
  /** 跳到 Accounts 页并短暂高亮指定账号卡（1.5s 自动清）。 */
  highlightAndJumpToAccount: (accountId: string) => void;
  clearHighlight: () => void;
  importModalOpen: boolean;
  openImportModal: () => void;
  closeImportModal: () => void;
  dashboardDiagnosticsRequestSeq: number;
  requestDashboardDiagnostics: () => void;
};

export const useMainViewStore = create<MainViewState>((set) => ({
  activeTab: DEFAULT_MAIN_VIEW,
  setActiveTab: (tab) => set({ activeTab: tab }),
  highlightAccountId: null,
  highlightAndJumpToAccount: (accountId) => {
    set({ activeTab: "Accounts", highlightAccountId: accountId });
  },
  clearHighlight: () => set({ highlightAccountId: null }),
  importModalOpen: false,
  openImportModal: () => set({ importModalOpen: true }),
  closeImportModal: () => set({ importModalOpen: false }),
  dashboardDiagnosticsRequestSeq: 0,
  requestDashboardDiagnostics: () =>
    set((s) => ({
      activeTab: "Dashboard",
      dashboardDiagnosticsRequestSeq: s.dashboardDiagnosticsRequestSeq + 1,
    })),
}));
