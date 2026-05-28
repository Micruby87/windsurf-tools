import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, Check, Trash2, X, XCircle } from "lucide-react";
import {
  useNotificationsStore,
  type NotificationItem,
} from "../stores/useNotificationsStore";
import { formatDateTimeAsiaShanghai } from "../utils/datetimeAsia";

/**
 * 3.2: 通知中心 — Header 上的铃铛按钮 + 下拉历史面板。
 *
 * 行为：
 *  - 铃铛右上角红色 badge 显示未读 error/warning 数；无未读则隐藏
 *  - 点击展开 320px 宽下拉，显示最近 200 条历史，倒序（最新在上）
 *  - 顶部「全部已读」「清空」按钮
 *  - 点击外部 / Esc 关闭
 *  - hover 项右侧显示 X 删除单条
 *
 * 不是 toast — toast 仍由 IToast 渲染。这里是「持久化历史」。
 */
export default function NotificationCenter() {
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const clearAll = useNotificationsStore((s) => s.clear);
  const remove = useNotificationsStore((s) => s.remove);

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 打开时自动标记已读（保留历史，仅清 badge）
  useEffect(() => {
    if (open && unreadCount > 0) {
      // 给用户一刻钟时间看，再标记已读
      const t = setTimeout(() => markAllRead(), 800);
      return () => clearTimeout(t);
    }
  }, [open, unreadCount, markAllRead]);

  // 倒序显示（最新在上）
  const reversed = [...items].reverse();

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        className="no-drag-region relative flex h-9 w-9 items-center justify-center rounded-full border border-black/[0.06] bg-white/70 text-ios-text shadow-sm transition-colors hover:bg-black/5 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-ios-textDark dark:hover:bg-white/10"
        title={
          unreadCount > 0
            ? `${unreadCount} 条未读通知`
            : items.length > 0
              ? `${items.length} 条历史通知`
              : "通知中心"
        }
        aria-label="通知中心"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="w-[16px] h-[16px]" strokeWidth={2.4} />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-[#1C1C1E]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="通知中心"
          className="absolute right-0 top-full mt-2 z-[150] w-[340px] max-w-[90vw] rounded-[16px] border border-black/[0.06] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] dark:border-white/[0.08] dark:bg-[#1C1C1E] flex flex-col max-h-[60vh]"
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-ios-textSecondary dark:text-ios-textSecondaryDark" strokeWidth={2.4} />
              <span className="text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                通知中心
              </span>
              <span className="text-[10px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
                {items.length} 条
              </span>
            </div>
            <div className="flex items-center gap-1">
              {items.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="no-drag-region rounded-full px-2 py-0.5 text-[10px] font-bold text-ios-blue hover:bg-ios-blue/10 transition-colors"
                    onClick={markAllRead}
                    title="标记所有已读"
                  >
                    全部已读
                  </button>
                  <button
                    type="button"
                    className="no-drag-region rounded-full px-2 py-0.5 text-[10px] font-bold text-rose-600 hover:bg-rose-500/10 transition-colors dark:text-rose-300"
                    onClick={clearAll}
                    title="清空所有历史"
                  >
                    清空
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="no-drag-region flex h-6 w-6 items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="关闭"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {reversed.length === 0 ? (
              <EmptyState />
            ) : (
              reversed.map((it) => (
                <NotificationRow
                  key={it.id}
                  item={it}
                  onRemove={() => remove(it.id)}
                />
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <Check
        className="h-7 w-7 opacity-30 mb-2 text-ios-textSecondary dark:text-ios-textSecondaryDark"
        strokeWidth={1.8}
      />
      <p className="text-[12px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
        没有错误通知
      </p>
      <p className="mt-0.5 text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark opacity-70">
        所有 error / warning 级提示会在这里持久化保存
      </p>
    </div>
  );
}

function NotificationRow({
  item,
  onRemove,
}: {
  item: NotificationItem;
  onRemove: () => void;
}) {
  const Icon = item.kind === "error" ? XCircle : AlertTriangle;
  const tone =
    item.kind === "error"
      ? "text-rose-600 dark:text-rose-300"
      : "text-amber-600 dark:text-amber-300";

  // 友好相对时间
  const ago = (() => {
    const diff = Date.now() - item.ts;
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return `${Math.floor(diff / 86_400_000)} 天前`;
  })();

  return (
    <div
      className={[
        "group relative flex items-start gap-2.5 px-3 py-2.5 transition-colors",
        item.read ? "" : "bg-ios-blue/[0.03] dark:bg-ios-blue/[0.06]",
        "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
      ].join(" ")}
    >
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${tone}`} strokeWidth={2.4} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-relaxed text-ios-text dark:text-ios-textDark whitespace-pre-line break-words">
          {item.message}
        </div>
        <div
          className="mt-0.5 text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark"
          title={formatDateTimeAsiaShanghai(new Date(item.ts).toISOString())}
        >
          {ago}
        </div>
      </div>
      <button
        type="button"
        className="opacity-0 group-hover:opacity-100 shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-all"
        title="删除"
        onClick={onRemove}
      >
        <Trash2 className="h-3 w-3" strokeWidth={2.4} />
      </button>
    </div>
  );
}
