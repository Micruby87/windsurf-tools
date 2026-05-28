import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  FileUp,
  KeyRound,
  Loader2,
  Mail,
  RefreshCcw,
  Shield,
  X,
} from "lucide-react";
import { APIInfo } from "../../api/wails";
import { useAccountStore } from "../../stores/useAccountStore";
import { useTaskStore } from "../../stores/useTaskStore";
import {
  groupImportLines,
  summarizeGrouped,
  type DetectionSummary,
} from "../../utils/importAutoDetect";
import { importBatched } from "../../utils/importBatch";
import { showErrorToast, showToast } from "../../utils/toast";
import { main } from "../../../wailsjs/go/models";

type IconType = ComponentType<{ className?: string; strokeWidth?: number | string }>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<
  "api_key" | "jwt" | "password" | "refresh_token" | "email_apikey",
  { label: string; icon: IconType; color: string }
> = {
  api_key: { label: "API Key", icon: KeyRound, color: "text-violet-600 dark:text-violet-300" },
  jwt: { label: "JWT", icon: Shield, color: "text-amber-600 dark:text-amber-300" },
  password: { label: "邮箱/密码", icon: Mail, color: "text-ios-blue" },
  refresh_token: {
    label: "Refresh Token",
    icon: RefreshCcw,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  email_apikey: {
    label: "邮箱/Token",
    icon: KeyRound,
    color: "text-pink-600 dark:text-pink-300",
  },
};

const SAMPLE_SNIPPETS: Array<{
  key: string;
  label: string;
  example: string;
  icon: IconType;
  color: string;
}> = [
  {
    key: "api_key",
    label: "API Key",
    example:
      "sk-ws-01-PY-xF5So2UsSMwJmh3uoMN3Offz72sCKQFxRFkkQce9LSvvtcWZxThzto7Z9b8zZbtfTLB-YPGlPsW9bKRmJ_qgvZ5WRtA",
    icon: KeyRound,
    color: "text-violet-600 dark:text-violet-300",
  },
  {
    key: "jwt",
    label: "JWT",
    example:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    icon: Shield,
    color: "text-amber-600 dark:text-amber-300",
  },
  {
    key: "password",
    label: "邮箱/密码",
    example: "user@example.com password123",
    icon: Mail,
    color: "text-ios-blue",
  },
  {
    key: "refresh_token",
    label: "Refresh Token",
    example:
      "AMf-vBz3OJ3G8x1QQaQSFfU46fK9oODqKJGw-k5a5zE8mu-nq9zR4o-TC92P8KO0A6v_EXL5DlgVR1A7x_7P0i3VOXeoPNPyi0IDLN4ZP6iSHohosYjyUMELkC7z",
    icon: RefreshCcw,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "email_apikey",
    label: "邮箱----Token",
    example:
      "user@example.com----devin-session-token$eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
    icon: KeyRound,
    color: "text-pink-600 dark:text-pink-300",
  },
];

/**
 * ImportModal — 批量导入号池账号。
 *
 * 行为：
 *   - 文本框混合粘贴：API Key / JWT / 邮箱密码 / 邮箱----Token / Refresh Token
 *   - 实时按类型识别 + chip 计数
 *   - 「开始导入」按钮按类型分批提交，每批完成后实时回填 results
 *   - 全部完成 → 刷新账号 store + 弹 toast
 *   - 关闭时清空所有状态
 */
export default function ImportModal({ isOpen, onClose }: Props) {
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<main.ImportResult[]>([]);
  const [expandedFailures, setExpandedFailures] = useState<Set<number>>(
    new Set(),
  );
  // 1.3: 拖拽上传状态。dragDepth 跟踪嵌套 dragenter/leave 计数，避免子元素 leave 误关。
  const [dragDepth, setDragDepth] = useState(0);
  const isDragging = dragDepth > 0;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 关闭模态时清空，避免下次打开看到上次残留
  useEffect(() => {
    if (!isOpen) {
      setInputText("");
      setResults([]);
      setExpandedFailures(new Set());
      setIsLoading(false);
      setDragDepth(0);
    }
  }, [isOpen]);

  // 1.3: 读取文件文本（默认 UTF-8）并追加到 textarea。
  const readAndAppendFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const SUPPORTED = /\.(txt|json|csv|md|log|jsonl|env)$/i;
    const ALLOWED_MIME =
      /^(text\/|application\/(json|x-ndjson|x-yaml|csv))/i;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of list) {
      if (SUPPORTED.test(f.name) || ALLOWED_MIME.test(f.type) || f.type === "") {
        accepted.push(f);
      } else {
        rejected.push(f.name);
      }
    }
    if (rejected.length > 0) {
      showToast(
        `已忽略 ${rejected.length} 个不支持的文件: ${rejected.slice(0, 2).join(", ")}${
          rejected.length > 2 ? "…" : ""
        }`,
        "warning",
      );
    }
    if (accepted.length === 0) return;
    try {
      const texts = await Promise.all(accepted.map((f) => f.text()));
      const joined = texts.join("\n").trim();
      if (!joined) {
        showToast("拖入的文件为空", "warning");
        return;
      }
      setInputText((prev) => {
        const sep = prev.trim() ? "\n" : "";
        return prev + sep + joined;
      });
      const lines = joined.split("\n").filter((l) => l.trim()).length;
      showToast(
        `已读入 ${accepted.length} 个文件 · ${lines} 行候选`,
        "success",
      );
    } catch (e) {
      showErrorToast(e, "读取文件失败");
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setDragDepth((d) => d + 1);
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    if (e.dataTransfer.files.length > 0) {
      void readAndAppendFiles(e.dataTransfer.files);
    }
  };
  const handlePickFile = () => fileInputRef.current?.click();
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void readAndAppendFiles(e.target.files);
      e.target.value = ""; // 允许同名文件再次选
    }
  };

  const detectionSummary: DetectionSummary = useMemo(() => {
    const lines = inputText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) {
      return {
        api_key: 0,
        jwt: 0,
        refresh_token: 0,
        password: 0,
        email_apikey: 0,
        unknown: 0,
        total: 0,
      };
    }
    const grouped = groupImportLines(lines);
    return summarizeGrouped(grouped);
  }, [inputText]);

  const lineCount = detectionSummary.total;
  const unknownCount = detectionSummary.unknown;
  const totalInputLines = useMemo(
    () => inputText.split("\n").map((l) => l.trim()).filter(Boolean).length,
    [inputText],
  );
  const successCount = useMemo(
    () => results.filter((r) => r.success).length,
    [results],
  );
  const failureCount = useMemo(
    () => results.filter((r) => !r.success).length,
    [results],
  );

  const activeTypes = useMemo(() => {
    const s = detectionSummary;
    return (
      ["api_key", "jwt", "password", "refresh_token", "email_apikey"] as const
    )
      .filter((t) => s[t] > 0)
      .map((t) => ({ type: t, count: s[t], ...TYPE_LABELS[t] }));
  }, [detectionSummary]);

  const insertSample = (snippet: (typeof SAMPLE_SNIPPETS)[number]) => {
    const cur = inputText;
    const sep = cur && !cur.endsWith("\n") ? "\n" : "";
    setInputText(cur + sep + snippet.example + "\n");
  };

  const toggleFailure = (idx: number) => {
    setExpandedFailures((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleImport = async () => {
    const lines = inputText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setIsLoading(true);
    setResults([]);
    // F1: 注册本地任务，自动打开 Drawer 让用户看进度
    const taskID = useTaskStore.getState().startLocal({
      kind: "import",
      title: `批量导入 (${lines.length})`,
      total: lines.length,
    });
    useTaskStore.getState().setOpen(true);
    try {
      const grouped = groupImportLines(lines);
      let allResults: main.ImportResult[] = [];
      let lastReportedCount = 0;

      const runBatch = async (
        items: any[],
        fn: (slice: any[]) => Promise<main.ImportResult[]>,
      ) => {
        if (!items.length) return;
        const batch = await importBatched(items, fn, (acc) => {
          setResults([...allResults, ...acc]);
          // 增量推送到 task store
          const merged = [...allResults, ...acc];
          while (lastReportedCount < merged.length) {
            const r = merged[lastReportedCount];
            useTaskStore.getState().updateLocal(taskID, {
              addItem: {
                name: r.email || `第 ${lastReportedCount + 1} 条`,
                status: r.success ? "ok" : "failed",
                detail: r.error || (r.success ? "导入成功" : ""),
              },
            });
            lastReportedCount++;
          }
        });
        allResults = [...allResults, ...(batch || [])];
        setResults([...allResults]);
        while (lastReportedCount < allResults.length) {
          const r = allResults[lastReportedCount];
          useTaskStore.getState().updateLocal(taskID, {
            addItem: {
              name: r.email || `第 ${lastReportedCount + 1} 条`,
              status: r.success ? "ok" : "failed",
              detail: r.error || (r.success ? "导入成功" : ""),
            },
          });
          lastReportedCount++;
        }
      };

      await runBatch(grouped.apiKeys, (slice) => APIInfo.importByAPIKey(slice));
      await runBatch(grouped.jwts, (slice) => APIInfo.importByJWT(slice));
      await runBatch(grouped.tokens, (slice) =>
        APIInfo.importByRefreshToken(slice),
      );
      await runBatch(grouped.emailApiKeys, (slice) =>
        APIInfo.importByEmailAPIKey(slice),
      );
      await runBatch(grouped.passwords, (slice) =>
        APIInfo.importByEmailPassword(slice),
      );

      await useAccountStore.getState().fetchAccounts(true);
      const ok = allResults.filter((r) => r.success).length;
      const total = allResults.length;
      if (total > 0) {
        showToast(
          `导入结束：成功 ${ok} / ${total} 条`,
          ok === total ? "success" : "info",
          5000,
        );
      }
      setInputText("");
    } catch (e) {
      console.error(e);
      showErrorToast(e, "导入失败");
    } finally {
      setIsLoading(false);
      useTaskStore.getState().finishLocal(taskID);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-300 items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-md">
      <div className="bg-ios-bg dark:bg-ios-bgDark w-full sm:w-[580px] max-h-[85vh] rounded-ios-card shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] ring-1 ring-white/50 dark:ring-white/10 flex flex-col transform transition-transform animate-in slide-in-from-bottom-12 duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-ios-text dark:text-ios-textDark leading-tight">
              批量导入账号
            </h2>
            <p className="text-[11.5px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
              支持混合粘贴 API Key / JWT / 邮箱密码 / 邮箱----Token / Refresh Token
            </p>
          </div>
          <button
            type="button"
            className="no-drag-region rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors ios-btn"
            title="关闭"
            onClick={onClose}
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-[18px] border border-black/[0.06] bg-black/[0.03] px-4 py-3 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                待导入
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-[24px] font-extrabold leading-none text-ios-text dark:text-ios-textDark">
                  {lineCount}
                </span>
                <span className="pb-0.5 text-[11px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
                  条
                </span>
              </div>
            </div>
            <div className="rounded-[18px] border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700/75 dark:text-emerald-300/80">
                成功
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-[24px] font-extrabold leading-none text-emerald-700 dark:text-emerald-300">
                  {successCount}
                </span>
                <span className="pb-0.5 text-[11px] font-medium text-emerald-700/70 dark:text-emerald-300/80">
                  条
                </span>
              </div>
            </div>
            <div className="rounded-[18px] border border-rose-500/15 bg-rose-500/[0.05] px-4 py-3 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700/75 dark:text-rose-300/80">
                失败
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-[24px] font-extrabold leading-none text-rose-700 dark:text-rose-300">
                  {failureCount}
                </span>
                <span className="pb-0.5 text-[11px] font-medium text-rose-700/70 dark:text-rose-300/80">
                  条
                </span>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-ios-textSecondary dark:text-ios-textSecondaryDark">
              <ClipboardCopy className="h-3 w-3" strokeWidth={2.5} />
              支持格式 · 点击插入示例
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_SNIPPETS.map((snippet) => {
                const Icon = snippet.icon;
                return (
                  <button
                    key={snippet.key}
                    type="button"
                    className="no-drag-region inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/85 px-3 py-1.5 text-[12px] font-bold text-ios-text dark:text-ios-textDark transition-all hover:-translate-y-px hover:bg-white hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.06] ios-btn"
                    title={`点击把「${snippet.label}」示例追加到下方输入框`}
                    onClick={() => insertSample(snippet)}
                  >
                    <Icon className={`h-3.5 w-3.5 ${snippet.color}`} strokeWidth={2.4} />
                    <span className={snippet.color}>{snippet.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[22px] border border-black/[0.06] bg-white/75 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)] dark:border-white/[0.06] dark:bg-black/20">
            <div className="mb-3">
              <div className="text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                混合粘贴
              </div>
              <div className="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                支持混合粘贴 — API Key、JWT、邮箱密码、邮箱----Token、Refresh Token 可一起粘贴，自动分流导入。
              </div>
            </div>

            {/* 1.3: drop zone wrapper — 整个区域接 drag/drop，drop 时读文件追加到 textarea */}
            <div
              className="relative"
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className={[
                  "no-drag-region w-full h-[180px] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,249,252,0.9))] dark:bg-[linear-gradient(180deg,rgba(10,10,12,0.75),rgba(18,18,20,0.88))] border p-4 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-ios-blue/50 dark:focus:ring-ios-blue/30 resize-none font-mono text-[13px] shadow-inner transition-all",
                  isDragging
                    ? "border-ios-blue/70 ring-2 ring-ios-blue/30"
                    : "border-black/10 dark:border-white/10",
                ].join(" ")}
                placeholder={
                  "粘贴任意格式的凭证…\n或点击上方示例 chip 试试看\n或拖拽 .txt / .json 文件到这里\n\nsk-ws-01-xxxx\neyJhbGciOi...\nuser@mail.com password123\nuser@mail.com----devin-session-token$eyJ...\nAMf-vBx..."
                }
              />
              {isDragging ? (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-[18px] bg-ios-blue/[0.10] dark:bg-ios-blue/[0.18] border-2 border-dashed border-ios-blue/60 backdrop-blur-[1px]">
                  <FileUp
                    className="h-8 w-8 text-ios-blue mb-2"
                    strokeWidth={2.4}
                  />
                  <div className="text-[13px] font-bold text-ios-blue">
                    松手导入文件
                  </div>
                  <div className="mt-1 text-[10px] font-medium text-ios-blue/80">
                    支持 .txt / .json / .csv / .md / .log / .jsonl
                  </div>
                </div>
              ) : null}

              {/* 隐藏的 file input + 「选择文件」小按钮 */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.json,.csv,.md,.log,.jsonl,.env,text/plain,application/json"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <button
                type="button"
                onClick={handlePickFile}
                className="no-drag-region absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full border border-black/[0.08] bg-white/85 px-3 py-1 text-[10px] font-bold text-ios-text shadow-sm backdrop-blur-sm transition-colors hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.08] dark:text-ios-textDark dark:hover:bg-white/[0.14]"
                title="选择本地凭证文件追加到上方"
              >
                <FileUp className="h-3 w-3" strokeWidth={2.6} />
                选择文件
              </button>
            </div>
          </div>

          {results.length > 0 ? (
            <div className="mt-5 space-y-3 max-h-48 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ios-textSecondary dark:text-ios-textSecondaryDark">
                  导入结果
                </h4>
                <span className="text-[11px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
                  已处理 {results.length} 条
                </span>
              </div>
              {results.map((r, i) => (
                <div
                  key={i}
                  className={[
                    "rounded-[18px] border shadow-sm backdrop-blur-sm overflow-hidden transition-colors",
                    r.success
                      ? "bg-emerald-500/[0.08] border-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/[0.07] border-rose-500/15 text-rose-700 dark:text-rose-300",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    className="no-drag-region w-full flex items-center justify-between gap-2 p-3 text-xs text-left disabled:cursor-default"
                    disabled={r.success}
                    title={r.success ? "导入成功" : "点击查看完整错误信息"}
                    onClick={() => !r.success && toggleFailure(i)}
                  >
                    <span className="font-semibold truncate flex-1 min-w-0" title={r.email}>
                      {r.email || "—"}
                    </span>
                    <div className="flex items-center shrink-0 font-medium gap-1">
                      {r.success ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <AlertCircle className="w-4 h-4" />
                      )}
                      <span className="max-w-[160px] truncate">
                        {r.success ? "成功" : r.error || "失败"}
                      </span>
                      {!r.success && !expandedFailures.has(i) ? (
                        <ChevronDown className="w-3.5 h-3.5 opacity-70" strokeWidth={2.5} />
                      ) : null}
                      {!r.success && expandedFailures.has(i) ? (
                        <ChevronUp className="w-3.5 h-3.5 opacity-70" strokeWidth={2.5} />
                      ) : null}
                    </div>
                  </button>
                  {!r.success && expandedFailures.has(i) ? (
                    <div className="px-3 pb-3 pt-0 select-text">
                      <div className="rounded-[12px] bg-rose-500/[0.06] border border-rose-500/10 p-2.5 text-[11px] leading-relaxed font-mono break-all whitespace-pre-wrap">
                        {r.email ? (
                          <div className="opacity-75 mb-1">email: {r.email}</div>
                        ) : null}
                        <div>{r.error || "无错误描述"}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="p-5 border-t border-black/[0.06] dark:border-white/[0.06] bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ios-text dark:text-ios-textDark">
                {lineCount > 0 ? (
                  <>
                    准备导入 {lineCount} 条（
                    {activeTypes
                      .map((t) => `${t.label} ×${t.count}`)
                      .join("、")}
                    ）
                    {unknownCount > 0 ? (
                      <span className="font-medium text-amber-700 dark:text-amber-300">
                        · {unknownCount} 行跳过
                      </span>
                    ) : null}
                  </>
                ) : totalInputLines > 0 ? (
                  <span className="text-amber-700 dark:text-amber-300">
                    {totalInputLines} 行均未识别为有效凭证 — 请检查格式（API
                    Key/JWT/邮箱密码/邮箱----Token/Refresh Token）
                  </span>
                ) : (
                  "等待粘贴内容"
                )}
              </div>
              <div className="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                {isLoading
                  ? "正在分批提交并同步账号池…"
                  : "导入完成后会自动刷新账号池列表"}
              </div>
            </div>
            <button
              type="button"
              className="no-drag-region h-[48px] min-w-[144px] px-5 bg-gradient-to-b from-[#3b82f6] to-ios-blue text-white rounded-ios-block font-semibold text-[16px] ios-btn flex items-center justify-center disabled:opacity-50 shadow-md shadow-ios-blue/20 ring-1 ring-black/5 ring-inset active:ring-black/10"
              disabled={isLoading || !inputText.trim() || lineCount === 0}
              onClick={handleImport}
            >
              {isLoading ? <Loader2 className="w-5 h-5 ios-spinner mr-2" /> : null}
              {isLoading ? "导入中…" : "开始导入"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
