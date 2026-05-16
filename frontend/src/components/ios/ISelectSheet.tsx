import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";

type Option = {
  value: string | number;
  label: string;
  description?: string;
};

interface Props {
  modelValue: string | number;
  onValueChange: (next: string | number) => void;
  options: Option[];
  /** sheet 标题，省略时不显示标题栏 */
  title?: string;
  placeholder?: string;
  /** trigger 按钮宽度（Tailwind w- class，比如 'w-full' / 'w-40'） */
  width?: string;
  disabled?: boolean;
}

/**
 * ISelectSheet — iOS 风格底部弹出选择 sheet。
 * 行为：trigger 显示当前 label，点开后底部 sheet + option 列表。
 */
export default function ISelectSheet({
  modelValue,
  onValueChange,
  options,
  title = "",
  placeholder = "未选择",
  width = "w-full",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    options.find((o) => o.value === modelValue)?.label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSelect = (opt: Option) => {
    onValueChange(opt.value);
    setOpen(false);
  };

  return (
    <div className={`relative inline-flex ${width}`}>
      <button
        type="button"
        className="no-drag-region w-full flex items-center justify-between gap-2 rounded-[14px] px-4 py-2.5 bg-white dark:bg-[#1C1C1E] border border-black/[0.06] dark:border-white/[0.08] text-[14px] font-medium text-gray-800 dark:text-gray-200 shadow-sm transition-all active:scale-[0.98] hover:bg-black/[0.02] dark:hover:bg-white/[0.04] disabled:opacity-50"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          strokeWidth={2.4}
        />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 dark:bg-black/60 backdrop-blur-md"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="w-full sm:max-w-[440px] mx-auto bg-white dark:bg-[#1C1C1E] rounded-t-ios-card sm:rounded-ios-card sm:mb-8 shadow-ios-sheet ring-1 ring-white/50 dark:ring-white/10 max-h-[75vh] flex flex-col overflow-hidden animate-sheet-up">
                {title ? (
                  <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/[0.04] dark:border-white/[0.04]">
                    <h3 className="text-[16px] font-bold text-gray-900 dark:text-gray-100">
                      {title}
                    </h3>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] dark:hover:bg-white/[0.12] transition-colors"
                      onClick={() => setOpen(false)}
                    >
                      <X className="h-4 w-4 text-gray-700 dark:text-gray-300" strokeWidth={2.5} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center pt-3 pb-2">
                    <div className="h-1.5 w-10 rounded-full bg-black/15 dark:bg-white/20" />
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {options.map((opt) => {
                    const active = opt.value === modelValue;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        className={[
                          "w-full flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-left transition-colors active:bg-black/[0.05] dark:active:bg-white/[0.06]",
                          active
                            ? "bg-ios-blue/[0.08] dark:bg-ios-blue/[0.18]"
                            : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                        ].join(" ")}
                        onClick={() => handleSelect(opt)}
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className={[
                              "text-[15px] font-bold truncate",
                              active
                                ? "text-ios-blue"
                                : "text-gray-900 dark:text-gray-100",
                            ].join(" ")}
                          >
                            {opt.label}
                          </div>
                          {opt.description ? (
                            <div className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400 leading-snug">
                              {opt.description}
                            </div>
                          ) : null}
                        </div>
                        {active ? (
                          <Check className="h-5 w-5 shrink-0 text-ios-blue" strokeWidth={2.6} />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="p-3 border-t border-black/[0.04] dark:border-white/[0.04]">
                  <button
                    type="button"
                    className="w-full py-3 rounded-[14px] bg-black/[0.05] dark:bg-white/[0.08] text-[15px] font-bold text-gray-800 dark:text-gray-200 hover:bg-black/[0.08] dark:hover:bg-white/[0.12] transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
