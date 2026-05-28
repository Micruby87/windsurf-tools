/**
 * D-C: MITM 号池准入状态推断
 *
 * 把后端「accountEligibleForUsage + plan filter」的判定逻辑前置到前端，
 * 让账号卡片能在第一时间告诉用户「这个号为什么没进号池」+「怎么补救」。
 *
 * 判定优先级（先击中先返回）：
 * 1. no_api_key        缺 Windsurf API Key → 没法走 MITM
 * 2. account_expired   subscription/status 显示过期或禁用
 * 3. plan_filtered     plan tone 不在 settings.auto_switch_plan_filter 内
 * 4. quota_exhausted   额度耗尽（且非 SmartFriend bypass）
 * 5. in_pool           真正在号池里（pool_status 里能找到 / 或 future-ready）
 *
 * 注意：判定 in_pool 时**不**依赖 pool_status 必须命中 ——
 * 后端有时刚刷新但前端还没拉到，此时只要 (1)(2)(3)(4) 都不命中就视为「应在池中」。
 */
import { models, services } from "../../wailsjs/go/models";
import { getPlanTone, isQuotaDepleted, isWeeklyQuotaBlocked } from "./account";
import {
  normalizeSwitchPlanFilter,
  type SwitchPlanTone,
} from "./settingsModel";

export type MitmPoolReason =
  | "in_pool"
  | "no_api_key"
  | "account_expired"
  | "plan_filtered"
  | "quota_exhausted";

export interface MitmPoolStatus {
  /** true 表示账号应当在号池中（可用于切号） */
  inPool: boolean;
  reason: MitmPoolReason;
  /** 卡片 tooltip / toast 上显示的简短中文原因 */
  detail: string;
  /** 建议的下一步操作文案（用于 toast action 或卡片悬浮提示） */
  suggestion: string;
  /** 建议动作的类型，便于上层挂接具体回调 */
  suggestionKind:
    | "none"
    | "import_api_key"
    | "remove_account"
    | "adjust_plan_filter"
    | "refresh_quota";
  /** plan_filtered 场景下，本号实际的 tone（便于一键追加到 filter） */
  accountTone?: SwitchPlanTone;
}

interface ComputeOptions {
  /** F7/SmartFriend 旁路时跳过额度判定（与 Accounts 卡片 state chip 一致） */
  smartFriendActive?: boolean;
  mitmStatus?: services.MitmProxyStatus | null;
}

/** 拆 filter 字符串为 tone Set；"all" 返回 null 表示「不限制」 */
export function parsePlanFilterTones(
  filter: string | undefined | null,
): Set<SwitchPlanTone> | null {
  const n = normalizeSwitchPlanFilter(filter ?? "all");
  if (n === "all") return null;
  return new Set(n.split(",") as SwitchPlanTone[]);
}

function isAccountExpired(acc: models.Account): boolean {
  const status = String(acc.status || "").toLowerCase();
  if (status === "disabled" || status === "expired") return true;
  if (!acc.subscription_expires_at) return false;
  const ts = Date.parse(acc.subscription_expires_at);
  return Number.isFinite(ts) && ts < Date.now();
}

function isInPoolStatus(
  acc: models.Account,
  mitmStatus?: services.MitmProxyStatus | null,
): boolean {
  if (!mitmStatus?.pool_status?.length) return false;
  const email = String(acc.email || "")
    .trim()
    .toLowerCase();
  const apiKey = String(acc.windsurf_api_key || "").trim();
  for (const item of mitmStatus.pool_status) {
    const itemEmail = String(item.email || "")
      .trim()
      .toLowerCase();
    if (email && itemEmail && email === itemEmail) return true;
    const shortKey = String(item.key_short || "").trim();
    if (apiKey && shortKey && apiKey.includes(shortKey)) return true;
  }
  return false;
}

export function computeMitmPoolStatus(
  acc: models.Account,
  filter: string | undefined | null,
  options: ComputeOptions = {},
): MitmPoolStatus {
  const hasApiKey = Boolean(String(acc.windsurf_api_key || "").trim());
  if (!hasApiKey) {
    return {
      inPool: false,
      reason: "no_api_key",
      detail: "未进号池：缺 Windsurf API Key",
      suggestion: "去导入或补全 API Key",
      suggestionKind: "import_api_key",
    };
  }

  if (isAccountExpired(acc)) {
    return {
      inPool: false,
      reason: "account_expired",
      detail: "未进号池：账号已过期 / 被禁用",
      suggestion: "建议移除或重新激活",
      suggestionKind: "remove_account",
    };
  }

  const tones = parsePlanFilterTones(filter);
  const tone = getPlanTone(acc.plan_name) as SwitchPlanTone;
  if (tones && !tones.has(tone)) {
    const toneLabel = tone === "unknown" ? "未识别" : tone;
    return {
      inPool: false,
      reason: "plan_filtered",
      detail: `未进号池：本号是 ${toneLabel}，不在准入计划内`,
      suggestion: `+ 准入 ${toneLabel}`,
      suggestionKind: "adjust_plan_filter",
      accountTone: tone,
    };
  }

  // 额度耗尽（非 F7 旁路场景）
  if (!options.smartFriendActive) {
    if (isWeeklyQuotaBlocked(acc) || isQuotaDepleted(acc)) {
      return {
        inPool: false,
        reason: "quota_exhausted",
        detail: "未进号池：本号额度已耗尽",
        suggestion: "刷新额度 / 等待重置",
        suggestionKind: "refresh_quota",
      };
    }
  }

  // 三阶段判定都不命中 → 视为应在号池
  const matchedInPool = isInPoolStatus(acc, options.mitmStatus);
  return {
    inPool: true,
    reason: "in_pool",
    detail: matchedInPool ? "在号池中 · 可参与轮换" : "应在号池中 · 等待后端同步",
    suggestion: "",
    suggestionKind: "none",
  };
}
