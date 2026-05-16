interface Option {
  label: string;
  value: string;
}

interface Props {
  options: Option[];
  modelValue: string;
  onValueChange: (next: string) => void;
}

export default function ISegmented({ options, modelValue, onValueChange }: Props) {
  const activeIndex = options.findIndex((o) => o.value === modelValue);
  return (
    <div className="relative flex items-center bg-gray-200/80 dark:bg-white/10 p-0.5 rounded-[9px] w-full">
      <div
        className="absolute bg-white dark:bg-[#636366] shadow-sm rounded-[7px] h-[calc(100%-4px)] top-0.5 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        style={{
          width: `${100 / options.length}%`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {options.map((opt) => {
        const active = modelValue === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={[
              "no-drag-region relative flex-1 py-1 text-[13px] font-semibold text-center z-10 transition-colors",
              active
                ? "text-ios-text dark:text-white"
                : "text-ios-textSecondary dark:text-ios-textSecondaryDark",
            ].join(" ")}
            onClick={() => onValueChange(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
