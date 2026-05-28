import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

/**
 * 1.2: 快捷键速查面板（按 ? 弹出）。
 *
 * 监听 'open-hotkeys-cheatsheet' 打开 / 'close-overlays' 关闭。
 * Mac 显示 ⌘，其他平台显示 Ctrl。
 */

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const SECTIONS: Array<{
  title: string;
  items: Array<{ keys: string; label: string }>;
}> = [
  {
    title: "导航",
    items: [
      { keys: `${MOD} 1`, label: "总览 (Dashboard)" },
      { keys: `${MOD} 2`, label: "号池 (Accounts)" },
      { keys: `${MOD} 3`, label: "用量统计 (Usage)" },
      { keys: `${MOD} 4`, label: "OpenAI Relay" },
      { keys: `${MOD} 5`, label: "清理优化 (Cleanup)" },
      { keys: `${MOD} 6`, label: "MITM 设置 (Settings)" },
      { keys: `${MOD} ,`, label: "进入设置（偏好）" },
    ],
  },
  {
    title: "操作",
    items: [
      { keys: `${MOD} K`, label: "命令面板（搜索 + 跳转 + 执行）" },
      { keys: `${MOD} R`, label: "刷新当前视图" },
      { keys: "?", label: "显示快捷键速查（本面板）" },
      { keys: "Esc", label: "关闭弹层 / 命令面板 / 速查" },
    ],
  },
];

export default function HotkeysCheatSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    window.addEventListener("open-hotkeys-cheatsheet", onOpen);
    window.addEventListener("close-overlays", onClose);
    return () => {
      window.removeEventListener("open-hotkeys-cheatsheet", onOpen);
      window.removeEventListener("close-overlays", onClose);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[195] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="快捷键速查"
    >
      <div
        className="w-full max-w-[520px] rounded-[18px] bg-white dark:bg-[#1C1C1E] shadow-2xl ring-1 ring-black/[0.05] dark:ring-white/[0.06] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-ios-blue/12 text-ios-blue">
              <Keyboard className="h-4 w-4" strokeWidth={2.6} />
            </span>
            <span className="text-[14px] font-bold text-ios-text dark:text-ios-textDark">
              快捷键速查
            </span>
          </div>
          <button
            type="button"
            className="no-drag-region flex h-7 w-7 items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => setOpen(false)}
            aria-label="关闭"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className="px-4 py-3 space-y-4">
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ios-textSecondary dark:text-ios-textSecondaryDark mb-1.5">
                {sec.title}
              </div>
              <div className="rounded-[12px] border border-black/[0.05] dark:border-white/[0.06] divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                {sec.items.map((it) => (
                  <div
                    key={it.keys}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]"
                  >
                    <span className="text-ios-text dark:text-ios-textDark">
                      {it.label}
                    </span>
                    <span className="flex items-center gap-1">
                      {it.keys.split(" ").map((k, i) => (
                        <kbd
                          key={i}
                          className="rounded bg-black/[0.06] dark:bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-mono font-bold text-ios-text dark:text-ios-textDark"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark px-1 pb-2">
            提示：在文本输入框中，无修饰键的快捷键（例如 ?）会自动让位给正常输入。
          </div>
        </div>
      </div>
    </div>
  );
}
