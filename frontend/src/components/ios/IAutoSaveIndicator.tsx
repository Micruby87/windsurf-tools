import type { ComponentType } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface Props {
  state: "idle" | "saving" | "saved" | "error";
  errorText?: string;
}

/**
 * IAutoSaveIndicator — Settings 自动保存状态指示。
 * 4 种状态：idle / saving / saved / error。
 */
export default function IAutoSaveIndicator({ state, errorText }: Props) {
  if (state === "idle") return null;

  let Icon: ComponentType<{ className?: string; strokeWidth?: number | string }> =
    CheckCircle2;
  let text = "";
  let cls = "";
  let spin = false;
  switch (state) {
    case "saving":
      Icon = Loader2;
      text = "保存中…";
      cls = "text-ios-blue dark:text-ios-blueDark";
      spin = true;
      break;
    case "saved":
      Icon = CheckCircle2;
      text = "已保存";
      cls = "text-emerald-600 dark:text-emerald-400";
      break;
    case "error":
      Icon = AlertCircle;
      text = errorText || "保存失败";
      cls = "text-rose-600 dark:text-rose-400";
      break;
  }

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 text-[12px] font-semibold",
        cls,
      ].join(" ")}
      role="status"
      aria-live={state === "error" ? "assertive" : "polite"}
    >
      <Icon
        className={["h-3.5 w-3.5", spin ? "animate-spin" : ""].join(" ")}
        strokeWidth={2.5}
      />
      {text}
    </span>
  );
}
