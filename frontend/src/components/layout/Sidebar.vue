<script setup lang="ts">
import { computed, ref } from 'vue'
import { Activity, BookOpen, Globe, HardDriveDownload, Hash, Heart, Layers, LayoutDashboard, MessageSquare, Settings, Shield, User, Users } from 'lucide-vue-next'
import { useAccountStore } from '../../stores/useAccountStore'
import { useMitmStatusStore } from '../../stores/useMitmStatusStore'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { showToast } from '../../utils/toast'
import { PRIMARY_POOL_LABEL, type ShellViewTab } from '../../utils/appMode'

const props = defineProps<{ activeTab: ShellViewTab }>()
const emit = defineEmits<{ (e: 'update:activeTab', tab: ShellViewTab): void }>()

const accountStore = useAccountStore()
const mitmStore = useMitmStatusStore()
const settingsStore = useSettingsStore()

// ── 路由模式胶囊:号池 ↔ 提供商 ──
// providers 模式下 MITM 把 IDE 的 cascade 请求翻译给已激活的 ProviderAccount。
const routeMode = computed<'pool' | 'providers'>(() => {
  const v = (settingsStore.settings as any)?.mitm_route_mode
  return v === 'providers' ? 'providers' : 'pool'
})
const switchingRouteMode = ref(false)
const setRouteMode = async (target: 'pool' | 'providers') => {
  if (routeMode.value === target || switchingRouteMode.value) return
  switchingRouteMode.value = true
  try {
    await settingsStore.updateSettings({
      ...(settingsStore.settings as any),
      mitm_route_mode: target,
    } as any)
    showToast(
      target === 'providers'
        ? '已切到提供商: MITM chat 走已激活卡片'
        : '已切回 Windsurf 号池接管',
      'success',
    )
  } catch (e: unknown) {
    showToast(`切换失败: ${String(e)}`, 'error')
  } finally {
    switchingRouteMode.value = false
  }
}

const menuItems = [
  { id: 'Dashboard', icon: LayoutDashboard, label: '总览' },
  { id: 'Providers', icon: Layers, label: '提供商' },
  { id: 'Accounts', icon: Users, label: PRIMARY_POOL_LABEL },
  { id: 'Usage', icon: Activity, label: '用量统计' },
  { id: 'Relay', icon: Globe, label: 'OpenAI Relay' },
  { id: 'Cleanup', icon: HardDriveDownload, label: '清理优化' },
  { id: 'Settings', icon: Settings, label: 'MITM 设置' },
] satisfies Array<{ id: ShellViewTab; icon: typeof Users; label: string }>

const footerModeLabel = computed(() => 'Pure MITM')

const activeKey = computed(() => mitmStore.status?.pool_status?.find((item) => item.is_current) ?? null)

const activeSummary = computed(() => {
  const key = String(activeKey.value?.key_short || '').trim()
  if (!key) {
    return '等待活跃 Key'
  }
  return key
})

const activeAccountLabel = computed(() => {
  const k = activeKey.value
  if (!k) return ''
  const nick = String(k.nickname || '').trim()
  const email = String(k.email || '').trim()
  if (nick && email) return `${nick} (${email})`
  return email || nick || ''
})

const boundSessions = computed(() => {
  const sessions = mitmStore.status?.active_sessions ?? []
  // 用 PoolKeyHash 精确匹配；长 token 类账号会让 PoolKeyShort 共享 16 字符
  // 前缀，跨账号过滤就会"看到不属于自己的会话"。pool_key_hash 是 sha256 前
  // 12 hex，不会撞车。后端兼容旧字段时退回 pool_key_short 全等匹配。
  const currentHash = activeKey.value?.key_hash ?? ''
  const currentShort = activeKey.value?.key_short ?? ''
  if (!currentHash && !currentShort) return []
  return sessions.filter((s) => {
    if (currentHash && s.pool_key_hash) {
      return s.pool_key_hash === currentHash
    }
    return s.pool_key_short === currentShort
  })
})
</script>

<template>
  <nav class="w-60 h-full ios-glass border-r border-ios-divider dark:border-ios-dividerDark flex flex-col pt-4 pb-4 z-40 shrink-0">
    <div class="px-5 pb-1 mb-1 text-[10px] font-semibold uppercase text-ios-textSecondary dark:text-ios-textSecondaryDark tracking-wider">
      导航
    </div>
    <ul class="flex-1 space-y-0.5 px-3">
      <li v-for="item in menuItems" :key="item.id">
        <button
          type="button"
          class="no-drag-region"
          @click="emit('update:activeTab', item.id)"
          :class="[
            'w-full flex items-center px-3 py-1.5 rounded-[12px] text-[13px] transition-all duration-[250ms] font-medium ios-btn',
            activeTab === item.id
              ? 'bg-gradient-to-b from-[#3b82f6] to-ios-blue text-white shadow-md shadow-ios-blue/25 ring-1 ring-black/5 dark:ring-white/10 ring-inset'
              : 'text-ios-text dark:text-ios-textDark hover:bg-black/5 dark:hover:bg-white/10'
          ]"
        >
          <component :is="item.icon" class="w-4 h-4 mr-2.5 transition-opacity duration-300" :class="activeTab === item.id ? 'opacity-100' : 'opacity-70'" stroke-width="2.2" />
          {{ item.label }}
        </button>
      </li>
    </ul>

    <div class="mx-3 mt-3 rounded-[16px] border border-black/[0.05] bg-white/60 px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/[0.06] dark:bg-white/[0.04]">
      <div class="text-[10px] font-bold uppercase tracking-[0.2em] text-ios-textSecondary dark:text-ios-textSecondaryDark">
        MITM 概况
      </div>
      <div class="mt-2 flex items-center justify-between">
        <div>
          <div class="text-[18px] font-extrabold leading-none text-ios-text dark:text-ios-textDark">
            {{ accountStore.accounts.length }}
          </div>
          <div class="mt-0.5 text-[10px] font-medium text-ios-textSecondary dark:text-ios-textSecondaryDark">
            号池总数
          </div>
        </div>
        <span class="rounded-full bg-ios-blue/10 px-2 py-0.5 text-[9px] font-bold tracking-wide text-ios-blue">
          {{ footerModeLabel }}
        </span>
      </div>

      <!-- 当前活跃 Key -->
      <div class="mt-2 rounded-[12px] bg-black/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-ios-textSecondary dark:bg-white/[0.05] dark:text-ios-textSecondaryDark">
        当前活跃 Key
        <div class="mt-0.5 truncate text-[11px] font-semibold text-ios-text dark:text-ios-textDark" :title="activeSummary">
          {{ activeSummary }}
        </div>
      </div>

      <!-- 当前活跃账号 -->
      <div v-if="activeAccountLabel" class="mt-1.5 flex items-center gap-1 rounded-[12px] bg-ios-blue/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-ios-blue">
        <User class="h-3 w-3 shrink-0" stroke-width="2.4" />
        <span class="truncate" :title="activeAccountLabel">{{ activeAccountLabel }}</span>
      </div>

      <!-- 绑定的对话 -->
      <div v-if="boundSessions.length > 0" class="mt-1.5 rounded-[12px] bg-black/[0.02] px-2.5 py-1.5 dark:bg-white/[0.03]">
        <div class="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.15em] text-ios-textSecondary dark:text-ios-textSecondaryDark mb-1">
          <MessageSquare class="h-3 w-3 shrink-0" stroke-width="2.2" />
          绑定对话 ({{ boundSessions.length }})
        </div>
        <ul class="space-y-1">
          <li
            v-for="session in boundSessions"
            :key="session.conv_id_short"
            class="flex items-center gap-1.5 text-[10px] text-ios-text dark:text-ios-textDark"
          >
            <Hash class="h-3 w-3 shrink-0 opacity-40" stroke-width="2" />
            <span class="truncate font-mono" :title="session.conv_id_short">{{ session.conv_id_short }}</span>
            <span class="ml-auto shrink-0 text-[9px] text-ios-textSecondary dark:text-ios-textSecondaryDark">{{ session.request_count }}次</span>
          </li>
        </ul>
      </div>

      <div class="mt-2 flex items-center gap-1.5 rounded-[12px] border border-emerald-500/12 bg-emerald-500/[0.06] px-2.5 py-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
        <Shield class="h-3 w-3 shrink-0" stroke-width="2.4" />
        健康 {{ mitmStore.status?.pool_status?.filter((item) => item.healthy).length ?? 0 }} / {{ mitmStore.status?.pool_status?.length ?? 0 }}
      </div>

      <!-- ★ 路由模式胶囊：号池 ↔ 提供商(iOS 风滑动指示条) -->
      <div
        class="no-drag-region relative mt-1.5 flex items-stretch rounded-full border border-black/[0.06] bg-white/80 p-0.5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.05]"
        role="tablist"
      >
        <span
          class="absolute top-0.5 bottom-0.5 left-0.5 rounded-full shadow-md transition-[transform,background-image,box-shadow] duration-[420ms] ease-[cubic-bezier(0.25,1,0.5,1)]"
          :style="{
            width: 'calc(50% - 2px)',
            transform:
              routeMode === 'providers'
                ? 'translateX(calc(100% + 0px))'
                : 'translateX(0)',
          }"
          :class="
            routeMode === 'providers'
              ? 'bg-gradient-to-b from-violet-500 via-fuchsia-400 to-rose-300 shadow-fuchsia-500/25'
              : 'bg-gradient-to-b from-[#3b82f6] to-ios-blue shadow-ios-blue/25'
          "
        />
        <button
          type="button"
          class="ios-btn relative z-10 flex-1 flex h-6 items-center justify-center gap-1 rounded-full text-[10px] font-bold transition-colors duration-200"
          :class="
            routeMode === 'pool'
              ? 'text-white'
              : 'text-ios-textSecondary hover:text-ios-text dark:text-ios-textSecondaryDark dark:hover:text-ios-textDark'
          "
          :disabled="switchingRouteMode"
          @click="setRouteMode('pool')"
        >
          <Users class="h-2.5 w-2.5" stroke-width="2.6" />
          号池
        </button>
        <button
          type="button"
          class="ios-btn relative z-10 flex-1 flex h-6 items-center justify-center gap-1 rounded-full text-[10px] font-bold transition-colors duration-200"
          :class="
            routeMode === 'providers'
              ? 'text-white'
              : 'text-ios-textSecondary hover:text-ios-text dark:text-ios-textSecondaryDark dark:hover:text-ios-textDark'
          "
          :disabled="switchingRouteMode"
          @click="setRouteMode('providers')"
        >
          <Globe class="h-2.5 w-2.5" stroke-width="2.6" />
          提供商
        </button>
      </div>
    </div>

    <!-- ★ v1.8.0 底部 Help / About 入口 -->
    <div class="mx-3 mt-2 flex gap-1.5">
      <button
        type="button"
        class="no-drag-region flex-1 flex items-center justify-center gap-1 py-1.5 rounded-[10px] text-[11px] font-bold transition-all ios-btn"
        :class="
          activeTab === 'Help'
            ? 'bg-ios-blue text-white shadow-sm'
            : 'bg-black/[0.04] text-gray-600 dark:bg-white/[0.06] dark:text-gray-400 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]'
        "
        @click="emit('update:activeTab', 'Help')"
      >
        <BookOpen class="h-3 w-3" stroke-width="2.4" />
        帮助
      </button>
      <button
        type="button"
        class="no-drag-region flex-1 flex items-center justify-center gap-1 py-1.5 rounded-[10px] text-[11px] font-bold transition-all ios-btn"
        :class="
          activeTab === 'About'
            ? 'bg-rose-500 text-white shadow-sm'
            : 'bg-black/[0.04] text-gray-600 dark:bg-white/[0.06] dark:text-gray-400 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]'
        "
        @click="emit('update:activeTab', 'About')"
      >
        <Heart class="h-3 w-3" stroke-width="2.4" />
        关于
      </button>
    </div>
  </nav>
</template>
