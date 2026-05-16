import { useEffect, useRef, useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";

type IconType = ComponentType<{
  className?: string;
  strokeWidth?: number | string;
}>;

export type DropdownItem =
  | { type: "divider" }
  | {
      type?: "item";
      label: string;
      icon?: IconType;
      onClick: () => void;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
    };

interface Props {
  items: DropdownItem[];
  align?: "left" | "right";
  width?: string;
  triggerLabel?: string;
  /**
   * 不在 props 默认值里写 lucide 图标 —— Vue 时代曾因此触发 Vue prop default
   * 工厂调用 bug，导致整个号池主区空白；React 这边即使没有同样 bug，也保留
   * 「在模板里 fallback」这套约束，把图标默认放到组件内部解析。
   */
  triggerIcon?: IconType;
  triggerClass?: string;
  /** compact 模式：圆形小按钮，仅显示图标，适合卡片角 */
  compact?: boolean;
  triggerTitle?: string;
  disabled?: boolean;
}

/**
 * IDropdownMenu — iOS 风格 popover「更多操作」菜单。
 */
export default function IDropdownMenu({
  items,
  align = "right",
  width = "w-56",
  triggerLabel = "更多",
  triggerIcon,
  triggerClass = "",
  compact = false,
  triggerTitle = "更多操作",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const TriggerIcon = triggerIcon || MoreHorizontal;

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerVariantClass =
    triggerClass ||
    (compact
      ? "flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white text-ios-textSecondary shadow-sm transition hover:scale-105 dark:bg-black/40 dark:text-ios-textSecondaryDark disabled:opacity-50"
      : "inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-black/5 dark:bg-white/10 text-ios-text dark:text-ios-textDark text-[13px] font-semibold transition-colors hover:bg-black/10 dark:hover:bg-white/15 disabled:opacity-50");

  const handleClick = (item: DropdownItem) => {
    if ("type" in item && item.type === "divider") return;
    if ((item as { disabled?: boolean }).disabled) return;
    (item as { onClick?: () => void }).onClick?.();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        className={`no-drag-region ios-btn ${triggerVariantClass}`}
        title={triggerTitle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <TriggerIcon
          className={compact ? "h-[15px] w-[15px]" : "h-[16px] w-[16px]"}
          strokeWidth={2.5}
        />
        {!compact ? (
          <span className="whitespace-nowrap">{triggerLabel}</span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            "absolute z-[80] mt-2 origin-top rounded-[18px] border border-black/[0.06] bg-white/95 p-1.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#1C1C1E]/96",
            width,
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {items.map((item, idx) => {
            if ("type" in item && item.type === "divider") {
              return (
                <div
                  key={`d-${idx}`}
                  className="my-1 mx-1 h-px bg-black/[0.06] dark:bg-white/[0.08]"
                  role="separator"
                />
              );
            }
            const it = item as Extract<DropdownItem, { label: string }>;
            const Icon = it.icon;
            return (
              <button
                key={`${idx}-${it.label}`}
                type="button"
                role="menuitem"
                className={[
                  "no-drag-region group flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                  it.danger
                    ? "text-rose-600 hover:bg-rose-500/[0.08] dark:text-rose-300"
                    : "text-ios-text hover:bg-black/[0.05] dark:text-ios-textDark dark:hover:bg-white/[0.07]",
                ].join(" ")}
                disabled={it.disabled === true}
                onClick={() => handleClick(it)}
              >
                {Icon ? (
                  <Icon
                    className="h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100"
                    strokeWidth={2.4}
                  />
                ) : null}
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint ? (
                  <span className="shrink-0 text-[11px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
                    {it.hint}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
