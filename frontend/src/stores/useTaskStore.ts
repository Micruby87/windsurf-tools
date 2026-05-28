/**
 * F1: 批量任务进度跟踪 store
 *
 * 数据来源：
 *   - 后端 (RefreshAllTokens / RefreshAllQuotas)：通过 1s 轮询 APIInfo.getTasks()
 *   - 前端 (ImportModal / Cleanup)：本地 startLocal / updateLocal / finishLocal
 *
 * 合并规则：local + server，按 startedAt 倒序
 *
 * 不做的：
 *   - 取消/暂停（后端语义复杂）
 *   - 持久化（重启即失，对短任务来说够用）
 */
import { create } from "zustand";
import { APIInfo } from "../api/wails";
import type { main } from "../../wailsjs/go/models";

export type TaskKind =
  | "refresh_tokens"
  | "refresh_quotas"
  | "import"
  | "cleanup"
  | "performance_fix";

export type TaskItemStatus = "pending" | "ok" | "failed";

export interface TaskItem {
  name: string;
  status: TaskItemStatus;
  detail: string;
}

export interface Task {
  id: string;
  kind: TaskKind | string;
  title: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  items: TaskItem[];
  startedAt: string;
  finishedAt?: string;
  running: boolean;
  /** 是否本地任务（前端追踪），仅前端可见的字段 */
  isLocal?: boolean;
}

interface TaskState {
  /** 服务端拉来的任务（refresh_*） */
  serverTasks: Task[];
  /** 前端本地的任务（import / cleanup / performance_fix） */
  localTasks: Task[];

  /** 最近一次 fetch 是否成功 */
  hasFetched: boolean;

  /** Drawer 是否展开 */
  open: boolean;
  setOpen: (v: boolean) => void;

  /** 由 polling 调度器调用 */
  pollServer: () => Promise<void>;

  /** 启动一条本地任务，返回 taskID */
  startLocal: (cfg: { kind: TaskKind | string; title: string; total: number }) => string;
  /** 更新本地任务（追加 item / 调整 total / 设置 finished） */
  updateLocal: (
    id: string,
    patch: { addItem?: TaskItem; total?: number; running?: boolean },
  ) => void;
  /** 结束本地任务（不再 running） */
  finishLocal: (id: string) => void;

  /** 清空已完成 —— server 走 RPC，local 直接 splice */
  clearFinished: () => Promise<void>;
}

let localSeq = 0;

function fromServerTask(t: main.Task): Task {
  return {
    id: t.id,
    kind: t.kind,
    title: t.title,
    total: t.total,
    completed: t.completed,
    succeeded: t.succeeded,
    failed: t.failed,
    items: (t.items || []).map((it) => ({
      name: it.name,
      status: (it.status as TaskItemStatus) ?? "pending",
      detail: it.detail,
    })),
    startedAt: t.started_at,
    finishedAt: t.finished_at || undefined,
    running: Boolean(t.running),
  };
}

export const useTaskStore = create<TaskState>((set, get) => ({
  serverTasks: [],
  localTasks: [],
  hasFetched: false,
  open: false,
  setOpen: (v) => set({ open: v }),

  pollServer: async () => {
    try {
      const list = await APIInfo.getTasks();
      const tasks = (list || []).map(fromServerTask);
      set({ serverTasks: tasks, hasFetched: true });
    } catch (e) {
      console.error("getTasks error:", e);
    }
  },

  startLocal: (cfg) => {
    const id = `local-${++localSeq}-${Date.now()}`;
    const now = new Date().toISOString();
    const t: Task = {
      id,
      kind: cfg.kind,
      title: cfg.title,
      total: cfg.total,
      completed: 0,
      succeeded: 0,
      failed: 0,
      items: [],
      startedAt: now,
      running: true,
      isLocal: true,
    };
    set((s) => ({ localTasks: [...s.localTasks, t] }));
    return id;
  },

  updateLocal: (id, patch) => {
    set((s) => ({
      localTasks: s.localTasks.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t };
        if (patch.total != null) next.total = patch.total;
        if (patch.addItem) {
          next.items = [...t.items, patch.addItem];
          next.completed = t.completed + 1;
          if (patch.addItem.status === "ok") next.succeeded = t.succeeded + 1;
          if (patch.addItem.status === "failed") next.failed = t.failed + 1;
        }
        if (patch.running != null) next.running = patch.running;
        if (next.completed >= next.total) {
          next.running = false;
          if (!next.finishedAt) next.finishedAt = new Date().toISOString();
        }
        return next;
      }),
    }));
  },

  finishLocal: (id) => {
    set((s) => ({
      localTasks: s.localTasks.map((t) => {
        if (t.id !== id) return t;
        if (!t.running) return t;
        return {
          ...t,
          running: false,
          total: Math.max(t.total, t.completed),
          finishedAt: t.finishedAt ?? new Date().toISOString(),
        };
      }),
    }));
  },

  clearFinished: async () => {
    set((s) => ({
      localTasks: s.localTasks.filter((t) => t.running),
    }));
    try {
      await APIInfo.clearFinishedTasks();
      await get().pollServer();
    } catch (e) {
      console.error("clearFinishedTasks error:", e);
    }
  },
}));

/** 合并 server + local，按 startedAt 倒序 */
export function useMergedTasks(): Task[] {
  return useTaskStore((s) => {
    const merged = [...s.serverTasks, ...s.localTasks];
    return merged.sort((a, b) => {
      const ta = Date.parse(a.startedAt) || 0;
      const tb = Date.parse(b.startedAt) || 0;
      return tb - ta;
    });
  });
}

/** 当前是否有运行中的任务（Header 红点用） */
export function useHasRunningTask(): boolean {
  return useTaskStore(
    (s) =>
      s.serverTasks.some((t) => t.running) ||
      s.localTasks.some((t) => t.running),
  );
}

/** 启动 polling —— 在 App 顶层调一次。运行中任务 1.5s 频率，无任务时降到 5s */
export function startTaskPolling(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      // 页面不可见时拉长间隔
      timer = setTimeout(tick, 8000);
      return;
    }
    await useTaskStore.getState().pollServer();
    const hasRunning = useTaskStore
      .getState()
      .serverTasks.some((t) => t.running);
    timer = setTimeout(tick, hasRunning ? 1500 : 5000);
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
