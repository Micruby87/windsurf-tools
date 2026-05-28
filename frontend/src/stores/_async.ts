/**
 * createAsyncResource — 把 4 个 store 共享的 `in-flight + TTL + force 跳过 +
 * blocking/refreshing 双态 loading` 模板抽成一个工具，避免每个 store 都重复 25
 * 行同样的样板逻辑。
 *
 * 设计要点：
 * 1. **force=true 不复用 in-flight**：用户显式刷新 / 切号 / 启停后必须拿最新
 *    快照，旧 in-flight 返回的旧数据要丢掉。所有 store 已统一这一语义。
 * 2. **blocking vs refreshing 双态**：首次加载 = blocking（占位骨架），有数据
 *    后再次刷新 = refreshing（不阻塞 UI）。
 * 3. **不耦合 store 形状**：只接受回调，调用方决定怎么 set / get / apply，
 *    Zustand / React state / 普通对象都能用。
 * 4. **yieldBeforeApply**：大列表回填前让出一帧，给 useAccountStore 用。
 *
 * 不变量：fetch / ensureLoaded 永远不抛错。错误统一进 onError 由调用方处理。
 */
export interface AsyncResource {
  /** 触发 fetch；force=true 时不复用 in-flight、不看 TTL。 */
  fetch: (force?: boolean) => Promise<void>;
  /** 已有新鲜数据则跳过；否则触发非 force fetch。 */
  ensureLoaded: (maxAgeMs?: number) => Promise<void>;
}

export interface AsyncResourceOptions<T> {
  /** 距上次成功 fetch 不超过此毫秒则跳过非 force 调用。 */
  ttlMs: number;
  /** 实际请求函数。 */
  fetcher: () => Promise<T>;
  /** 数据回填到 store，由调用方决定怎么 set。 */
  apply: (data: T) => void;
  /** 出错时回调；不抛错。若需要写 fallback 数据请在这里 set。 */
  onError?: (err: unknown) => void;
  /** 是否已经有可用数据（hasLoadedOnce && data != null）。用于 TTL 跳过判断。 */
  isHydrated: () => boolean;
  /** fetch 完成后标记 hasLoadedOnce=true。 */
  setHydrated: () => void;
  /** true → 用 isLoading（阻塞骨架）；false → 用 isRefreshing（静默刷新）。 */
  shouldBlock: () => boolean;
  setLoading: (next: boolean) => void;
  setRefreshing: (next: boolean) => void;
  /** 大数据回填前让出一帧主线程，减轻 UI 卡顿。 */
  yieldBeforeApply?: boolean;
  /** ensureLoaded 默认 maxAge。 */
  defaultEnsureAgeMs?: number;
}

export function createAsyncResource<T>(
  opts: AsyncResourceOptions<T>,
): AsyncResource {
  let inFlight: Promise<void> | null = null;
  let lastFetchedAt = 0;

  const fetch = async (force = false): Promise<void> => {
    // force=true 必须跳过 in-flight：旧请求可能基于旧上下文（例如切号前的列表）
    if (inFlight && !force) {
      return inFlight;
    }
    if (!force && opts.isHydrated() && Date.now() - lastFetchedAt < opts.ttlMs) {
      return;
    }
    const blocking = opts.shouldBlock();
    if (blocking) opts.setLoading(true);
    else opts.setRefreshing(true);

    inFlight = (async () => {
      try {
        const data = await opts.fetcher();
        if (opts.yieldBeforeApply) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
        }
        opts.apply(data);
      } catch (err) {
        opts.onError?.(err);
      } finally {
        lastFetchedAt = Date.now();
        opts.setHydrated();
        if (blocking) opts.setLoading(false);
        else opts.setRefreshing(false);
        inFlight = null;
      }
    })();
    return inFlight;
  };

  const ensureLoaded = async (maxAgeMs?: number): Promise<void> => {
    const ttl = maxAgeMs ?? opts.defaultEnsureAgeMs ?? 20_000;
    if (opts.isHydrated() && Date.now() - lastFetchedAt < ttl) return;
    return fetch();
  };

  return { fetch, ensureLoaded };
}
