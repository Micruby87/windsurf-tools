// F7-REMOVAL: 整文件删除（仅作者自用功能；发布前彻底移除）
import { ShieldCheck } from "lucide-react";
import { useSmartFriend } from "../hooks/useSmartFriend";

interface Props {
  variant?: "full" | "compact";
}

/**
 * F7Banner — SmartFriend(F7) 模式下显示的提示条。
 *
 * variant:
 *   - 'full'    Dashboard 顶部完整状态条（图标 + 标题 + 副标题）
 *   - 'compact' Accounts 头部 inline chip（小图标 + 一行）
 */
export default function F7Banner({ variant }: Props) {
  const sf = useSmartFriend();
  if (!sf.active) return null;

  if (variant === "compact") {
    return (
      <div
        className="mt-2 inline-flex items-center gap-2 rounded-ios-pill border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.10] to-violet-500/[0.06] px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
        title="SmartFriend 模式下，服务端按 SMART_FRIEND 计费、绕过日/周限额"
      >
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
        F7 模式 · 已绕过日/周额度限制
      </div>
    );
  }

  return (
    <div className="mx-6 mb-5 flex flex-wrap items-center gap-2 rounded-ios-block border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.10] to-violet-500/[0.06] px-4 py-2.5 text-[12px]">
      <span className="inline-flex items-center gap-1.5 rounded-ios-pill bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
        F7 已开启
      </span>
      <span className="font-semibold text-emerald-800 dark:text-emerald-200">
        SmartFriend 模式 · 服务端按 SMART_FRIEND 计费、绕过日/周限额
      </span>
      <span className="text-emerald-700/70 dark:text-emerald-300/80 leading-relaxed">
        · 显示「耗尽」的账号实际仍可用，自动切号已暂停。
      </span>
    </div>
  );
}
