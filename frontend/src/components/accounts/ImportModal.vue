<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { APIInfo } from '../../api/wails'
import { useAccountStore } from '../../stores/useAccountStore'
import { useProviderAccountStore } from '../../stores/useAccountStore'
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Layers,
  Loader2,
  Mail,
  RefreshCcw,
  Shield,
  Sparkles,
  Wand2,
  X,
} from 'lucide-vue-next'
import { groupImportLines, summarizeGrouped, type DetectionSummary } from '../../utils/importAutoDetect'
import { importBatched } from '../../utils/importBatch'
import { showToast } from '../../utils/toast'
import { main } from '../../../wailsjs/go/models'
import {
  PROVIDER_DISPLAY_ORDER,
  PROVIDER_META,
  getImportPlaceholder,
  validateProviderInput,
  type ProviderID,
  type ProviderInputSummary,
} from '../../utils/provider'
import ISelectSheet from '../ios/ISelectSheet.vue'

const props = defineProps<{
  isOpen: boolean
  /** 是否显示「提供商」下拉。Accounts 视图不传(默认 false 走纯混合识别);Providers 视图传 true */
  pickProvider?: boolean
  defaultProvider?: ProviderID | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()
const accountStore = useAccountStore()
const providerStore = useProviderAccountStore()

const inputText = ref('')
const isLoading = ref(false)
const results = ref<main.ImportResult[]>([])
const selectedProvider = ref<ProviderID>(
  props.defaultProvider ?? PROVIDER_DISPLAY_ORDER[0],
)

watch(() => props.isOpen, (open: boolean) => {
  if (open) {
    // 打开时同步外部默认 provider;没传走列表第一项
    selectedProvider.value = props.defaultProvider ?? PROVIDER_DISPLAY_ORDER[0]
  } else {
    // 关闭同时清除输入与结果，避免下次打开看到上次残留
    inputText.value = ''
    results.value = []
  }
})

const activeProviderID = computed<ProviderID | null>(() =>
  props.pickProvider ? selectedProvider.value : null,
)

const placeholder = computed(() => getImportPlaceholder(activeProviderID.value))

const providerOptions = computed(() =>
  PROVIDER_DISPLAY_ORDER.map((id) => ({
    value: id,
    label: PROVIDER_META[id].label,
  })),
)

/** Provider 模式校验结果 */
const providerSummary = computed<ProviderInputSummary | null>(() => {
  if (!props.pickProvider || !activeProviderID.value) return null
  return validateProviderInput(inputText.value, activeProviderID.value)
})

/** 实时检测分类统计(混合模式专用) */
const detectionSummary = computed<DetectionSummary>(() => {
  const lines = inputText.value.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) {
    return { api_key: 0, jwt: 0, refresh_token: 0, password: 0, email_apikey: 0, unknown: 0, total: 0 }
  }
  const grouped = groupImportLines(lines)
  return summarizeGrouped(grouped)
})

const lineCount = computed(() =>
  providerSummary.value
    ? providerSummary.value.validCount
    : detectionSummary.value.total,
)
const unknownCount = computed(() =>
  providerSummary.value
    ? providerSummary.value.invalidCount
    : detectionSummary.value.unknown,
)
const totalInputLines = computed(
  () => inputText.value.split('\n').map(l => l.trim()).filter(Boolean).length,
)
const successCount = computed(() => results.value.filter((r) => r.success).length)
const failureCount = computed(() => results.value.filter((r) => !r.success).length)

const typeLabels: Record<string, { label: string; icon: typeof Mail; color: string }> = {
  api_key: { label: 'API Key', icon: KeyRound, color: 'text-violet-600 dark:text-violet-300' },
  jwt: { label: 'JWT', icon: Shield, color: 'text-amber-600 dark:text-amber-300' },
  password: { label: '邮箱/密码', icon: Mail, color: 'text-ios-blue' },
  refresh_token: { label: 'Refresh Token', icon: RefreshCcw, color: 'text-emerald-600 dark:text-emerald-400' },
  email_apikey: { label: '邮箱/Token', icon: KeyRound, color: 'text-pink-600 dark:text-pink-300' },
}

const activeTypes = computed(() => {
  if (providerSummary.value) {
    if (providerSummary.value.validCount === 0) return []
    return [
      {
        type: 'provider' as const,
        count: providerSummary.value.validCount,
        label: activeProviderID.value
          ? PROVIDER_META[activeProviderID.value].label
          : '提供商',
        icon: KeyRound,
        color: 'text-ios-blue',
      },
    ]
  }
  const s = detectionSummary.value
  return (['api_key', 'jwt', 'password', 'refresh_token', 'email_apikey'] as const)
    .filter(t => s[t] > 0)
    .map(t => ({ type: t, count: s[t], ...typeLabels[t] }))
})

/** Provider 模式下,前 5 条无效行的人类可读错误,用于 footer 提示 */
const providerInvalidPreview = computed(() => {
  const sum = providerSummary.value
  if (!sum) return [] as Array<{ line: string; error: string }>
  const out: Array<{ line: string; error: string }> = []
  for (let i = 0; i < sum.results.length && out.length < 5; i++) {
    const r = sum.results[i]
    if (!r.ok) out.push({ line: sum.lines[i], error: r.error })
  }
  return out
})

const handleImport = async () => {
  const lines = inputText.value.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return

  isLoading.value = true
  results.value = []

  try {
    // ── Provider 模式:严格按 <base_url> <token> 格式校验后入库 ──
    if (props.pickProvider && activeProviderID.value) {
      const sum = validateProviderInput(inputText.value, activeProviderID.value)
      const providerLabel = PROVIDER_META[activeProviderID.value].label

      // 先把无效行作为失败结果回填到 UI,让用户能看见具体哪一行错
      const invalidResults: main.ImportResult[] = sum.results
        .map((r, i) => {
          if (r.ok) return null
          return new main.ImportResult({
            email: sum.lines[i],
            success: false,
            error: r.error,
          })
        })
        .filter((x): x is main.ImportResult => x !== null)

      const validItems = sum.results
        .filter((r) => r.ok)
        .map((r) =>
          new main.ProviderKeyItem({
            provider: activeProviderID.value!,
            base_url: r.baseUrl,
            token: r.token,
            remark: '',
            nickname: '',
          }),
        )

      let allResults: main.ImportResult[] = [...invalidResults]
      results.value = [...allResults]

      if (validItems.length) {
        const batch = await importBatched(
          validItems,
          (slice) => APIInfo.importByProvider(slice),
          (acc) => { results.value = [...allResults, ...acc] },
        )
        allResults.push(...(batch || []))
        results.value = [...allResults]
      }

      // Provider 模式不动 windsurf 号池;只刷新 provider store
      try {
        await providerStore.fetchAccounts(true)
      } catch {}
      const ok = allResults.filter(r => r.success).length
      const total = allResults.length
      if (total > 0) {
        showToast(
          `${providerLabel} 导入结束:成功 ${ok} / ${total} 条`,
          ok === total ? 'success' : 'info',
          5000,
        )
      }
      if (sum.validCount > 0) {
        inputText.value = ''
      }
      return
    }

    // ── 混合识别模式(原行为) ──
    const grouped = groupImportLines(lines)
    let allResults: main.ImportResult[] = []
    if (grouped.apiKeys.length) {
      const batch = await importBatched(
        grouped.apiKeys,
        (slice) => APIInfo.importByAPIKey(slice),
        (acc) => { results.value = [...allResults, ...acc] },
      )
      allResults.push(...(batch || []))
      results.value = [...allResults]
    }

    if (grouped.jwts.length) {
      const batch = await importBatched(
        grouped.jwts,
        (slice) => APIInfo.importByJWT(slice),
        (acc) => { results.value = [...allResults, ...acc] },
      )
      allResults.push(...(batch || []))
      results.value = [...allResults]
    }

    if (grouped.tokens.length) {
      const batch = await importBatched(
        grouped.tokens,
        (slice) => APIInfo.importByRefreshToken(slice),
        (acc) => { results.value = [...allResults, ...acc] },
      )
      allResults.push(...(batch || []))
      results.value = [...allResults]
    }

    if (grouped.emailApiKeys.length) {
      const batch = await importBatched(
        grouped.emailApiKeys,
        (slice) => APIInfo.importByEmailAPIKey(slice),
        (acc) => { results.value = [...allResults, ...acc] },
      )
      allResults.push(...(batch || []))
      results.value = [...allResults]
    }

    if (grouped.passwords.length) {
      const batch = await importBatched(
        grouped.passwords,
        (slice) => APIInfo.importByEmailPassword(slice),
        (acc) => { results.value = [...allResults, ...acc] },
      )
      allResults.push(...(batch || []))
      results.value = [...allResults]
    }

    await accountStore.fetchAccounts()
    const ok = allResults.filter(r => r.success).length
    const total = allResults.length
    if (total > 0) {
      showToast(`导入结束：成功 ${ok} / ${total} 条`, ok === total ? 'success' : 'info', 5000)
    }
    inputText.value = ''
  } catch (e) {
    console.error(e)
    showToast(`导入失败: ${String(e)}`, 'error')
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex animate-in fade-in duration-300 items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-md"
  >
    <div
      class="bg-ios-bg dark:bg-ios-bgDark w-full sm:w-[580px] max-h-[85vh] rounded-[28px] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] ring-1 ring-white/50 dark:ring-white/10 flex flex-col transform transition-transform animate-in slide-in-from-bottom-12 duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
    >
      <!-- Header -->
      <div
        class="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.72))] dark:bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.16),transparent_38%),linear-gradient(180deg,rgba(28,28,30,0.92),rgba(28,28,30,0.82))] backdrop-blur-xl flex justify-between items-start shrink-0"
      >
        <div class="flex min-w-0 items-start gap-3">
          <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-ios-blue shadow-[0_10px_24px_rgba(37,99,235,0.16)] dark:bg-white/10">
            <Sparkles class="h-5 w-5" stroke-width="2.4" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-[17px] tracking-tight text-ios-text dark:text-ios-textDark">批量导入</h3>
              <span class="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500/10 to-blue-500/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-violet-600 dark:text-violet-300">
                <Wand2 class="w-3 h-3" stroke-width="2.5" />
                智能识别
              </span>
            </div>
            <p class="mt-1 text-[12px] leading-relaxed text-ios-textSecondary dark:text-ios-textSecondaryDark">
              直接粘贴混合内容，自动识别 API Key / JWT / 邮箱密码 / 邮箱----Token / Refresh Token 并分别导入。
            </p>
          </div>
        </div>
        <button
          type="button"
          class="no-drag-region p-1.5 rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-all ios-btn"
          @click="emit('close')"
        >
          <X class="w-5 h-5 text-ios-textSecondary dark:text-ios-textSecondaryDark" stroke-width="2.5" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 flex-1 overflow-y-auto">
        <!-- 实时检测类型标签 -->
        <div class="mb-4 flex flex-wrap gap-2">
          <template v-if="activeTypes.length">
            <div
              v-for="t in activeTypes"
              :key="t.type"
              class="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/80 px-3 py-1.5 text-[12px] font-bold shadow-sm dark:border-white/[0.08] dark:bg-white/[0.05] transition-all"
            >
              <component :is="t.icon" class="w-3.5 h-3.5" :class="t.color" stroke-width="2.4" />
              <span :class="t.color">{{ t.label }}</span>
              <span class="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-black text-ios-textSecondary dark:bg-white/[0.1] dark:text-ios-textSecondaryDark">
                {{ t.count }}
              </span>
            </div>
          </template>
          <div v-else class="text-[12px] text-ios-textSecondary dark:text-ios-textSecondaryDark italic">
            粘贴内容后自动识别类型…
          </div>
          <div
            v-if="unknownCount > 0"
            class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[12px] font-bold text-amber-700 dark:text-amber-300"
            :title="`${unknownCount} 行无法识别为有效凭证，将被跳过`"
          >
            <AlertCircle class="w-3.5 h-3.5" stroke-width="2.4" />
            <span>{{ unknownCount }} 行未识别</span>
          </div>
        </div>

        <!-- 统计条 -->
        <div class="mb-4 grid grid-cols-3 gap-3">
          <div class="rounded-[18px] border border-black/[0.05] bg-white/80 px-4 py-3 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-ios-textSecondary dark:text-ios-textSecondaryDark">待导入</div>
            <div class="mt-2 flex items-end gap-2">
              <span class="text-[24px] font-extrabold leading-none text-ios-text dark:text-ios-textDark">{{ lineCount }}</span>
              <span class="pb-0.5 text-[11px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">条</span>
            </div>
          </div>
          <div class="rounded-[18px] border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700/75 dark:text-emerald-300/80">成功</div>
            <div class="mt-2 flex items-end gap-2">
              <span class="text-[24px] font-extrabold leading-none text-emerald-700 dark:text-emerald-300">{{ successCount }}</span>
              <span class="pb-0.5 text-[11px] font-medium text-emerald-700/70 dark:text-emerald-300/80">条</span>
            </div>
          </div>
          <div class="rounded-[18px] border border-rose-500/15 bg-rose-500/[0.05] px-4 py-3 shadow-sm">
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-700/75 dark:text-rose-300/80">失败</div>
            <div class="mt-2 flex items-end gap-2">
              <span class="text-[24px] font-extrabold leading-none text-rose-700 dark:text-rose-300">{{ failureCount }}</span>
              <span class="pb-0.5 text-[11px] font-medium text-rose-700/70 dark:text-rose-300/80">条</span>
            </div>
          </div>
        </div>

        <!-- 输入框 -->
        <div class="rounded-[22px] border border-black/[0.06] bg-white/75 p-4 shadow-[0_14px_32px_rgba(15,23,42,0.06)] dark:border-white/[0.06] dark:bg-black/20">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <div class="text-[13px] font-bold text-ios-text dark:text-ios-textDark">
                {{ props.pickProvider ? '按格式粘贴' : '混合粘贴' }}
              </div>
              <div v-if="props.pickProvider && activeProviderID" class="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                每行 <code class="font-mono font-semibold">&lt;base_url&gt;</code> 和
                <code class="font-mono font-semibold">&lt;token&gt;</code> 用空格分隔。
                例:<code class="font-mono">{{ PROVIDER_META[activeProviderID].envHint.exampleBaseUrl }} {{ PROVIDER_META[activeProviderID].envHint.exampleToken }}</code>
              </div>
              <div v-else class="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
                支持混合粘贴 — API Key、JWT、邮箱密码、邮箱----Token、Refresh Token 可一起粘贴，自动分流导入。
              </div>
            </div>
          </div>

          <!-- 提供商选择(仅 Providers 视图打开时显示;走 ISelectSheet iOS 风) -->
          <div v-if="props.pickProvider" class="mb-3">
            <label
              class="flex items-center gap-1.5 mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-ios-textSecondary dark:text-ios-textSecondaryDark"
            >
              <Layers class="h-3.5 w-3.5" stroke-width="2.4" />
              提供商
            </label>
            <ISelectSheet
              v-model="selectedProvider"
              :options="(providerOptions as any)"
              title="选择提供商"
            />
          </div>

          <textarea
            v-model="inputText"
            class="no-drag-region w-full h-[180px] bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,249,252,0.9))] dark:bg-[linear-gradient(180deg,rgba(10,10,12,0.75),rgba(18,18,20,0.88))] border border-black/10 dark:border-white/10 p-4 rounded-[18px] focus:outline-none focus:ring-2 focus:ring-ios-blue/50 dark:focus:ring-ios-blue/30 resize-none font-mono text-[13px] shadow-inner transition-all"
            :placeholder="placeholder"
          />

          <!-- Provider 模式:逐行无效项预览(最多 5 条) -->
          <div
            v-if="props.pickProvider && providerInvalidPreview.length"
            class="mt-3 rounded-[14px] border border-amber-500/20 bg-amber-500/[0.06] p-3"
          >
            <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
              <AlertCircle class="h-3.5 w-3.5" stroke-width="2.4" />
              {{ unknownCount }} 行格式不合法
            </div>
            <ul class="mt-2 space-y-1.5">
              <li
                v-for="(item, idx) in providerInvalidPreview"
                :key="idx"
                class="text-[11px] text-amber-800 dark:text-amber-200"
              >
                <code class="block font-mono truncate text-amber-900 dark:text-amber-100" :title="item.line">
                  {{ item.line }}
                </code>
                <span class="opacity-80">↳ {{ item.error }}</span>
              </li>
              <li
                v-if="(providerSummary?.invalidCount ?? 0) > providerInvalidPreview.length"
                class="text-[11px] text-amber-700/80 dark:text-amber-300/80 italic"
              >
                还有 {{ (providerSummary?.invalidCount ?? 0) - providerInvalidPreview.length }} 行未列出…
              </li>
            </ul>
          </div>
        </div>

        <!-- 导入结果 -->
        <div v-if="results.length" class="mt-5 space-y-3 max-h-48 overflow-y-auto pr-1">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-ios-textSecondary dark:text-ios-textSecondaryDark">
              导入结果
            </h4>
            <span class="text-[11px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
              已处理 {{ results.length }} 条
            </span>
          </div>
          <div
            v-for="(r, i) in results"
            :key="i"
            class="text-xs p-3 rounded-[18px] flex items-center justify-between shadow-sm border backdrop-blur-sm"
            :class="
              r.success
                ? 'bg-emerald-500/[0.08] border-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/[0.07] border-rose-500/15 text-rose-700 dark:text-rose-300'
            "
          >
            <span class="font-semibold truncate max-w-[260px] mr-2" :title="r.email">{{ r.email }}</span>
            <div class="flex items-center shrink-0 font-medium">
              <CheckCircle2 v-if="r.success" class="w-4 h-4 mr-1" />
              <AlertCircle v-else class="w-4 h-4 mr-1" />
              {{ r.success ? '成功' : r.error || '失败' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="p-5 border-t border-black/[0.06] dark:border-white/[0.06] bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-xl shrink-0"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-[12px] font-semibold text-ios-text dark:text-ios-textDark">
              <template v-if="lineCount > 0">
                准备导入 {{ lineCount }} 条（{{ activeTypes.map(t => `${t.label} ×${t.count}`).join('、') }}）<span
                  v-if="unknownCount > 0"
                  class="font-medium text-amber-700 dark:text-amber-300"
                >
                  · {{ unknownCount }} 行跳过</span
                >
              </template>
              <template v-else-if="totalInputLines > 0 && props.pickProvider && activeProviderID">
                <span class="text-amber-700 dark:text-amber-300">
                  {{ totalInputLines }} 行均不符合格式 —
                  请按 <code class="font-mono">&lt;base_url&gt; &lt;token&gt;</code> 空格分隔粘贴
                </span>
              </template>
              <template v-else-if="totalInputLines > 0">
                <span class="text-amber-700 dark:text-amber-300">
                  {{ totalInputLines }} 行均未识别为有效凭证 —
                  请检查格式（API Key/JWT/邮箱密码/邮箱----Token/Refresh Token）
                </span>
              </template>
              <template v-else>等待粘贴内容</template>
            </div>
            <div class="text-[11px] text-ios-textSecondary dark:text-ios-textSecondaryDark">
              {{ isLoading ? '正在分批提交并同步账号池…' : '导入完成后会自动刷新账号池列表' }}
            </div>
          </div>
          <button
            type="button"
            class="no-drag-region h-[48px] min-w-[144px] px-5 bg-gradient-to-b from-[#3b82f6] to-ios-blue text-white rounded-[16px] font-semibold text-[16px] ios-btn flex items-center justify-center disabled:opacity-50 shadow-md shadow-ios-blue/20 ring-1 ring-black/5 ring-inset active:ring-black/10"
            :disabled="isLoading || !inputText.trim() || lineCount === 0"
            @click="handleImport"
          >
            <Loader2 v-if="isLoading" class="w-5 h-5 ios-spinner mr-2" />
            {{ isLoading ? '导入中…' : '开始导入' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
