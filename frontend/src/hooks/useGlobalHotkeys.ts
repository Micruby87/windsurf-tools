import { useEffect } from "react";
import { useMainViewStore } from "../stores/useMainViewStore";
import type { ShellViewTab } from "../utils/appMode";

/**
 * 1.2: 全局键盘快捷键。
 *
 * 约定：
 * - 在 input/textarea/contenteditable 焦点中且不带 Meta/Ctrl 修饰键时，全部放行（让用户正常输入）。
 *   但如果带 Meta/Ctrl（例如 Cmd+R），仍然拦截 — 修饰键组合不会和正常输入冲突。
 * - mac 用 Cmd，windows/linux 用 Ctrl。统一通过 (e.metaKey || e.ctrlKey) 兼容。
 *
 * 提供的快捷键：
 * - Cmd+1 ~ Cmd+6：切到 Dashboard / Accounts / Usage / Relay / Cleanup / Settings
 * - Cmd+,（comma）：进入 Settings
 * - Cmd+R：刷新当前 view（dispatch CustomEvent 'mainview-refresh'）
 * - Cmd+K：打开命令面板（dispatch CustomEvent 'open-command-palette'）
 * - ?（无修饰键，且不在 input 中）：打开快捷键 cheat sheet
 * - Esc：dispatch 'close-overlays'（命令面板/cheat sheet 自己监听处理）
 */

const NUMERIC_TAB_MAP: Record<string, ShellViewTab> = {
  "1": "Dashboard",
  "2": "Accounts",
  "3": "Usage",
  "4": "Relay",
  "5": "Cleanup",
  "6": "Settings",
};

const isEditableTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
};

export function useGlobalHotkeys() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const editing = isEditableTarget(e.target);

      // ── Meta/Ctrl 系组合键（即使在 input 中也拦截，因为不影响正常输入） ──
      if (mod) {
        // Cmd+1 ~ Cmd+6
        if (NUMERIC_TAB_MAP[e.key]) {
          e.preventDefault();
          useMainViewStore.getState().setActiveTab(NUMERIC_TAB_MAP[e.key]);
          return;
        }
        // Cmd+,
        if (e.key === "," || e.code === "Comma") {
          e.preventDefault();
          useMainViewStore.getState().setActiveTab("Settings");
          return;
        }
        // Cmd+R 刷新当前 view（替换浏览器默认 reload）
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("mainview-refresh"));
          return;
        }
        // Cmd+K 命令面板
        if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("open-command-palette"));
          return;
        }
      }

      // ── 无修饰键：仅在非编辑目标中触发 ──
      if (!editing) {
        if (e.key === "?") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("open-hotkeys-cheatsheet"));
          return;
        }
      }

      // Esc：让所有覆盖层（CommandPalette / CheatSheet）自己监听
      if (e.key === "Escape") {
        // 不 preventDefault — 各 modal 自己听 Escape
        window.dispatchEvent(new CustomEvent("close-overlays"));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
