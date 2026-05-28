import { create } from "zustand";
import type { ToastKind } from "../utils/toast";

/**
 * 3.2: 持久化通知中心。
 *
 * 把所有 error/warning toast 同时存入此 store + localStorage，最多 200 条。
 * Header 铃铛图标显示未读数；点击下拉显示历史 + 时间戳 + 「全部已读」「清空」。
 *
 * 注意：仅持久化 error/warning 级，info/success 太频繁不存。
 */

export interface NotificationItem {
  id: number;
  kind: ToastKind;
  message: string;
  ts: number; // epoch ms
  read: boolean;
}

const STORAGE_KEY = "wt-notifications-v1";
const MAX_ITEMS = 200;

interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  add: (kind: ToastKind, message: string) => void;
  markAllRead: () => void;
  clear: () => void;
  remove: (id: number) => void;
}

const loadFromStorage = (): NotificationItem[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotificationItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_ITEMS);
  } catch {
    return [];
  }
};

const saveToStorage = (items: NotificationItem[]) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    // 可能 storage 满，忽略
  }
};

let seq = 0;

export const useNotificationsStore = create<NotificationsState>((set, get) => {
  const initial = loadFromStorage();
  // 重置 seq 起点，避免与已有 id 冲突
  for (const it of initial) {
    if (it.id >= seq) seq = it.id + 1;
  }
  return {
    items: initial,
    unreadCount: initial.filter((it) => !it.read).length,
    add: (kind, message) => {
      // 仅 error/warning 持久化
      if (kind !== "error" && kind !== "warning") return;
      const id = ++seq;
      const now = Date.now();
      const item: NotificationItem = {
        id,
        kind,
        message,
        ts: now,
        read: false,
      };
      const nextItems = [...get().items, item].slice(-MAX_ITEMS);
      saveToStorage(nextItems);
      set({
        items: nextItems,
        unreadCount: nextItems.filter((it) => !it.read).length,
      });
      // 2.2: 同时尝试触发系统通知（受 settings.desktop_notifications 控制 — 后端自检）。
      // 失败静默（用户在 windsurf-tools 内仍能看到 toast + 通知中心历史）。
      try {
        const title = kind === "error" ? "Windsurf Tools 错误" : "Windsurf Tools 警告";
        // 截断 body 避免超长 — macOS 通知中心截断也是 <= 200 字
        const body = message.length > 200 ? message.slice(0, 200) + "…" : message;
        // event_key 用 kind+message 前 32 字 → 60s 内同 key 不重复
        const eventKey = `frontend-${kind}-${message.slice(0, 32)}`;
        const backendKind: "error" | "warn" =
          kind === "error" ? "error" : "warn";
        void import("../api/wails").then(({ APIInfo }) =>
          APIInfo.sendDesktopNotification(backendKind, eventKey, title, body),
        );
      } catch {
        /* ignore */
      }
    },
    markAllRead: () => {
      const nextItems = get().items.map((it) => ({ ...it, read: true }));
      saveToStorage(nextItems);
      set({ items: nextItems, unreadCount: 0 });
    },
    clear: () => {
      saveToStorage([]);
      set({ items: [], unreadCount: 0 });
    },
    remove: (id) => {
      const nextItems = get().items.filter((it) => it.id !== id);
      saveToStorage(nextItems);
      set({
        items: nextItems,
        unreadCount: nextItems.filter((it) => !it.read).length,
      });
    },
  };
});
