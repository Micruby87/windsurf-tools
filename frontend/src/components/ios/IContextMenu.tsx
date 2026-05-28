import { useEffect, useRef, useState, type ComponentType } from "react";

/**
 * 1.4: 右键上下文菜单（页面级 portal 风格）。
 *
 * 触发：父组件 onContextMenu 拿到 (e, items) 调 openContextMenu(e, items)。
 * 关闭：点击外部 / Esc / 选中某项后回调。
 */

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number | string }>;
  /** 选中时回调 */
  onSelect: () => void;
  /** 危险操作（红色） */
  danger?: boolean;
  /** 禁用 */
  disabled?: boolean;
  /** 分组分隔线（在此项之前画一条） */
  divider?: boolean;
}

interface MenuState {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

let openCallback: ((s: Pick<MenuState, "x" | "y" | "items">) => void) | null = null;

/**
 * 在父组件 onContextMenu 里调：
 *   <div onContextMenu={(e) => openContextMenu(e, [...])}>
 */
export function openContextMenu(
  e: React.MouseEvent | MouseEvent,
  items: ContextMenuItem[],
) {
  e.preventDefault();
  if (!openCallback) return;
  openCallback({ x: e.clientX, y: e.clientY, items });
}

/**
 * 全局只挂一次（建议在 App.tsx 根渲染）。
 */
export default function IContextMenuPortal() {
  const [state, setState] = useState<MenuState>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 注册全局 open
  useEffect(() => {
    openCallback = ({ x, y, items }) => {
      setState({ visible: true, x, y, items });
    };
    return () => {
      openCallback = null;
    };
  }, []);

  // 自适应位置：避免溢出右边/下边
  useEffect(() => {
    if (!state.visible || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = state;
    if (x + rect.width > vw - 8) x = Math.max(8, vw - rect.width - 8);
    if (y + rect.height > vh - 8) y = Math.max(8, vh - rect.height - 8);
    if (x !== state.x || y !== state.y) {
      setState((s) => ({ ...s, x, y }));
    }
  }, [state.visible, state.x, state.y]);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!state.visible) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setState((s) => ({ ...s, visible: false }));
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState((s) => ({ ...s, visible: false }));
    };
    // 用 mousedown 而不是 click，避免快速右键引发的事件竞态
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    // 监听 contextmenu，再次右键时关闭旧菜单（让父组件再 openContextMenu）
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [state.visible]);

  if (!state.visible) return null;

  const handleSelect = (it: ContextMenuItem) => {
    if (it.disabled) return;
    setState((s) => ({ ...s, visible: false }));
    // 异步调用，避免在 unmount 上 setState
    queueMicrotask(() => it.onSelect());
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[300] min-w-[180px] rounded-[10px] border border-black/[0.08] bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.18)] dark:border-white/[0.1] dark:bg-[#252528]"
      style={{ left: state.x, top: state.y }}
    >
      {state.items.map((it, i) => {
        const Icon = it.icon;
        return (
          <div key={it.id}>
            {it.divider && i > 0 ? (
              <div className="my-1 mx-2 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
            ) : null}
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors",
                // 必须先给 disabled 项明确 base 色，否则浏览器 disabled 默认 graytext
                // 会让文字与暗背景对比度过低（用户报告夜间模式看不清）。
                it.disabled
                  ? it.danger
                    ? "text-rose-600 dark:text-rose-300 opacity-40 cursor-not-allowed"
                    : "text-ios-text dark:text-ios-textDark opacity-40 cursor-not-allowed"
                  : it.danger
                    ? "text-rose-600 dark:text-rose-300 hover:bg-rose-500/[0.08]"
                    : "text-ios-text dark:text-ios-textDark hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              ].join(" ")}
              onClick={() => handleSelect(it)}
            >
              {Icon ? (
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1 truncate">{it.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
