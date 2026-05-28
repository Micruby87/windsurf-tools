import { useEffect, useRef } from "react";
import { APIInfo } from "../api/wails";
import {
  WindowGetPosition,
  WindowGetSize,
  WindowIsMaximised,
} from "../../wailsjs/runtime/runtime";

/**
 * 2.4: 窗口尺寸 / 位置记忆。
 *
 * 启动时调 RestoreWindowGeometry（由后端读 settings 后调 runtime.WindowSetSize/Position）。
 * 之后每隔 1.5s（防抖），如果尺寸或位置变化就调 SaveWindowGeometry 写盘。
 *
 * 监听窗口的 resize 事件作为触发；位置变化没有原生事件 — 用 1.5s 轮询比对。
 * 节流后实际写 settings 频率最多 1/1.5s = 0.66 Hz，对 settings.json 写盘开销可忽略。
 */
export function useWindowGeometryMemory() {
  const lastSavedRef = useRef<{
    w: number;
    h: number;
    x: number;
    y: number;
    maximized: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const restore = async () => {
      try {
        await APIInfo.restoreWindowGeometry();
      } catch (e) {
        // 启动初期可能 ctx 未 ready，静默失败
        console.warn("restoreWindowGeometry failed:", e);
      }
    };

    const sample = async () => {
      try {
        const [size, pos, maximized] = await Promise.all([
          WindowGetSize(),
          WindowGetPosition(),
          WindowIsMaximised(),
        ]);
        if (cancelled) return;
        const cur = {
          w: size.w,
          h: size.h,
          x: pos.x,
          y: pos.y,
          maximized: Boolean(maximized),
        };
        const last = lastSavedRef.current;
        if (
          !last ||
          last.w !== cur.w ||
          last.h !== cur.h ||
          last.x !== cur.x ||
          last.y !== cur.y ||
          last.maximized !== cur.maximized
        ) {
          // 跳过明显异常的初始 0 值
          if (cur.w < 200 || cur.h < 200) return;
          lastSavedRef.current = cur;
          await APIInfo.saveWindowGeometry(cur.w, cur.h, cur.x, cur.y, cur.maximized);
        }
      } catch {
        /* ignore — Wails ctx 可能 transient 不可用 */
      }
    };

    // 启动还原
    void restore();
    // 1.5s 轮询比对（不会写盘，仅在变化时写）
    timer = setInterval(sample, 1500);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);
}
