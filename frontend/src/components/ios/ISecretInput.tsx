import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * 4.5: 默认遮蔽的 secret 输入框。
 *
 * 默认 type=password；点击眼睛切换 type=text 临时显示。
 * 不改变 value 行为，只切换可见性。
 */
interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  width?: number | string;
  /** 是否禁用（默认 false） */
  disabled?: boolean;
  /** 默认是否显示明文（默认 false = 遮蔽） */
  defaultVisible?: boolean;
  /** 自定义名 / aria-label */
  ariaLabel?: string;
}

export default function ISecretInput({
  value,
  onChange,
  placeholder,
  className,
  width = 260,
  disabled = false,
  defaultVisible = false,
  ariaLabel,
}: Props) {
  const [visible, setVisible] = useState(defaultVisible);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div
      className={[
        "relative inline-flex items-center",
        className ?? "",
      ].join(" ")}
      style={typeof width === "number" ? { width } : { width }}
    >
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className="no-drag-region w-full rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 pr-9 text-[13px] font-mono text-ios-text dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-ios-textDark focus:outline-none focus:ring-2 focus:ring-ios-blue/30 disabled:opacity-50"
      />
      <button
        type="button"
        className="no-drag-region absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
        onClick={() => setVisible((v) => !v)}
        title={visible ? "隐藏" : "显示明文"}
        aria-label={visible ? "隐藏密文" : "显示明文"}
        tabIndex={-1}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
