import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import {
  useMergedTasks,
  useTaskStore,
  type Task,
} from "../stores/useTaskStore";
import { showErrorToast, showToast } from "../utils/toast";

/**
 * F1: TaskDrawer
 *
 * 右上角抽屉，展示后端 + 本地批量任务进度。
 * 由 Header 上的 ListChecks 按钮触发开关。
 *
 * UI 结构：
 *  - 顶部 header：标题 + 「清空已完成」按钮
 *  - task list：每条 = 标题行 + 进度条 + 展开按钮 + 展开后的 items 明细
 *  - 空态：「暂无任务」
 */
export default function TaskDrawer() {
  const open = useTaskStore((s) => s.open);
  const setOpen = useTaskStore((s) => s.setOpen);
  const tasks = useMergedTasks();
  const clearFinished = useTaskStore((s) => s.clearFinished);
  const hasFinished = tasks.some((t) => !t.running);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 z-[101] flex h-full w-full max-w-[420px] flex-col border-l border-black/[0.08] bg-white shadow-2xl ios-page-enter dark:border-white/[0.08] dark:bg-[#1C1C1E]"
        role="dialog"
        aria-label="任务进度"
      >
        <header className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-bold text-ios-text dark:text-ios-textDark">
              任务进度
            </span>
            <span className="text-[11px] font-semibold text-ios-textSecondary dark:text-ios-textSecondaryDark">
              {tasks.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {hasFinished ? (
              <button
                type="button"
                className="no-drag-region rounded-full px-2.5 py-1 text-[11px] font-bold text-ios-blue hover:bg-ios-blue/10 transition-colors"
                onClick={() => void clearFinished()}
                title="移除所有已完成的历史任务"
              >
                清空已完成
              </button>
            ) : null}
            <button
              type="button"
              className="no-drag-region flex h-8 w-8 items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setOpen(false)}
              aria-label="关闭"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {tasks.length === 0 ? (
            <EmptyState />
          ) : (
            tasks.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      </aside>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-ios-textSecondary dark:text-ios-textSecondaryDark">
      <CheckCircle2 className="h-9 w-9 opacity-40 mb-2.5" strokeWidth={1.6} />
      <p className="text-[13px] font-medium">暂无任务</p>
      <p className="mt-1 px-6 text-[11px] opacity-80">
        触发「全量刷新 Token」「全量同步额度」「批量导入」「一键清理」时，会出现进度面板
      </p>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  refresh_tokens: "Token",
  refresh_quotas: "额度",
  import: "导入",
  cleanup: "清理",
  performance_fix: "优化",
};

const KIND_TONE: Record<string, string> = {
  refresh_tokens:
    "bg-ios-blue/10 text-ios-blue border-ios-blue/20",
  refresh_quotas: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  import: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  cleanup: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  performance_fix: "bg-sky-500/10 text-sky-700 border-sky-500/20",
};

function TaskRow({ task }: { task: Task }) {
  const [expanded, setExpanded] = useState(false);
  const failedItems = task.items.filter((it) => it.status === "failed");
  const pct =
    task.total > 0
      ? Math.round((task.completed / task.total) * 100)
      : task.running
      ? 0
      : 100;
  const tone =
    KIND_TONE[task.kind] ||
    "bg-black/[0.04] text-ios-textSecondary dark:text-ios-textSecondaryDark border-black/10 dark:bg-white/[0.06]  dark:border-white/10";

  return (
    <div className="rounded-[14px] border border-black/[0.06] bg-white/60 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex items-center gap-2">
        {task.running ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-ios-blue shrink-0"
            strokeWidth={2.6}
          />
        ) : task.failed > 0 ? (
          <XCircle
            className="h-3.5 w-3.5 text-rose-500 shrink-0"
            strokeWidth={2.6}
          />
        ) : (
          <CheckCircle2
            className="h-3.5 w-3.5 text-emerald-500 shrink-0"
            strokeWidth={2.6}
          />
        )}
        <span className="text-[12px] font-bold flex-1 min-w-0 truncate text-ios-text dark:text-ios-textDark">
          {task.title}
        </span>
        <span
          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-black ${tone}`}
        >
          {KIND_LABEL[task.kind] || task.kind}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              task.failed > 0
                ? "bg-gradient-to-r from-rose-400 to-amber-400"
                : "bg-gradient-to-r from-ios-blue to-cyan-400"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-bold tabular-nums text-ios-textSecondary dark:text-ios-textSecondaryDark shrink-0">
          {task.completed}/{task.total}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ {task.succeeded}
          </span>
          {task.failed > 0 ? (
            <span className="font-semibold text-rose-700 dark:text-rose-300">
              ✗ {task.failed}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {failedItems.length > 0 ? (
            <button
              type="button"
              className="no-drag-region inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
              onClick={() => void copyTaskFailures(task)}
              title="复制失败明细"
            >
              <Copy className="h-3 w-3" strokeWidth={2.6} />
              复制失败
            </button>
          ) : null}
          {task.items.length > 0 ? (
            <button
              type="button"
              className="no-drag-region inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" strokeWidth={2.6} />
              ) : (
                <ChevronRight className="h-3 w-3" strokeWidth={2.6} />
              )}
              明细
            </button>
          ) : null}
        </div>
      </div>

      {expanded && task.items.length > 0 ? (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-[8px] bg-black/[0.02] p-1.5 dark:bg-white/[0.03]">
          {task.items.map((it, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 px-1.5 py-0.5 text-[10px]"
            >
              <span className="shrink-0 mt-0.5">
                {it.status === "ok" ? (
                  <CheckCircle2
                    className="h-3 w-3 text-emerald-500"
                    strokeWidth={2.6}
                  />
                ) : it.status === "failed" ? (
                  <XCircle className="h-3 w-3 text-rose-500" strokeWidth={2.6} />
                ) : (
                  <Loader2 className="h-3 w-3 text-ios-blue animate-spin" />
                )}
              </span>
              <span
                className="font-semibold truncate text-ios-text dark:text-ios-textDark"
                title={it.name}
              >
                {it.name}
              </span>
              {it.detail ? (
                <span
                  className="ml-auto text-ios-textSecondary dark:text-ios-textSecondaryDark truncate text-right max-w-[55%]"
                  title={it.detail}
                >
                  {it.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function buildTaskFailureReport(task: Task): string {
  const failedItems = task.items.filter((it) => it.status === "failed");
  const lines = [
    `任务: ${task.title}`,
    `类型: ${KIND_LABEL[task.kind] || task.kind}`,
    `进度: ${task.completed}/${task.total}`,
    `成功: ${task.succeeded}`,
    `失败: ${task.failed}`,
    "",
    ...failedItems.map((it, i) => {
      const detail = it.detail ? ` — ${it.detail}` : "";
      return `${i + 1}. ${it.name}${detail}`;
    }),
  ];
  return lines.join("\n");
}

async function copyTaskFailures(task: Task) {
  try {
    await navigator.clipboard.writeText(buildTaskFailureReport(task));
    showToast(`已复制 ${task.failed} 条失败明细`, "success");
  } catch (e) {
    showErrorToast(e, "复制失败明细失败");
  }
}

