interface Props {
  modelValue: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}

/** 与 Vue 版同名 prop（modelValue / onValueChange）以方便对照迁移 */
export default function IToggle({ modelValue, onValueChange, disabled = false }: Props) {
  const handleClick = () => {
    if (disabled) return;
    onValueChange(!modelValue);
  };
  return (
    <button
      type="button"
      className={[
        "no-drag-region w-[50px] h-8 rounded-full p-0.5 flex items-center transition-colors duration-300 ease-out shrink-0 active:scale-95",
        modelValue
          ? "bg-ios-green dark:bg-ios-greenDark shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]"
          : "bg-gray-300 dark:bg-white/15",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
      ].join(" ")}
      disabled={disabled}
      onClick={handleClick}
      role="switch"
      aria-checked={modelValue}
    >
      <div
        className={[
          "w-7 h-7 bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] dark:shadow-sm transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          modelValue ? "translate-x-[18px] scale-100" : "translate-x-[2px] scale-100",
        ].join(" ")}
      />
    </button>
  );
}
