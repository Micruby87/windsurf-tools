import { useEffect, useRef, useState } from "react";

/**
 * 3.4: MITM recent_events 持久化 + tone 筛选支撑 hook。
 *
 * 后端只返回 ~5-8 条最近事件，进程重启就丢。这里把每次 status 拉到的事件合并到
 * localStorage（最多 200 条），按 (at, message, tone) 去重；前端可显示完整历史。
 */

export interface MitmEvent {
  at?: string;
  message?: string;
  tone?: string;
}

const STORAGE_KEY = "wt-mitm-events-v1";
const MAX_EVENTS = 200;

const eventKey = (e: MitmEvent) =>
  `${e.at ?? ""}::${e.message ?? ""}::${e.tone ?? ""}`;

const loadFromStorage = (): MitmEvent[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_EVENTS);
  } catch {
    return [];
  }
};

const saveToStorage = (events: MitmEvent[]) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_EVENTS)),
    );
  } catch {
    /* ignore */
  }
};

/**
 * 给定后端最近事件数组，返回合并去重后的全量历史（按时间倒序展示用调用方自行翻转）。
 *
 * @param rawEvents 后端返回的最近事件（通常 5-8 条）
 */
export function usePersistentMitmEvents(rawEvents: MitmEvent[]): {
  events: MitmEvent[];
  clear: () => void;
} {
  const [events, setEvents] = useState<MitmEvent[]>(() => loadFromStorage());
  const seenRef = useRef<Set<string>>(new Set());

  // 初始化已知 keys
  useEffect(() => {
    seenRef.current = new Set(events.map(eventKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每次 raw 变化合并新事件
  useEffect(() => {
    if (!rawEvents || rawEvents.length === 0) return;
    const seen = seenRef.current;
    const fresh: MitmEvent[] = [];
    for (const e of rawEvents) {
      const k = eventKey(e);
      if (!seen.has(k)) {
        seen.add(k);
        fresh.push(e);
      }
    }
    if (fresh.length === 0) return;
    setEvents((prev) => {
      const merged = [...prev, ...fresh].slice(-MAX_EVENTS);
      saveToStorage(merged);
      return merged;
    });
  }, [rawEvents]);

  const clear = () => {
    seenRef.current = new Set();
    saveToStorage([]);
    setEvents([]);
  };

  return { events, clear };
}
