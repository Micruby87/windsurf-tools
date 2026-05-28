import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Folder,
  RotateCcw,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import { APIInfo } from "../api/wails";
import { showErrorToast, showToast } from "../utils/toast";

/**
 * P3: Jailbreak 运行时卡
 *
 * 暴露后端 5 个 API（Settings UI 之前完全没接）：
 *   - getJailbreakRuntime —— 当前生效文本 / 注入计数 / file 状态 / Anthropic 警告
 *   - saveJailbreakOverrideFile —— 保存 inline 文本到默认 file 路径
 *   - openJailbreakOverrideFile —— 系统编辑器打开 file
 *   - revealJailbreakOverrideFolder —— Finder/资源管理器打开目录
 *   - resetJailbreakStats —— 清零注入计数
 *
 * 父组件传 currentInlineText/source/file 用于 save 按钮判断；
 * 仅 enabled=true 时显示，poll 间隔 5s（页面可见时）。
 */

interface Props {
  enabled: boolean;
  /** 当前 inline textarea 内容（用于"保存到文件"按钮） */
  currentInlineText: string;
  /** 当前 source: inline | file */
  source: string;
}

interface Runtime {
  enabled: boolean;
  preset_id: string;
  source: string;
  active_text: string;
  active_length: number;
  file_path?: string;
  file_status?: {
    path: string;
    exists: boolean;
    size: number;
    charset: string;
    excerpt: string;
    truncated: boolean;
    is_dir: boolean;
    error?: string;
  };
  stats: {
    total_injects: number;
    today_injects: number;
    last_inject_at?: string;
    since_last_inject_ms: number;
  };
  warn_anthropic: boolean;
}

const POLL_INTERVAL_MS = 5_000;

export default function JailbreakRuntimeCard({
  enabled,
  currentInlineText,
  source,
}: Props) {
  const [rt, setRt] = useState<Runtime | null>(null);
  const [busy, setBusy] = useState<
    "save" | "open" | "reveal" | "reset" | null
  >(null);

  useEffect(() => {
    if (!enabled) {
      setRt(null);
      return;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const r = (await APIInfo.getJailbreakRuntime()) as Runtime;
        setRt(r);
      } catch (e) {
        console.error("getJailbreakRuntime error:", e);
      }
    };
    void tick();
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void tick();
      }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    start();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void tick();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);

  if (!enabled) return null;

  const handleSave = async () => {
    if (busy) return;
    const text = (currentInlineText || "").trim();
    if (!text) {
      showToast("请先在下方文本框填写 override 内容", "warning");
      return;
    }
    setBusy("save");
    try {
      const path = await APIInfo.saveJailbreakOverrideFile(text);
      showToast(`已保存到：\n${path}`, "success", 5000);
    } catch (e) {
      showErrorToast(e, "保存失败");
    } finally {
      setBusy(null);
    }
  };

  const handleOpen = async () => {
    if (busy) return;
    setBusy("open");
    try {
      const path = await APIInfo.openJailbreakOverrideFile();
      showToast(`已打开 ${path}`, "success");
    } catch (e) {
      showErrorToast(e, "打开文件失败");
    } finally {
      setBusy(null);
    }
  };

  const handleReveal = async () => {
    if (busy) return;
    setBusy("reveal");
    try {
      const path = await APIInfo.revealJailbreakOverrideFolder();
      showToast(`已打开目录 ${path}`, "success");
    } catch (e) {
      showErrorToast(e, "打开目录失败");
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (busy) return;
    setBusy("reset");
    try {
      await APIInfo.resetJailbreakStats();
      // 立即拉一次最新状态
      const fresh = (await APIInfo.getJailbreakRuntime()) as Runtime;
      setRt(fresh);
      showToast("注入统计已重置", "success");
    } catch (e) {
      showErrorToast(e, "重置失败");
    } finally {
      setBusy(null);
    }
  };

  const fileStatus = rt?.file_status;
  const stats = rt?.stats;

  return (
    <div className="px-5 sm:px-6 py-3 border-b border-black/[0.04] dark:border-white/[0.04] bg-violet-500/[0.03]">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
            <Sparkles className="h-4 w-4" strokeWidth={2.6} />
          </span>
          <span className="text-[12.5px] font-bold text-ios-text dark:text-ios-textDark">
            破限注入运行时
          </span>
        </div>
        {rt ? (
          <span
            className={[
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
              rt.active_length > 0
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            ].join(" ")}
            title={
              rt.active_length > 0
                ? `当前生效文本 ${rt.active_length} 字符（来源 ${rt.source}）`
                : "当前 active_text 为空 — 注入未生效"
            }
          >
            {rt.active_length > 0 ? (
              <CheckCircle2 className="h-3 w-3" strokeWidth={2.6} />
            ) : (
              <XCircle className="h-3 w-3" strokeWidth={2.6} />
            )}
            {rt.active_length > 0 ? `已生效 ${rt.active_length}字` : "未生效"}
          </span>
        ) : null}
        <span className="text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark ml-auto">
          来源：{rt?.source ?? source ?? "—"}
        </span>
      </div>

      {/* 注入统计 */}
      {stats ? (
        <div className="grid grid-cols-3 gap-2 mb-2 text-center">
          <Stat
            label="今日注入"
            value={stats.today_injects.toString()}
            tone="violet"
          />
          <Stat
            label="累计注入"
            value={stats.total_injects.toString()}
            tone="indigo"
          />
          <Stat
            label="上次注入"
            value={
              stats.last_inject_at
                ? formatRelative(stats.since_last_inject_ms)
                : "—"
            }
            tone="slate"
          />
        </div>
      ) : null}

      {/* Anthropic 警告 */}
      {rt?.warn_anthropic ? (
        <div className="mb-2 flex items-start gap-1.5 rounded-[10px] bg-amber-500/[0.10] border border-amber-500/25 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0 mt-0.5"
            strokeWidth={2.6}
          />
          <span>
            检测到 malware / shellcode / EDR bypass 等 Anthropic
            cyber-policy 黑名单关键词 — Claude 系列模型大概率会拒绝处理注入此文本的对话。建议改成更中性表述。
          </span>
        </div>
      ) : null}

      {/* 文件状态（仅 source=file） */}
      {source === "file" && fileStatus ? (
        <div className="mb-2 rounded-[10px] bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-mono text-[10.5px] truncate text-ios-text dark:text-ios-textDark min-w-0 flex-1">
              {fileStatus.path}
            </span>
            <span
              className={[
                "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black",
                fileStatus.exists
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
              ].join(" ")}
            >
              {fileStatus.exists ? `${formatBytes(fileStatus.size)}` : "不存在"}
            </span>
          </div>
          {fileStatus.error ? (
            <div className="text-[10.5px] text-rose-700 dark:text-rose-300">
              {fileStatus.error}
            </div>
          ) : fileStatus.excerpt ? (
            <div className="text-[10.5px] text-ios-textSecondary dark:text-ios-textSecondaryDark truncate">
              {fileStatus.excerpt}
              {fileStatus.truncated ? "…" : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 操作按钮组 */}
      <div className="flex flex-wrap gap-1.5">
        <Btn
          icon={Save}
          label="保存到文件"
          busy={busy === "save"}
          onClick={handleSave}
          title="把下方 inline 文本框的内容保存到默认 ~/.claude/override.md"
        />
        <Btn
          icon={ExternalLink}
          label="打开文件"
          busy={busy === "open"}
          onClick={handleOpen}
          title="系统默认编辑器打开 override 文件"
        />
        <Btn
          icon={Folder}
          label="打开目录"
          busy={busy === "reveal"}
          onClick={handleReveal}
          title="Finder / 资源管理器 打开 override 所在目录"
        />
        <Btn
          icon={RotateCcw}
          label="重置统计"
          busy={busy === "reset"}
          onClick={handleReset}
          title="清零注入计数（today + total）"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "violet" | "indigo" | "slate";
}) {
  const toneCls =
    tone === "violet"
      ? "text-violet-700 dark:text-violet-300"
      : tone === "indigo"
      ? "text-indigo-700 dark:text-indigo-300"
      : "text-slate-700 dark:text-slate-300";
  return (
    <div className="rounded-[10px] bg-black/[0.03] dark:bg-white/[0.04] py-1.5">
      <div className={`text-[15px] font-black tabular-nums ${toneCls}`}>
        {value}
      </div>
      <div className="text-[9px] text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide">
        {label}
      </div>
    </div>
  );
}

function Btn({
  icon: Icon,
  label,
  busy,
  onClick,
  title,
}: {
  icon: typeof Save;
  label: string;
  busy?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="no-drag-region inline-flex items-center gap-1 rounded-full bg-black/[0.04] hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] px-2.5 py-1 text-[11px] font-bold text-ios-text dark:text-ios-textDark disabled:opacity-50 transition-colors"
      onClick={onClick}
      disabled={busy}
      title={title}
    >
      <Icon
        className={`h-3 w-3 ${busy ? "animate-pulse" : ""}`}
        strokeWidth={2.6}
      />
      <span>{label}</span>
    </button>
  );
}

function formatRelative(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return "刚刚";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s 前`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}min 前`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h 前`;
  return `${Math.floor(ms / 86_400_000)}d 前`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
