import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

interface Props {
  modelValue: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  /** 数字区宽度（不同语义可能要不同宽，比如分钟 3 位 vs 端口 5 位） */
  width?: number;
  /** 数字区是否可直接键入（默认 true） */
  editable?: boolean;
}

/**
 * INumberStepper — iOS 风格数字增减组件。
 * 长按 500ms 后开始连续 ±，间隔 80ms（与 Vue 版同节奏）。
 */
export default function INumberStepper({
  modelValue,
  onValueChange,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  suffix = "",
  disabled = false,
  width = 56,
  editable = true,
}: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));

  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState(String(modelValue));

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  };

  const apply = (delta: number) => {
    if (disabled) return;
    onValueChange(clamp(modelValue + delta));
  };

  const startPress = (delta: number) => {
    if (disabled) return;
    apply(delta);
    pressTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(() => apply(delta), 80);
    }, 500);
  };

  const endPress = () => clearTimers();

  useEffect(() => clearTimers, []);

  const handleEditFocus = () => {
    if (!editable || disabled) return;
    setEditing(true);
    setEditBuffer(String(modelValue));
  };

  const handleEditBlur = () => {
    setEditing(false);
    const n = Number(editBuffer);
    if (Number.isFinite(n)) {
      onValueChange(clamp(n));
    }
  };

  const atMin = modelValue <= min;
  const atMax = modelValue >= max;

  return (
    <div className="no-drag-region inline-flex items-center gap-0.5 rounded-full bg-gray-100 dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.08] p-0.5 shadow-inner">
      <button
        type="button"
        className={[
          "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 ease-out active:scale-90",
          atMin || disabled
            ? "text-gray-400 dark:text-white/30 cursor-not-allowed"
            : "text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/[0.1] active:bg-white",
        ].join(" ")}
        disabled={atMin || disabled}
        onMouseDown={() => startPress(-step)}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={() => startPress(-step)}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
      <div className="flex items-center justify-center px-1" style={{ minWidth: `${width}px` }}>
        {editing ? (
          <input
            value={editBuffer}
            onChange={(e) => setEditBuffer(e.target.value)}
            type="number"
            min={min}
            max={max}
            step={step}
            autoFocus
            className="w-full text-center bg-transparent border-none outline-none text-[15px] font-bold tabular-nums text-gray-900 dark:text-gray-100"
            onBlur={handleEditBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setEditBuffer(String(modelValue));
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        ) : (
          <span
            className={[
              "text-[15px] font-bold tabular-nums text-gray-900 dark:text-gray-100",
              editable && !disabled ? "cursor-text" : "",
            ].join(" ")}
            tabIndex={0}
            onFocus={handleEditFocus}
            onClick={handleEditFocus}
          >
            {modelValue}
            {suffix ? (
              <span className="ml-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
                {suffix}
              </span>
            ) : null}
          </span>
        )}
      </div>
      <button
        type="button"
        className={[
          "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 ease-out active:scale-90",
          atMax || disabled
            ? "text-gray-400 dark:text-white/30 cursor-not-allowed"
            : "text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/[0.1] active:bg-white",
        ].join(" ")}
        disabled={atMax || disabled}
        onMouseDown={() => startPress(step)}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={() => startPress(step)}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
      </button>
    </div>
  );
}
