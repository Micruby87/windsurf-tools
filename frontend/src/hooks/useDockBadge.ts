import { useEffect } from "react";
import { WindowSetTitle } from "../../wailsjs/runtime/runtime";
import { useMitmStatusStore } from "../stores/useMitmStatusStore";
import { useNotificationsStore } from "../stores/useNotificationsStore";

/**
 * 2.3: Dock badge / 窗口标题反映关键状态。
 *
 * Wails 没有跨平台原生 dock badge API（macOS NSDockTile 需 cgo），这里用
 * WindowSetTitle 在标题前面加 [N] 前缀作为兜底，让用户在 Cmd+Tab 切换器、
 * Dock 图标 hover、Windows 任务栏 hover 等场景都能看到红点数。
 *
 * 显示逻辑（取最高优先级一项）：
 *   - 未读 error 通知 N → "[!N] Windsurf Tools"
 *   - 号池见底 N → "[⏳N] Windsurf Tools"
 *   - 默认 → "Windsurf Tools"
 */

const APP_TITLE = "Windsurf Tools";

export function useDockBadge() {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const status = useMitmStatusStore((s) => s.status);
  const exhaustedCount =
    status?.pool_status?.filter((k) => k.runtime_exhausted).length ?? 0;

  useEffect(() => {
    let title = APP_TITLE;
    if (unreadCount > 0) {
      title = `[!${unreadCount > 9 ? "9+" : unreadCount}] ${APP_TITLE}`;
    } else if (exhaustedCount > 0) {
      title = `[⏳${exhaustedCount}] ${APP_TITLE}`;
    }
    try {
      WindowSetTitle(title);
    } catch {
      /* runtime ctx 偶发不可用，忽略 */
    }
  }, [unreadCount, exhaustedCount]);
}
