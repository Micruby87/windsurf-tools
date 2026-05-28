import { useEffect, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

/**
 * 4.4: ? 图标 hover/click 弹气泡说明。
 *
 * 行为：
 * - 鼠标 hover ↔ 显示气泡
 * - 点击 ↔ 持久显示（再点击或点外部关闭，按 Esc 关闭）
 * - 自适应位置：默认在右侧；如果右侧不够则左侧
 *
 * 用法：
 *   <IInfoTooltip>
 *     这里是详细说明，可以是多行文字或 React 节点。
 *   </IInfoTooltip>
 */
interface Props {
  children: ReactNode;
  /** 自定义图标尺寸（px），默认 14 */
  size?: number;
  /** 自定义气泡最大宽度（px），默认 280 */
  maxWidth?: number;
  /** 自定义 className 给图标按钮 */
  className?: string;
}

export default function IInfoTooltip({
  children,
  size = 14,
  maxWidth = 280,
  className,
}: Props) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [placement, setPlacement] = useState<"right" | "left">("right");
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  const visible = hover || pinned;

  // 点击外部关闭 pinned
  useEffect(() => {
    if (!pinned) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setPinned(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [pinned]);

  // 自适应位置：图标右侧若不够 maxWidth+24 px 则放左侧
  useEffect(() => {
    if (!visible || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const rightSpace = window.innerWidth - rect.right;
    setPlacement(rightSpace < maxWidth + 24 ? "left" : "right");
  }, [visible, maxWidth]);

  return (
    <span
      ref={wrapperRef}
      className={[
        "relative inline-flex items-center align-middle ml-1",
        className ?? "",
      ].join(" ")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className="no-drag-region inline-flex items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark transition-colors hover:bg-black/[0.05] hover:text-ios-blue dark:hover:bg-white/[0.08] dark:hover:text-blue-300"
        style={{ width: size + 8, height: size + 8 }}
        title="详细说明"
        aria-label="显示详细说明"
        onClick={(e) => {
          e.stopPropagation();
          setPinned((p) => !p);
        }}
      >
        <HelpCircle style={{ width: size, height: size }} strokeWidth={2.4} />
      </button>
      {visible ? (
        <span
          role="tooltip"
          className={[
            "pointer-events-none absolute top-1/2 -translate-y-1/2 z-[60] rounded-[10px] border border-black/[0.08] bg-white px-3 py-2 text-[11.5px] leading-relaxed text-ios-text shadow-[0_8px_24px_rgba(15,23,42,0.18)] dark:border-white/[0.1] dark:bg-[#252528] dark:text-ios-textDark",
            placement === "right" ? "left-full ml-2" : "right-full mr-2",
          ].join(" ")}
          style={{ width: maxWidth, maxWidth }}
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
