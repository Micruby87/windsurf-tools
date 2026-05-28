import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Network,
  RefreshCcw,
  Shuffle,
  Sparkles,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { APIInfo } from "../api/wails";
import { showErrorToast, showToast } from "../utils/toast";

/**
 * P1: Clash 智能助手卡
 *
 * 把后端早就支持但前端从未暴露的 6 个 Clash API 全部包装成 UI 按钮：
 *
 *  - 一键智能启用：autoSetupClash —— 自动选组 + 启 rotator + 立即切一次
 *  - 自动检测组：autoDetectClashGroup —— 列出 selector 组 + 默认选节点最多的
 *  - 测试连接：testClashController —— 验证 URL / secret 是否能联通
 *  - 列节点：listClashGroupNodes —— 弹 picker 多选 nodes 白名单
 *  - 立即切换：triggerClashRotate —— 不等周期立刻换 IP
 *  - 运行状态：getClashRotatorRunning —— 顶部小红绿点 + 文字
 *
 * 设计取舍：
 *  - 不阻塞 Settings 的自动保存：所有按钮都是 fire-and-forget
 *  - 状态指示 5s 轮询（仅 enabled 时）；不可见页面时停
 *  - 节点 picker 用半屏 overlay 而不是 modal，避免和 Settings 自动保存冲突
 */

interface Props {
  controllerURL: string;
  secret: string;
  group: string;
  /**
   * 父组件回调：自动检测/挑节点/一键启用完成后写回 form。
   * 一键启用后端会动 3 个字段，都需要 patch 回前端避免下次 flushSave 覆盖。
   */
  onPatch: (delta: {
    clash_group?: string;
    clash_nodes?: string;
    clash_rotate_enabled?: boolean;
    clash_rotate_on_rate_limit?: boolean;
  }) => void;
  /**
   * 父组件 flushSave：在调用「自动检测/一键启用」前先刷出待保存表单。
   * 这两个后端 API 不接 url/secret 参数，从 store 读，防​ 500ms 防抖期间用旧值。
   */
  flushSave?: () => Promise<void>;
}

interface ProbeResult {
  ok: boolean;
  error?: string;
  groups?: string[];
}

interface AutoDetectResult {
  ok: boolean;
  error?: string;
  group?: string;
  node_count?: number;
  candidates?: string[];
  all_groups?: string[];
}

interface AutoSetupResult {
  ok: boolean;
  error?: string;
  hint?: string;
  group?: string;
  node_count?: number;
  from?: string;
  to?: string;
}

const POLL_INTERVAL_MS = 5_000;

export default function ClashAssistant({
  controllerURL,
  secret,
  group,
  onPatch,
  flushSave,
}: Props) {
  const [running, setRunning] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<
    "test" | "detect" | "setup" | "rotate" | "list" | null
  >(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [showNodePicker, setShowNodePicker] = useState(false);
  const [nodes, setNodes] = useState<string[]>([]);

  // 5s 轮询运行状态（仅可见时）
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const v = await APIInfo.getClashRotatorRunning();
        setRunning(Boolean(v));
      } catch {
        setRunning(null);
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
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
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
  }, []);

  const handleTest = async () => {
    if (busy) return;
    setBusy("test");
    setProbe(null);
    try {
      const r = (await APIInfo.testClashController(
        controllerURL,
        secret,
      )) as ProbeResult;
      setProbe(r);
      if (r.ok) {
        const n = r.groups?.length ?? 0;
        showToast(
          n > 0
            ? `控制器连通 · ${n} 个可选组 (${r.groups!.slice(0, 3).join(", ")}${n > 3 ? "…" : ""})`
            : "控制器连通，但未发现 selector 组 — Clash 配置里应该有一个 type=selector 的代理组",
          n > 0 ? "success" : "warning",
          n > 0 ? 4000 : 6000,
        );
      } else {
        showToast(`连通失败：${r.error || "未知错误"}`, "error");
      }
    } catch (e) {
      showErrorToast(e, "测试连接失败");
    } finally {
      setBusy(null);
    }
  };

  const handleAutoDetect = async () => {
    if (busy) return;
    setBusy("detect");
    try {
      // 先 flush 待保存表单，避免后端读到旧 URL/secret
      if (flushSave) await flushSave();
      const r = (await APIInfo.autoDetectClashGroup()) as AutoDetectResult;
      if (!r.ok) {
        showToast(`自动检测失败：${r.error || "未知错误"}`, "error");
        return;
      }
      if (r.group) {
        onPatch({ clash_group: r.group });
        showToast(
          `检测到 ${r.group}（${r.node_count ?? "?"} 个节点）${
            r.candidates && r.candidates.length > 1
              ? "\n候选：" + r.candidates.join(", ")
              : ""
          }`,
          "success",
          6000,
        );
      }
    } catch (e) {
      showErrorToast(e, "自动检测失败");
    } finally {
      setBusy(null);
    }
  };

  const handleAutoSetup = async () => {
    if (busy) return;
    setBusy("setup");
    try {
      if (flushSave) await flushSave();
      const r = (await APIInfo.autoSetupClash()) as AutoSetupResult;
      if (!r.ok) {
        showToast(
          `一键启用失败：${r.error || "未知错误"}${r.hint ? `\n${r.hint}` : ""}`,
          "error",
          7000,
        );
        return;
      }
      // 后端 AutoSetup 会同时写回 3 个字段，必须 patch 全部同步 form，
      // 否则下次他处 patch 会拿过期的 false/'' 覆盖后端刚写的 true/group。
      onPatch({
        clash_rotate_enabled: true,
        clash_rotate_on_rate_limit: true,
        ...(r.group ? { clash_group: r.group } : {}),
      });
      const segments: string[] = [`组：${r.group ?? "?"}`];
      if (r.node_count != null) segments.push(`${r.node_count} 节点`);
      if (r.from && r.to) segments.push(`${r.from} → ${r.to}`);
      showToast(`一键启用成功 · ${segments.join(" · ")}`, "success", 6000);
      setRunning(true);
    } catch (e) {
      showErrorToast(e, "一键启用失败");
    } finally {
      setBusy(null);
    }
  };

  const handleRotateNow = async () => {
    if (busy) return;
    setBusy("rotate");
    try {
      const ok = await APIInfo.triggerClashRotate();
      if (ok) showToast("已切到下一节点", "success");
      else showToast("立即切换失败（rotator 未运行？）", "warning");
    } catch (e) {
      showErrorToast(e, "立即切换失败");
    } finally {
      setBusy(null);
    }
  };

  const handleListNodes = async () => {
    if (busy) return;
    if (!group.trim()) {
      showToast("请先填写或自动检测「选择器组」", "warning");
      return;
    }
    setBusy("list");
    try {
      const list = (await APIInfo.listClashGroupNodes(
        controllerURL,
        secret,
        group,
      )) as string[];
      setNodes(list || []);
      setShowNodePicker(true);
    } catch (e) {
      showErrorToast(e, "列节点失败");
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = useMemo(() => {
    if (running === null) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark dark:bg-white/[0.06]">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          未知
        </span>
      );
    }
    if (running) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          运行中
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        已停止
      </span>
    );
  }, [running]);

  return (
    <>
      <div className="px-5 sm:px-6 py-4 border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-[12px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wide">
            智能助手
          </span>
          {statusBadge}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn
            icon={Sparkles}
            label="一键智能启用"
            highlight
            busy={busy === "setup"}
            onClick={handleAutoSetup}
            title="自动检测节点最多的组 + 启动 rotator + 立即切一次"
          />
          <Btn
            icon={Network}
            label="自动检测组"
            busy={busy === "detect"}
            onClick={handleAutoDetect}
            title="列出 selector 组并选节点最多的填进「选择器组」字段"
          />
          <Btn
            icon={RefreshCcw}
            label="测试连接"
            busy={busy === "test"}
            onClick={handleTest}
            title="验证控制器 URL + Secret 是否可联通"
          />
          <Btn
            icon={ChevronDown}
            label="列节点"
            busy={busy === "list"}
            onClick={handleListNodes}
            title="列出当前组里所有节点（用于挑选 nodes 白名单）"
          />
          <Btn
            icon={Shuffle}
            label="立即切换"
            busy={busy === "rotate"}
            onClick={handleRotateNow}
            disabled={running !== true}
            title={
              running !== true
                ? "rotator 未运行；先启用「Clash 轮换」"
                : "不等周期，立刻切到下一节点"
            }
          />
        </div>
        {probe ? (
          <div
            className={[
              "mt-2 px-2 py-1.5 rounded-[10px] text-[11px]",
              probe.ok
                ? "bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300"
                : "bg-rose-500/[0.08] text-rose-700 dark:text-rose-300",
            ].join(" ")}
          >
            {probe.ok ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.6} />
                控制器在线 · {probe.groups?.length ?? 0} 个可选组{
                  probe.groups && probe.groups.length > 0
                    ? `: ${probe.groups.slice(0, 5).join(", ")}${probe.groups.length > 5 ? "…" : ""}`
                    : ""
                }
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <XCircle className="h-3 w-3" strokeWidth={2.6} />
                {probe.error ?? "连接失败"}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {showNodePicker ? (
        <NodePickerOverlay
          group={group}
          nodes={nodes}
          onClose={() => setShowNodePicker(false)}
          onPick={(picked) => {
            onPatch({ clash_nodes: picked.join(",") });
            setShowNodePicker(false);
            showToast(
              picked.length > 0
                ? `已选 ${picked.length} 个节点为白名单`
                : "已清空 nodes 白名单（=允许全部）",
              "success",
            );
          }}
        />
      ) : null}
    </>
  );
}

interface BtnProps {
  icon: typeof Zap;
  label: string;
  highlight?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}

function Btn({ icon: Icon, label, highlight, busy, disabled, onClick, title }: BtnProps) {
  const cls = highlight
    ? "bg-ios-blue text-white hover:bg-ios-blue/90 shadow-sm"
    : "bg-black/[0.04] text-ios-text hover:bg-black/[0.08] dark:bg-white/[0.06] dark:text-ios-textDark dark:hover:bg-white/[0.1]";
  return (
    <button
      type="button"
      className={[
        "no-drag-region inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
        cls,
        disabled || busy ? "opacity-60 cursor-not-allowed" : "",
      ].join(" ")}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.6} />
      ) : (
        <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
      )}
      <span>{label}</span>
    </button>
  );
}

// ── 节点 picker overlay ────────────────────────────────────────────────

function NodePickerOverlay({
  group,
  nodes,
  onClose,
  onPick,
}: {
  group: string;
  nodes: string[];
  onClose: () => void;
  onPick: (picked: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.toLowerCase().includes(q));
  }, [nodes, filter]);
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] max-h-[80vh] flex flex-col rounded-[18px] bg-white dark:bg-[#1C1C1E] shadow-2xl ios-page-enter overflow-hidden">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-ios-text dark:text-ios-textDark truncate">
              选 nodes 白名单 · {group}
            </div>
            <div className="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark mt-0.5">
              共 {nodes.length} 个节点 · 已选 {selected.size}（不选 = 允许全部）
            </div>
          </div>
          <button
            type="button"
            className="no-drag-region h-8 w-8 flex items-center justify-center rounded-full text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </header>
        <div className="px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.08]">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索节点名…"
            className="no-drag-region w-full rounded-[10px] bg-black/[0.04] dark:bg-white/[0.06] px-3 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-ios-blue/30"
          />
        </div>
        <ul className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-ios-textSecondary dark:text-ios-textSecondaryDark text-[12px]">
              {nodes.length === 0 ? "该组没有节点" : "没有匹配的节点"}
            </li>
          ) : (
            filtered.map((n) => {
              const checked = selected.has(n);
              return (
                <li key={n}>
                  <button
                    type="button"
                    className="no-drag-region w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors"
                    onClick={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(n);
                      else next.add(n);
                      setSelected(next);
                    }}
                  >
                    <span
                      className={[
                        "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors",
                        checked
                          ? "bg-ios-blue border-ios-blue"
                          : "border-black/20 dark:border-white/20",
                      ].join(" ")}
                    >
                      {checked ? (
                        <CheckCircle2
                          className="h-3 w-3 text-white"
                          strokeWidth={3}
                        />
                      ) : null}
                    </span>
                    <span className="text-[12.5px] truncate text-ios-text dark:text-ios-textDark">
                      {n}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex gap-2">
            <button
              type="button"
              className="no-drag-region rounded-full px-3 py-1.5 text-[11px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setSelected(new Set(filtered))}
            >
              全选
            </button>
            <button
              type="button"
              className="no-drag-region rounded-full px-3 py-1.5 text-[11px] font-bold text-ios-textSecondary dark:text-ios-textSecondaryDark hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setSelected(new Set())}
            >
              清空
            </button>
          </div>
          <button
            type="button"
            className="no-drag-region rounded-full bg-ios-blue px-4 py-1.5 text-[12px] font-bold text-white hover:bg-ios-blue/90"
            onClick={() => onPick(Array.from(selected))}
          >
            写入
          </button>
        </footer>
      </div>
    </div>
  );
}
