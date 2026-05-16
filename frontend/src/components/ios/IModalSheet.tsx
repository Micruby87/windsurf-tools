import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  /** 是否允许遮罩 / ESC 关闭，默认 true */
  dismissable?: boolean;
  /** 最大宽度（sm+ 居中模式下生效），默认 600 */
  maxWidth?: number;
  onClose: () => void;
  children?: ReactNode;
}

/**
 * IModalSheet — iOS 风格底部 sheet / 居中 modal 双模式。
 *
 * 行为：
 *   - 点击遮罩关闭（除非 dismissable=false）
 *   - ESC 关闭
 *   - 默认手机端从底部弹出（rounded-t-ios-card），sm+ 居中
 */
export default function IModalSheet({
  open,
  dismissable = true,
  maxWidth = 600,
  onClose,
  children,
}: Props) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
    >
      <div
        style={{ maxWidth: `${maxWidth}px` }}
        className="w-full sm:w-[min(100%,var(--sheet-max,600px))] mx-auto bg-white dark:bg-[#1c1c1e] rounded-t-ios-card sm:rounded-ios-card shadow-ios-sheet ring-1 ring-white/50 dark:ring-white/10 max-h-[80vh] flex flex-col overflow-hidden animate-sheet-up"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
