<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  AlertCircle,
  CheckCircle2,
  Layers,
  Pencil,
  Plus,
  Power,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-vue-next";
import {
  useProviderAccountStore,
  type ProviderAccountModel,
} from "../stores/useAccountStore";
import ImportModal from "../components/accounts/ImportModal.vue";
import {
  PROVIDER_DISPLAY_ORDER,
  PROVIDER_META,
  type ProviderID,
  type ProviderMeta,
} from "../utils/provider";
import { formatDateTimeAsiaShanghai } from "../utils/datetimeAsia";
import { showToast } from "../utils/toast";

// Providers 视图只展示通过「批量导入提供商」入库的 ProviderAccount，
// 与 Windsurf 号池(useAccountStore.accounts)物理隔离 —— 不复用 sk-* 前缀
// 误识别号池账号的旧逻辑(那是 detectProviderFromAccount 留给 Phase 0 的兜底)。
const providerStore = useProviderAccountStore();

const searchQuery = ref("");
const activeTab = ref<"all" | "unknown" | ProviderID>("all");
const showImportModal = ref(false);

// 行内编辑：一次只允许一行进入编辑态
const editingId = ref<string | null>(null);
const editDraft = ref<{ nickname: string; remark: string; status: string }>({
  nickname: "",
  remark: "",
  status: "active",
});
const savingId = ref<string | null>(null);
const deletingId = ref<string | null>(null);
const refreshingModelsId = ref<string | null>(null);

onMounted(() => {
  void providerStore.ensureAccountsLoaded();
});

// ── 提供商分组统计 ──
interface ProviderStat {
  meta: ProviderMeta;
  total: number;
  active: number;
}

const providerStats = computed<ProviderStat[]>(() => {
  const map = new Map<ProviderID, ProviderStat>();
  for (const id of PROVIDER_DISPLAY_ORDER) {
    map.set(id, { meta: PROVIDER_META[id], total: 0, active: 0 });
  }
  for (const acc of providerStore.accounts) {
    const id = normalizeProviderID(acc.provider);
    if (!id) continue;
    const s = map.get(id);
    if (!s) continue;
    s.total++;
    if (acc.status !== "disabled") s.active++;
  }
  return PROVIDER_DISPLAY_ORDER.map((id) => map.get(id)!);
});

const unknownStat = computed(() => {
  let total = 0;
  let active = 0;
  for (const acc of providerStore.accounts) {
    if (normalizeProviderID(acc.provider) !== null) continue;
    total++;
    if (acc.status !== "disabled") active++;
  }
  return { total, active };
});

const totalAvailable = computed(
  () =>
    providerStats.value.reduce((s, b) => s + b.active, 0) +
    unknownStat.value.active,
);
const totalAccounts = computed(() => providerStore.accounts.length);

const tabsList = computed(() => {
  const tabs = providerStats.value.map((s) => ({
    key: s.meta.id as "all" | "unknown" | ProviderID,
    label: s.meta.label,
    badge: `${s.active}/${s.total}`,
  }));
  const list: Array<{
    key: "all" | "unknown" | ProviderID;
    label: string;
    badge: string;
  }> = [
    { key: "all", label: "全部", badge: `${totalAvailable.value}/${totalAccounts.value}` },
    ...tabs,
  ];
  if (unknownStat.value.total > 0) {
    list.push({
      key: "unknown",
      label: "未识别",
      badge: `${unknownStat.value.active}/${unknownStat.value.total}`,
    });
  }
  return list;
});

const filteredAccounts = computed<ProviderAccountModel[]>(() => {
  let list = providerStore.accounts;
  if (activeTab.value === "unknown") {
    list = list.filter((a) => normalizeProviderID(a.provider) === null);
  } else if (activeTab.value !== "all") {
    list = list.filter(
      (a) => normalizeProviderID(a.provider) === activeTab.value,
    );
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (a) =>
      (a.provider || "").toLowerCase().includes(q) ||
      (a.nickname || "").toLowerCase().includes(q) ||
      (a.remark || "").toLowerCase().includes(q) ||
      (a.base_url || "").toLowerCase().includes(q) ||
      (a.auth_token || "").toLowerCase().includes(q),
  );
});

function normalizeProviderID(p: string | undefined): ProviderID | null {
  const v = String(p || "").trim().toLowerCase();
  if (!v) return null;
  return (PROVIDER_DISPLAY_ORDER as string[]).includes(v)
    ? (v as ProviderID)
    : null;
}

// 缺省卡片元信息：未识别 provider
const UNKNOWN_PROVIDER_META: ProviderMeta = {
  id: "openai" as ProviderID,
  label: "未识别",
  tagline: "未在已知提供商名单内",
  host: "—",
  credentialKinds: [],
  accent: "from-slate-400 via-slate-300 to-slate-200",
  badge: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  initials: "??",
  envHint: {
    baseUrl: "",
    token: "",
    exampleBaseUrl: "",
    exampleToken: "",
  },
};

const getProviderMeta = (acc: ProviderAccountModel): ProviderMeta => {
  const id = normalizeProviderID(acc.provider);
  return id ? PROVIDER_META[id] : UNKNOWN_PROVIDER_META;
};

const truncateMiddle = (v: string, head = 12, tail = 6) => {
  const s = String(v || "").trim();
  if (s.length <= head + tail + 1) return s;
  return s.slice(0, head) + "…" + s.slice(-tail);
};

const getDisplayName = (acc: ProviderAccountModel) => {
  const nick = String(acc.nickname || "").trim();
  if (nick) return nick;
  const meta = getProviderMeta(acc);
  return `${meta.label} 账号`;
};

// ── 编辑 ──
const startEdit = (acc: ProviderAccountModel) => {
  editingId.value = acc.id;
  editDraft.value = {
    nickname: acc.nickname ?? "",
    remark: acc.remark ?? "",
    status: acc.status || "active",
  };
};

const cancelEdit = () => {
  editingId.value = null;
};

const saveEdit = async (acc: ProviderAccountModel) => {
  if (savingId.value) return;
  savingId.value = acc.id;
  try {
    const next: ProviderAccountModel = {
      ...acc,
      nickname: editDraft.value.nickname.trim(),
      remark: editDraft.value.remark.trim(),
      status: editDraft.value.status || "active",
    };
    await providerStore.updateAccount(next);
    editingId.value = null;
    showToast("已保存", "success");
  } catch (e: unknown) {
    showToast(`保存失败: ${String(e)}`, "error");
  } finally {
    savingId.value = null;
  }
};

const toggleStatus = async (acc: ProviderAccountModel) => {
  if (savingId.value) return;
  savingId.value = acc.id;
  try {
    const next: ProviderAccountModel = {
      ...acc,
      status: acc.status === "disabled" ? "active" : "disabled",
    };
    await providerStore.updateAccount(next);
    showToast(
      next.status === "disabled" ? "已禁用" : "已启用",
      "success",
    );
  } catch (e: unknown) {
    showToast(`切换状态失败: ${String(e)}`, "error");
  } finally {
    savingId.value = null;
  }
};

// ── 删除 ──
const handleDelete = async (acc: ProviderAccountModel) => {
  if (deletingId.value) return;
  const ok = window.confirm(
    `确定删除「${getDisplayName(acc)}」吗?此操作不可撤销。`,
  );
  if (!ok) return;
  deletingId.value = acc.id;
  try {
    await providerStore.deleteAccount(acc.id);
    showToast("已删除", "success");
  } catch (e: unknown) {
    showToast(`删除失败: ${String(e)}`, "error");
  } finally {
    deletingId.value = null;
  }
};

const handleRefresh = async () => {
  try {
    await providerStore.fetchAccounts(true);
  } catch (e: unknown) {
    showToast(`刷新失败: ${String(e)}`, "error");
  }
};

// 阶段 2: 卡片 active 开关 / active model 下拉 / 拉模型列表
const toggleActivated = async (acc: ProviderAccountModel) => {
  if (savingId.value) return;
  savingId.value = acc.id;
  try {
    const next: ProviderAccountModel = {
      ...acc,
      activated: !acc.activated,
    };
    await providerStore.updateAccount(next);
    showToast(next.activated ? "已激活" : "已取消激活", "success");
  } catch (e: unknown) {
    showToast(`切换激活态失败: ${String(e)}`, "error");
  } finally {
    savingId.value = null;
  }
};

const setActiveModel = async (acc: ProviderAccountModel, model: string) => {
  if (savingId.value) return;
  if ((acc.active_model || "") === model) return;
  savingId.value = acc.id;
  try {
    const next: ProviderAccountModel = {
      ...acc,
      active_model: model,
    };
    await providerStore.updateAccount(next);
  } catch (e: unknown) {
    showToast(`设置 active_model 失败: ${String(e)}`, "error");
  } finally {
    savingId.value = null;
  }
};

const refreshModels = async (acc: ProviderAccountModel) => {
  if (refreshingModelsId.value) return;
  refreshingModelsId.value = acc.id;
  try {
    await providerStore.refreshModels(acc.id);
    showToast("model 列表已更新", "success");
  } catch (e: unknown) {
    showToast(`拉 model 列表失败: ${String(e)}`, "error");
  } finally {
    refreshingModelsId.value = null;
  }
};
</script>

<template>
  <div class="flex h-full flex-col gap-5 overflow-y-auto p-5">
    <!-- 顶部标题区 -->
    <header
      class="rounded-[28px] border border-black/[0.06] bg-white/80 p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/[0.06] dark:bg-black/30"
    >
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-violet-500 via-fuchsia-400 to-rose-300 text-white shadow-[0_14px_30px_rgba(168,85,247,0.25)]"
          >
            <Layers class="h-6 w-6" stroke-width="2.4" />
          </div>
          <div>
            <h1
              class="text-[22px] font-extrabold tracking-tight text-ios-text dark:text-ios-textDark"
            >
              提供商
            </h1>
            <p
              class="text-[12px] text-ios-textSecondary dark:text-ios-textSecondaryDark"
            >
              第三方 LLM 账号池(OpenAI / Anthropic / Google / DeepSeek …) — 与
              Windsurf 号池物理隔离
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="ios-btn flex h-9 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-3 text-[12px] font-bold text-ios-text shadow-sm dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-ios-textDark"
            :disabled="providerStore.isLoading || providerStore.isRefreshing"
            @click="handleRefresh"
          >
            <span>{{ providerStore.isRefreshing ? "刷新中…" : "刷新" }}</span>
          </button>
          <button
            type="button"
            class="ios-btn flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-b from-[#3b82f6] to-ios-blue px-3 text-[12px] font-bold text-white shadow-md shadow-ios-blue/25"
            @click="showImportModal = true"
          >
            <Plus class="h-3.5 w-3.5" stroke-width="2.6" />
            <span>批量导入</span>
          </button>
        </div>
      </div>

      <!-- 搜索 + tab 条 -->
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <div
          class="relative flex h-9 min-w-[220px] flex-1 items-center rounded-full border border-black/[0.06] bg-white/80 px-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]"
        >
          <Search
            class="h-4 w-4 text-ios-textSecondary dark:text-ios-textSecondaryDark"
            stroke-width="2.4"
          />
          <input
            v-model="searchQuery"
            class="ml-2 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ios-textSecondary/70 dark:placeholder:text-ios-textSecondaryDark/70"
            placeholder="搜索 nickname / remark / base_url / token …"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="ios-btn rounded-full p-1 hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
            @click="searchQuery = ''"
          >
            <X class="h-3.5 w-3.5" stroke-width="2.4" />
          </button>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <button
          v-for="tab in tabsList"
          :key="tab.key"
          type="button"
          class="ios-btn flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all"
          :class="
            activeTab === tab.key
              ? 'border-ios-blue/40 bg-ios-blue/[0.12] text-ios-blue'
              : 'border-black/[0.06] bg-white/70 text-ios-textSecondary hover:text-ios-text dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-ios-textSecondaryDark dark:hover:text-ios-textDark'
          "
          @click="activeTab = tab.key"
        >
          <span>{{ tab.label }}</span>
          <span
            class="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-black tabular-nums text-ios-textSecondary dark:bg-white/[0.1] dark:text-ios-textSecondaryDark"
          >
            {{ tab.badge }}
          </span>
        </button>
      </div>
    </header>

    <!-- 账号列表 -->
    <div v-if="filteredAccounts.length" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="acc in filteredAccounts"
        :key="acc.id"
        class="group relative flex flex-col gap-3 rounded-[24px] border bg-white/80 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all dark:bg-black/25"
        :class="
          acc.activated
            ? 'border-violet-500/40 ring-2 ring-violet-500/30 ring-offset-1 ring-offset-white dark:ring-offset-black/40'
            : 'border-black/[0.06] hover:border-ios-blue/30 dark:border-white/[0.06]'
        "
      >
        <!-- 当前激活角标 (右上角浮动) -->
        <span
          v-if="acc.activated"
          class="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-b from-violet-500 to-fuchsia-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-md shadow-violet-500/40"
        >
          ★ 当前
        </span>
        <!-- 头部:provider 徽章 + 状态 -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br text-[13px] font-extrabold text-white shadow-md"
              :class="getProviderMeta(acc).accent"
            >
              {{ getProviderMeta(acc).initials }}
            </div>
            <div class="min-w-0">
              <div
                class="truncate text-[14px] font-extrabold text-ios-text dark:text-ios-textDark"
                :title="getDisplayName(acc)"
              >
                {{ getDisplayName(acc) }}
              </div>
              <div class="flex items-center gap-1.5">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
                  :class="getProviderMeta(acc).badge"
                >
                  {{ getProviderMeta(acc).label }}
                </span>
                <span
                  class="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark"
                >
                  {{ formatDateTimeAsiaShanghai(acc.created_at) }}
                </span>
              </div>
            </div>
          </div>
          <span
            class="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
            :class="
              acc.status === 'disabled'
                ? 'border-rose-500/15 bg-rose-500/[0.08] text-rose-700 dark:text-rose-300'
                : 'border-emerald-500/15 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300'
            "
          >
            <CheckCircle2
              v-if="acc.status !== 'disabled'"
              class="h-3 w-3"
              stroke-width="2.6"
            />
            <AlertCircle v-else class="h-3 w-3" stroke-width="2.6" />
            {{ acc.status === "disabled" ? "已禁用" : "可用" }}
          </span>
        </div>

        <!-- 凭证摘要(展示态) -->
        <div v-if="editingId !== acc.id" class="space-y-1.5">
          <div class="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
            <span class="font-bold uppercase tracking-[0.16em]">Base URL</span>
            <code
              class="mt-0.5 block break-all rounded-md bg-black/[0.04] px-2 py-1 font-mono text-[11px] text-ios-text dark:bg-white/[0.06] dark:text-ios-textDark"
            >
              {{ acc.base_url || "—" }}
            </code>
          </div>
          <div class="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
            <span class="font-bold uppercase tracking-[0.16em]">Token</span>
            <code
              class="mt-0.5 block truncate rounded-md bg-black/[0.04] px-2 py-1 font-mono text-[11px] text-ios-text dark:bg-white/[0.06] dark:text-ios-textDark"
              :title="acc.auth_token"
            >
              {{ truncateMiddle(acc.auth_token, 14, 6) }}
            </code>
          </div>
          <div
            v-if="acc.remark"
            class="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark"
            :title="acc.remark"
          >
            <span class="font-bold uppercase tracking-[0.16em]">Remark</span>
            <span class="ml-1 line-clamp-2">{{ acc.remark }}</span>
          </div>

          <!-- 阶段 2: 路由调度区(激活开关 + active_model 下拉) -->
          <div
            class="rounded-[14px] border border-dashed border-violet-500/20 bg-violet-500/[0.04] px-3 py-2.5 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <span
                class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-ios-textSecondary dark:text-ios-textSecondaryDark"
              >
                <Power class="h-3 w-3" stroke-width="2.6" />
                提供商接管
              </span>
              <button
                type="button"
                class="ios-btn flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold transition-all"
                :class="
                  acc.activated
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-black/[0.06] text-ios-textSecondary dark:bg-white/[0.08] dark:text-ios-textSecondaryDark'
                "
                :disabled="savingId === acc.id"
                @click="toggleActivated(acc)"
              >
                {{ acc.activated ? "已激活" : "未激活" }}
              </button>
            </div>
            <div class="flex items-center gap-1.5">
              <select
                :value="acc.active_model || ''"
                class="flex-1 min-w-0 rounded-[10px] border border-black/[0.08] bg-white px-2 py-1.5 text-[11px] font-mono outline-none focus:border-ios-blue/60 dark:border-white/[0.08] dark:bg-white/[0.06] disabled:opacity-50"
                :disabled="
                  savingId === acc.id ||
                  !(acc.models && acc.models.length)
                "
                @change="
                  setActiveModel(
                    acc,
                    ($event.target as HTMLSelectElement).value,
                  )
                "
              >
                <option value="" disabled>
                  {{
                    acc.models && acc.models.length
                      ? "选择 active model"
                      : "未发现 model — 点右侧刷新"
                  }}
                </option>
                <option
                  v-for="m in acc.models || []"
                  :key="m"
                  :value="m"
                >
                  {{ m }}
                </option>
              </select>
              <button
                type="button"
                class="ios-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border border-black/[0.06] bg-white/80 text-ios-textSecondary hover:text-ios-blue dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-ios-textSecondaryDark dark:hover:text-ios-blue disabled:opacity-50"
                :disabled="refreshingModelsId === acc.id"
                title="重新拉取 /v1/models"
                @click="refreshModels(acc)"
              >
                <RefreshCcw
                  class="h-3 w-3"
                  :class="refreshingModelsId === acc.id ? 'animate-spin' : ''"
                  stroke-width="2.6"
                />
              </button>
            </div>
            <div
              v-if="acc.models_error"
              class="text-[10px] text-rose-700 dark:text-rose-300 line-clamp-2"
              :title="acc.models_error"
            >
              ↳ {{ acc.models_error }}
            </div>
            <div
              v-else-if="acc.models_refreshed_at"
              class="text-[10px] text-ios-textSecondary dark:text-ios-textSecondaryDark"
            >
              ↳ {{ (acc.models || []).length }} 个 model · 最近
              {{ formatDateTimeAsiaShanghai(acc.models_refreshed_at) }}
            </div>
          </div>
        </div>

        <!-- 编辑态 -->
        <div v-else class="space-y-2">
          <label class="block">
            <span
              class="block text-[10px] font-bold uppercase tracking-[0.16em] text-ios-textSecondary dark:text-ios-textSecondaryDark"
            >
              Nickname
            </span>
            <input
              v-model="editDraft.nickname"
              class="mt-1 w-full rounded-[10px] border border-black/[0.08] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-ios-blue/60 dark:border-white/[0.08] dark:bg-white/[0.06]"
              placeholder="（可选）"
            />
          </label>
          <label class="block">
            <span
              class="block text-[10px] font-bold uppercase tracking-[0.16em] text-ios-textSecondary dark:text-ios-textSecondaryDark"
            >
              Remark
            </span>
            <input
              v-model="editDraft.remark"
              class="mt-1 w-full rounded-[10px] border border-black/[0.08] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-ios-blue/60 dark:border-white/[0.08] dark:bg-white/[0.06]"
              placeholder="（可选）"
            />
          </label>
          <label class="block">
            <span
              class="block text-[10px] font-bold uppercase tracking-[0.16em] text-ios-textSecondary dark:text-ios-textSecondaryDark"
            >
              Status
            </span>
            <select
              v-model="editDraft.status"
              class="mt-1 w-full rounded-[10px] border border-black/[0.08] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-ios-blue/60 dark:border-white/[0.08] dark:bg-white/[0.06]"
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </label>
        </div>

        <!-- 操作区 -->
        <div class="mt-auto flex flex-wrap items-center justify-end gap-1.5">
          <template v-if="editingId === acc.id">
            <button
              type="button"
              class="ios-btn flex h-8 items-center gap-1 rounded-full border border-black/[0.06] bg-white/70 px-3 text-[11px] font-bold text-ios-textSecondary hover:text-ios-text dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-ios-textSecondaryDark dark:hover:text-ios-textDark"
              :disabled="savingId === acc.id"
              @click="cancelEdit"
            >
              取消
            </button>
            <button
              type="button"
              class="ios-btn flex h-8 items-center gap-1 rounded-full bg-gradient-to-b from-[#3b82f6] to-ios-blue px-3 text-[11px] font-bold text-white shadow-md shadow-ios-blue/25 disabled:opacity-50"
              :disabled="savingId === acc.id"
              @click="saveEdit(acc)"
            >
              <Save class="h-3 w-3" stroke-width="2.6" />
              {{ savingId === acc.id ? "保存中…" : "保存" }}
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="ios-btn flex h-8 items-center gap-1 rounded-full border border-black/[0.06] bg-white/70 px-3 text-[11px] font-bold text-ios-textSecondary hover:text-ios-text dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-ios-textSecondaryDark dark:hover:text-ios-textDark"
              :disabled="savingId === acc.id"
              @click="toggleStatus(acc)"
            >
              {{ acc.status === "disabled" ? "启用" : "禁用" }}
            </button>
            <button
              type="button"
              class="ios-btn flex h-8 items-center gap-1 rounded-full border border-black/[0.06] bg-white/70 px-3 text-[11px] font-bold text-ios-textSecondary hover:text-ios-text dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-ios-textSecondaryDark dark:hover:text-ios-textDark"
              @click="startEdit(acc)"
            >
              <Pencil class="h-3 w-3" stroke-width="2.6" />
              编辑
            </button>
            <button
              type="button"
              class="ios-btn flex h-8 items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/[0.08] px-3 text-[11px] font-bold text-rose-700 hover:bg-rose-500/[0.14] dark:text-rose-300 disabled:opacity-50"
              :disabled="deletingId === acc.id"
              @click="handleDelete(acc)"
            >
              <Trash2 class="h-3 w-3" stroke-width="2.6" />
              {{ deletingId === acc.id ? "删除中…" : "删除" }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div
      v-else
      class="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-black/[0.1] bg-white/60 p-12 text-center dark:border-white/[0.08] dark:bg-black/20"
    >
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-600 dark:text-violet-300"
      >
        <Layers class="h-8 w-8" stroke-width="2.2" />
      </div>
      <div class="space-y-1">
        <h3
          class="text-[15px] font-extrabold text-ios-text dark:text-ios-textDark"
        >
          {{
            providerStore.accounts.length === 0
              ? "还没有任何提供商账号"
              : "当前 tab / 搜索没有结果"
          }}
        </h3>
        <p
          class="text-[12px] text-ios-textSecondary dark:text-ios-textSecondaryDark"
        >
          {{
            providerStore.accounts.length === 0
              ? "点击右上角「批量导入」粘贴 base_url + token,落库即可"
              : "切换其它 tab 或清空搜索关键字"
          }}
        </p>
      </div>
      <button
        v-if="providerStore.accounts.length === 0"
        type="button"
        class="ios-btn flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-b from-[#3b82f6] to-ios-blue px-4 text-[12px] font-bold text-white shadow-md shadow-ios-blue/25"
        @click="showImportModal = true"
      >
        <Plus class="h-3.5 w-3.5" stroke-width="2.6" />
        批量导入提供商账号
      </button>
    </div>

    <ImportModal
      :isOpen="showImportModal"
      :pickProvider="true"
      :defaultProvider="
        activeTab !== 'all' && activeTab !== 'unknown' ? activeTab : null
      "
      @close="showImportModal = false"
    />
  </div>
</template>
