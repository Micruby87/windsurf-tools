import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { APIInfo } from "../api/wails";
import IAutoSaveIndicator from "../components/ios/IAutoSaveIndicator";
import IModalSheet from "../components/ios/IModalSheet";
import INumberStepper from "../components/ios/INumberStepper";
import ISecretInput from "../components/ios/ISecretInput";
import ISettingRow from "../components/ios/ISettingRow";
import IToggle from "../components/ios/IToggle";
import PageLoadingSkeleton from "../components/common/PageLoadingSkeleton";
import ClashAssistant from "../components/ClashAssistant";
import JailbreakRuntimeCard from "../components/JailbreakRuntimeCard";
import PlanFilterChips from "../components/accounts/PlanFilterChips";
import { useAccountStore } from "../stores/useAccountStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { getPlanTone } from "../utils/account";
import {
  clampBillingYears,
  clampForgeCredits,
  clampSwitchCooldownSec,
  FAKE_SUBSCRIPTION_OPTIONS,
  formToSettings,
  formatSwitchPlanFilterSummary,
  normalizeSwitchPlanFilter,
  quotaPolicyOptions,
  SWITCH_PLAN_FILTER_TONES,
  SWITCH_STRATEGY_OPTIONS,
  settingsToForm,
  type SettingsForm,
  type SwitchPlanTone,
} from "../utils/settingsModel";
import { showErrorToast, showToast } from "../utils/toast";

const AUTOSAVE_DEBOUNCE_MS = 500;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Settings — Vue 1:1 完整字段迁移；UI 紧凑（统一用 ISettingRow），自动保存防抖 500ms。
 *
 * 5 个分组：基础（导入并发 / 静态缓存）/ 自动切号 / Pin & 轮换池 / Clash IP 轮换 /
 * 破限注入 / 桌面行为 / 调试 / 配置导入导出 / F7 卡片（作者自用）。
 */
export default function Settings() {
  const settings = useSettingsStore((s) => s.settings);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const hasLoadedOnce = useSettingsStore((s) => s.hasLoadedOnce);

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  // Phase B-2: 导入弹窗（替代 window.prompt 提供更好的多行编辑体验）
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<SettingsForm | null>(null);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  // 初次加载 settings → 转 form
  useEffect(() => {
    void useSettingsStore.getState().fetchSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      const next = settingsToForm(settings);
      setForm((prev) => {
        if (savingRef.current || pendingSaveRef.current) {
          if (!prev) {
            formRef.current = next;
            return next;
          }
          return prev;
        }
        formRef.current = next;
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const flushSave = async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const cur = formRef.current;
    if (!cur) return;
    if (savingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    savingRef.current = true;
    pendingSaveRef.current = false;
    setSaveState("saving");
    try {
      await APIInfo.updateSettings(formToSettings(cur));
      await useSettingsStore.getState().fetchSettings(true);
      setSaveState("saved");
      if (saveStateResetTimer.current) clearTimeout(saveStateResetTimer.current);
      saveStateResetTimer.current = setTimeout(
        () => setSaveState("idle"),
        2200,
      );
    } catch (e) {
      setSaveState("error");
      setSaveError(String(e));
    } finally {
      savingRef.current = false;
      if (pendingSaveRef.current) {
        void flushSave();
      }
    }
  };

  // patch + 防抖触发自动保存
  const patch = (delta: Partial<SettingsForm>) => {
    pendingSaveRef.current = true;
    setForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...delta };
      formRef.current = next;
      return next;
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (saveStateResetTimer.current)
        clearTimeout(saveStateResetTimer.current);
      // 切走时立刻 flush
      if (formRef.current) void flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // D-A: 计算 plan filter chip 上的实时计数 + 准入数 summary
  const accounts = useAccountStore((s) => s.accounts);
  useEffect(() => {
    void useAccountStore.getState().ensureAccountsLoaded();
  }, []);
  const planFilterCounts = useMemo(() => {
    const counts: Partial<Record<SwitchPlanTone, number>> = {};
    for (const t of SWITCH_PLAN_FILTER_TONES) counts[t] = 0;
    for (const a of accounts) {
      const tone = getPlanTone(a.plan_name) as SwitchPlanTone;
      counts[tone] = (counts[tone] ?? 0) + 1;
    }
    return counts;
  }, [accounts]);
  const planFilterDescription = useMemo(() => {
    const filter = form?.auto_switch_plan_filter ?? "all";
    const normalized = normalizeSwitchPlanFilter(filter);
    if (normalized === "all") {
      return `准入 ${accounts.length} 个账号 · 全部计划`;
    }
    const tones = new Set(normalized.split(",") as SwitchPlanTone[]);
    const matched = SWITCH_PLAN_FILTER_TONES.reduce(
      (n, t) => n + (tones.has(t) ? (planFilterCounts[t] ?? 0) : 0),
      0,
    );
    return `准入 ${matched} / ${accounts.length} 个账号 · ${formatSwitchPlanFilterSummary(normalized)}`;
  }, [form?.auto_switch_plan_filter, accounts.length, planFilterCounts]);

  const handleExport = async () => {
    try {
      const path = await APIInfo.exportSettings();
      showToast(`配置已导出到：\n${path}`, "success", 6000);
    } catch (e) {
      showErrorToast(e, "导出配置失败");
    }
  };

  const openImport = () => {
    setImportText("");
    setImportOpen(true);
  };

  const submitImport = async () => {
    const text = importText.trim();
    if (!text) {
      showToast("请粘贴 settings.json 内容", "error");
      return;
    }
    setImportBusy(true);
    try {
      await APIInfo.importSettings(text);
      await useSettingsStore.getState().fetchSettings(true);
      const latest = useSettingsStore.getState().settings;
      if (latest) {
        const next = settingsToForm(latest);
        formRef.current = next;
        setForm(next);
      }
      showToast("配置已导入并应用", "success");
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      showErrorToast(e, "导入配置失败");
    } finally {
      setImportBusy(false);
    }
  };

  if (!hasLoadedOnce && isLoading) {
    return <PageLoadingSkeleton variant="settings" className="w-full" />;
  }

  if (!form) {
    return <PageLoadingSkeleton variant="settings" className="w-full" />;
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full pb-12">
      <header className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-ios-text dark:text-ios-textDark tracking-tight flex items-center gap-3">
            <SettingsIcon className="w-7 h-7 text-ios-blue" strokeWidth={2.4} />
            MITM 设置
          </h1>
          <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
            修改任何项会自动保存（500ms 防抖）。
          </p>
        </div>
        <IAutoSaveIndicator state={saveState} errorText={saveError} />
      </header>

      <div className="space-y-8">
        {/* ═══ 基础 ═══ */}
        <Section title="基础" icon="⚙️">
          <ISettingRow
            title="导入并发数"
            description="批量导入时同时进行的请求数。调高可加速，但容易触发上游限速 (429)。"
          >
            <INumberStepper
              modelValue={form.import_concurrency}
              onValueChange={(v) => patch({ import_concurrency: v })}
              min={1}
              max={20}
              suffix="并发"
              width={70}
            />
          </ISettingRow>
          <ISettingRow
            title="自动刷新所有凭证"
            description="启动时刷新一次 JWT；之后每 24h 刷一次。"
          >
            <IToggle
              modelValue={form.auto_refresh_tokens}
              onValueChange={(v) => patch({ auto_refresh_tokens: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="自动同步所有额度"
            description="启动时同步一次额度；之后按下方策略刷新。"
          >
            <IToggle
              modelValue={form.auto_refresh_quotas}
              onValueChange={(v) => patch({ auto_refresh_quotas: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="额度刷新策略"
            description="决定全局定时同步额度的频率。"
            tooltip={
              <div className="space-y-1">
                <div>
                  <b>off</b>：不同步。只靠热轮询 / 手动刷。
                </div>
                <div>
                  <b>conservative</b>（推荐）：30 分钟一轮，兑现服务器心跳不越限。
                </div>
                <div>
                  <b>aggressive</b>：5 分钟一轮，实时度高但可能被上游限速。
                </div>
                <div>
                  <b>interval_custom</b>：用下面「自定义刷新间隔」字段。
                </div>
              </div>
            }
          >
            <select
              value={form.quota_refresh_policy}
              onChange={(e) => patch({ quota_refresh_policy: e.target.value })}
              className="no-drag-region rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.06]"
            >
              {quotaPolicyOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </ISettingRow>
          <ISettingRow
            title="自定义刷新间隔"
            description="quota_refresh_policy=interval_custom 时生效。"
          >
            <INumberStepper
              modelValue={form.quota_custom_interval_minutes}
              onValueChange={(v) =>
                patch({ quota_custom_interval_minutes: v })
              }
              min={5}
              max={1440}
              suffix="分"
              width={70}
            />
          </ISettingRow>
          <ISettingRow
            title="额度热轮询间隔"
            description="MITM 启动后定时拉当前活跃账号额度，发现见底主动切号。"
            noBorder
            tooltip={
              <div className="space-y-1">
                <div>
                  只拉「当前活跃」一个账号，不是所有。
                </div>
                <div>
                  <b>3-15s</b>：响应极快但服务器 RPS 压力大。
                </div>
                <div>
                  <b>30-60s</b>（推荐）：实时度与开销平衡。
                </div>
                <div className="opacity-70">
                  仅 MITM 在跑时生效。不跑时仅靠「额度刷新策略」。
                </div>
              </div>
            }
          >
            <INumberStepper
              modelValue={form.quota_hot_poll_seconds}
              onValueChange={(v) => patch({ quota_hot_poll_seconds: v })}
              min={3}
              max={120}
              suffix="秒"
              width={70}
            />
          </ISettingRow>
        </Section>

        {/* ═══ 自动切号 ═══ */}
        <Section title="自动切号" icon="🔄">
          <ISettingRow
            title="额度耗尽时自动切下一席"
            description="MITM 收到 quota exceeded 时立刻切换。"
            tooltip={
              <div className="space-y-1">
                <div>
                  检测上游返回的 <code>quota exhausted</code>{" "}
                  类错误后自动跳到号池下一个可用 key。
                </div>
                <div className="opacity-70">
                  关闭后遇到额度耗尽会报错不切号，需手动处理。
                </div>
              </div>
            }
          >
            <IToggle
              modelValue={form.auto_switch_on_quota_exhausted}
              onValueChange={(v) =>
                patch({ auto_switch_on_quota_exhausted: v })
              }
            />
          </ISettingRow>
          <ISettingRow
            title="自动切号 准入套餐"
            description={planFilterDescription}
            stacked
          >
            <PlanFilterChips
              filter={form.auto_switch_plan_filter}
              onChange={(next) => patch({ auto_switch_plan_filter: next })}
              counts={planFilterCounts}
            />
          </ISettingRow>
          {/* F3: 调度策略 */}
          <ISettingRow
            title="调度策略"
            description={
              SWITCH_STRATEGY_OPTIONS.find(
                (o) => o.value === form.switch_strategy,
              )?.description ?? "决定多个候选号之间的优先顺序"
            }
          >
            <select
              value={form.switch_strategy}
              onChange={(e) => patch({ switch_strategy: e.target.value })}
              className="no-drag-region rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.06]"
            >
              {SWITCH_STRATEGY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </ISettingRow>
          {/* F3: 冷却惩罚开关 */}
          <ISettingRow
            title="冷却惩罚"
            description="被 quota / ratelimit 切走的账号在冷却时间内不再被自动选回，连续命中翻倍。手动切换不受影响。"
          >
            <IToggle
              modelValue={form.switch_cooldown_enabled}
              onValueChange={(v) => patch({ switch_cooldown_enabled: v })}
            />
          </ISettingRow>
          {/* F3: 冷却基础秒数（仅启用时显示） */}
          {form.switch_cooldown_enabled ? (
            <ISettingRow
              title="冷却基础时长"
              description="单次冷却的基础秒数；同一号连续命中会指数翻倍（最多 16x）"
              noBorder
            >
              <INumberStepper
                modelValue={form.switch_cooldown_base_sec}
                onValueChange={(v) =>
                  patch({ switch_cooldown_base_sec: clampSwitchCooldownSec(v) })
                }
                min={30}
                max={3600}
                step={30}
                suffix="秒"
              />
            </ISettingRow>
          ) : null}
        </Section>

        {/* ═══ Pin & 轮换池 ═══ */}
        <Section title="Pin · 轮换池" icon="🔒">
          <ISettingRow
            title="启用手动锁定 (Pin)"
            description="锁定后所有自动切都跳过，用户 100% 控制。"
          >
            <IToggle
              modelValue={form.manual_pin_enabled}
              onValueChange={(v) => patch({ manual_pin_enabled: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="启用轮换池"
            description="勾 2+ 个账号进池，定时切 + 额度耗尽双触发都只在池内来回切。"
          >
            <IToggle
              modelValue={form.rotation_pool_enabled}
              onValueChange={(v) => patch({ rotation_pool_enabled: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="轮换池 定时切换间隔"
            description="即便没耗尽也会按此间隔切下一个池内账号。"
          >
            <INumberStepper
              modelValue={form.rotation_pool_interval_min}
              onValueChange={(v) => patch({ rotation_pool_interval_min: v })}
              min={1}
              max={1440}
              suffix="分"
              width={70}
            />
          </ISettingRow>
          <ISettingRow
            title="轮换池 额度刷新间隔"
            description="池内账号独立的 quota 同步频率（不影响全局策略）。"
            noBorder
          >
            <INumberStepper
              modelValue={form.rotation_pool_quota_refresh_min}
              onValueChange={(v) =>
                patch({ rotation_pool_quota_refresh_min: v })
              }
              min={1}
              max={120}
              suffix="分"
              width={70}
            />
          </ISettingRow>
        </Section>

        {/* ═══ Clash IP 轮换 ═══ */}
        <Section title="Clash IP 轮换" icon="🔀" anchor="clash-settings">
          <ISettingRow
            title="手动出站代理 URL"
            description="直填 http/https/socks5 代理地址,优先级最高(高于 Clash 探活、环境变量)。空 = 不启用。例: socks5://127.0.0.1:7890"
          >
            <input
              value={form.proxy_url}
              onChange={(e) => patch({ proxy_url: e.target.value })}
              type="text"
              className="no-drag-region w-[280px] rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] font-mono dark:border-white/[0.08] dark:bg-white/[0.06]"
              placeholder="（空 = 不启用）"
            />
          </ISettingRow>
          <ClashAssistant
            controllerURL={form.clash_controller_url}
            secret={form.clash_secret}
            group={form.clash_group}
            onPatch={(delta) => patch(delta)}
            flushSave={flushSave}
          />
          <ISettingRow
            title="启用 Clash 轮换"
            description="按下方间隔自动切换 Clash 出口节点；上游 429 时也会立刻切。"
          >
            <IToggle
              modelValue={form.clash_rotate_enabled}
              onValueChange={(v) => patch({ clash_rotate_enabled: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="控制器 URL"
            description="Clash / Mihomo / Verge 控制器地址（默认 9097）。"
          >
            <input
              value={form.clash_controller_url}
              onChange={(e) => patch({ clash_controller_url: e.target.value })}
              type="text"
              className="no-drag-region w-[260px] rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] font-mono dark:border-white/[0.08] dark:bg-white/[0.06]"
              placeholder="http://127.0.0.1:9097"
            />
          </ISettingRow>
          <ISettingRow
            title="Secret"
            description="如果 Clash external-controller 配了 secret，填这里。默认遮蔽，点眼睛切明文。"
          >
            <ISecretInput
              value={form.clash_secret}
              onChange={(v) => patch({ clash_secret: v })}
              ariaLabel="Clash Secret"
            />
          </ISettingRow>
          <ISettingRow
            title="选择器组 (group)"
            description="留空 → 智能启用时自动检测节点最多的 selector 组。"
          >
            <input
              value={form.clash_group}
              onChange={(e) => patch({ clash_group: e.target.value })}
              type="text"
              className="no-drag-region w-[200px] rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.06]"
              placeholder="(自动)"
            />
          </ISettingRow>
          <ISettingRow
            title="切换间隔"
            description="定时切换出口节点的频率。"
          >
            <INumberStepper
              modelValue={form.clash_interval_minutes}
              onValueChange={(v) => patch({ clash_interval_minutes: v })}
              min={1}
              max={1440}
              suffix="分"
              width={70}
            />
          </ISettingRow>
          <ISettingRow
            title="429 时立即切节点"
            description="收到 rate limit 时不等周期，立刻换 IP。"
          >
            <IToggle
              modelValue={form.clash_rotate_on_rate_limit}
              onValueChange={(v) => patch({ clash_rotate_on_rate_limit: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="延迟测试 URL"
            description="选节点时用来探活 + 测延迟的目标 URL。"
          >
            <input
              value={form.clash_latency_test_url}
              onChange={(e) =>
                patch({ clash_latency_test_url: e.target.value })
              }
              type="text"
              className="no-drag-region w-[260px] rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] font-mono dark:border-white/[0.08] dark:bg-white/[0.06]"
            />
          </ISettingRow>
          <ISettingRow
            title="最大延迟阈值"
            description="超过此延迟的节点不参与轮换。0 = 不限制。"
            noBorder
          >
            <INumberStepper
              modelValue={form.clash_latency_max_ms}
              onValueChange={(v) => patch({ clash_latency_max_ms: v })}
              min={0}
              max={10000}
              step={100}
              suffix="ms"
              width={80}
            />
          </ISettingRow>
        </Section>

        {/* ═══ 破限注入 ═══ */}
        <Section title="Cascade 破限注入" icon="✨">
          <JailbreakRuntimeCard
            enabled={form.mitm_jailbreak_enabled}
            currentInlineText={form.mitm_jailbreak_override}
            source={form.mitm_jailbreak_override_source}
          />
          <ISettingRow
            title="启用破限注入"
            description="MITM 拦截 chat 请求，在 F2 system prompt 末尾追加 override 文本。"
            tooltip={
              <div className="space-y-1">
                <div>
                  原理：IDE 发出的 protobuf 请求中叫 chat 的
                  <code>F2 system_prompt</code> 字段被 MITM 追上设定的
                  override 内容。
                </div>
                <div>
                  override 文本取自 <b>preset_id</b> 列表或
                  <b>override</b> 手填走字段。
                </div>
                <div className="text-amber-600 dark:text-amber-300">
                  ⚠️仅限 OpenAI/Cascade 模型。Anthropic（Claude）走独立路径，该开关不生效。
                </div>
              </div>
            }
          >
            <IToggle
              modelValue={form.mitm_jailbreak_enabled}
              onValueChange={(v) => patch({ mitm_jailbreak_enabled: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="预设"
            description="custom: 用下方文本框；minimal/soft_safe/original_full 见 Help 第 7 章。"
          >
            <select
              value={form.mitm_jailbreak_preset_id}
              onChange={(e) =>
                patch({ mitm_jailbreak_preset_id: e.target.value })
              }
              className="no-drag-region rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.06]"
            >
              <option value="custom">custom · 自定义</option>
              <option value="minimal">minimal · 极简（推荐）</option>
              <option value="soft_safe">soft_safe · 软版</option>
              <option value="original_full">
                original_full · 原版（高风险）
              </option>
            </select>
          </ISettingRow>
          <ISettingRow
            title="文本来源"
            description="inline = 用下方文本框；file = 从外部文件读取。"
          >
            <select
              value={form.mitm_jailbreak_override_source}
              onChange={(e) =>
                patch({ mitm_jailbreak_override_source: e.target.value })
              }
              className="no-drag-region rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.06]"
            >
              <option value="inline">inline · 内嵌</option>
              <option value="file">file · 外部文件</option>
            </select>
          </ISettingRow>
          {form.mitm_jailbreak_override_source === "file" ? (
            <ISettingRow
              title="文件路径"
              description="留空 → 默认 ~/.claude/override.md。"
            >
              <input
                value={form.mitm_jailbreak_override_file}
                onChange={(e) =>
                  patch({ mitm_jailbreak_override_file: e.target.value })
                }
                type="text"
                className="no-drag-region w-[280px] rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] font-mono dark:border-white/[0.08] dark:bg-white/[0.06]"
                placeholder="~/.claude/override.md"
              />
            </ISettingRow>
          ) : (
            <ISettingRow
              title="自定义注入文本"
              description="只有 preset=custom + source=inline 时使用。"
              stacked
              noBorder
            >
              <textarea
                value={form.mitm_jailbreak_override}
                onChange={(e) =>
                  patch({ mitm_jailbreak_override: e.target.value })
                }
                rows={6}
                className="no-drag-region w-full rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[12.5px] font-mono dark:border-white/[0.08] dark:bg-white/[0.06]"
                placeholder="留空 → 后端 fallback 到 DefaultJailbreakOverride"
              />
            </ISettingRow>
          )}
        </Section>

        {/* ═══ 桌面行为 ═══ */}
        <Section title="桌面行为" icon="🖥️">
          <ISettingRow
            title="关闭窗口时最小化到托盘"
            description="点 X 后程序仍在托盘运行；右键托盘菜单可彻底退出。"
          >
            <IToggle
              modelValue={form.minimize_to_tray}
              onValueChange={(v) => patch({ minimize_to_tray: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="桌面通知"
            description="Pin 解除 / 额度耗尽 / Clash 错误等关键事件弹通知（60s 同类去重）。"
          >
            <IToggle
              modelValue={form.desktop_notifications}
              onValueChange={(v) => patch({ desktop_notifications: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="启动时不显示主窗口"
            description="开机自启场景下静默挂托盘，托盘图标可打开主窗口。"
            noBorder
          >
            <IToggle
              modelValue={form.silent_start}
              onValueChange={(v) => patch({ silent_start: v })}
            />
          </ISettingRow>
        </Section>

        {/* ═══ OpenAI Relay ═══ */}
        <Section title="OpenAI Relay" icon="🌐">
          <ISettingRow
            title="启用 Relay"
            description="对外暴露 OpenAI 兼容 Chat Completions 中转。"
          >
            <IToggle
              modelValue={form.openai_relay_enabled}
              onValueChange={(v) => patch({ openai_relay_enabled: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="监听端口"
            description="本机 127.0.0.1:此端口 提供服务。"
          >
            <INumberStepper
              modelValue={form.openai_relay_port}
              onValueChange={(v) => patch({ openai_relay_port: v })}
              min={1}
              max={65535}
              width={90}
            />
          </ISettingRow>
          <ISettingRow
            title="鉴权 Bearer Secret"
            description="留空 = 任何 API Key 都接受；填了 = 客户端必须带匹配 Bearer。默认遮蔽。"
            noBorder
          >
            <ISecretInput
              value={form.openai_relay_secret}
              onChange={(v) => patch({ openai_relay_secret: v })}
              placeholder="(可选)"
              ariaLabel="OpenAI Relay Bearer Secret"
            />
          </ISettingRow>
        </Section>

        {/* ═══ 高级 / 调试 ═══ */}
        <Section title="高级 · 调试" icon="🔧">
          <ISettingRow
            title="MITM 静态缓存拦截"
            description=".bin 静态资源直返本地缓存，减少上游回源。"
          >
            <IToggle
              modelValue={form.static_cache_intercept}
              onValueChange={(v) => patch({ static_cache_intercept: v })}
            />
          </ISettingRow>
          <ISettingRow
            title="伪造 Enterprise Plan"
            description="GetUserStatus/GetPlanStatus 伪造为 Enterprise 无限积分（仅 IDE 显示用）。"
          >
            <IToggle
              modelValue={form.forge_enabled}
              onValueChange={(v) => patch({ forge_enabled: v })}
            />
          </ISettingRow>
          {form.forge_enabled ? (
            <>
              <ISettingRow
                title="Forge · 订阅类型"
                description="伪造 GetPlanStatus 返回的 subscription_type；IDE 顶栏显示用。"
              >
                <select
                  value={form.fake_subscription_type}
                  onChange={(e) =>
                    patch({ fake_subscription_type: e.target.value })
                  }
                  className="no-drag-region rounded-[12px] border border-black/[0.06] bg-white px-3 py-2 text-[13px] dark:border-white/[0.08] dark:bg-white/[0.06]"
                >
                  {FAKE_SUBSCRIPTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </ISettingRow>
              <ISettingRow
                title="Forge · 总 Credits"
                description="GetPlanStatus.f8 / f12 字段：账号总额度。默认 10,000,000。"
              >
                <INumberStepper
                  modelValue={form.fake_credits}
                  onValueChange={(v) =>
                    patch({ fake_credits: clampForgeCredits(v) })
                  }
                  min={0}
                  max={1_000_000_000}
                  step={1_000_000}
                  width={140}
                />
              </ISettingRow>
              <ISettingRow
                title="Forge · Premium Credits"
                description="GetPlanStatus.f9 / f13：高级模型可用 credits。默认 150,000。"
              >
                <INumberStepper
                  modelValue={form.fake_credits_premium}
                  onValueChange={(v) =>
                    patch({ fake_credits_premium: clampForgeCredits(v) })
                  }
                  min={0}
                  max={10_000_000}
                  step={50_000}
                  width={120}
                />
              </ISettingRow>
              <ISettingRow
                title="Forge · Cascade Credits"
                description="GetPlanStatus.f14：Cascade / 其它 credits。默认 25,000。"
              >
                <INumberStepper
                  modelValue={form.fake_credits_other}
                  onValueChange={(v) =>
                    patch({ fake_credits_other: clampForgeCredits(v) })
                  }
                  min={0}
                  max={1_000_000}
                  step={5_000}
                  width={120}
                />
              </ISettingRow>
              <ISettingRow
                title="Forge · 已用 Credits"
                description="GetUserStatus.f28：已用量。设 0 = IDE 显示「未开始消耗」。"
              >
                <INumberStepper
                  modelValue={form.fake_credits_used}
                  onValueChange={(v) =>
                    patch({ fake_credits_used: clampForgeCredits(v) })
                  }
                  min={0}
                  max={1_000_000_000}
                  step={1_000}
                  width={120}
                />
              </ISettingRow>
              <ISettingRow
                title="Forge · 计费周期延长"
                description="把 billing_period 终点延长 N 年（让 IDE 觉得订阅长期有效）。"
              >
                <INumberStepper
                  modelValue={form.fake_billing_extend_years}
                  onValueChange={(v) =>
                    patch({ fake_billing_extend_years: clampBillingYears(v) })
                  }
                  min={0}
                  max={50}
                  step={1}
                  suffix="年"
                />
              </ISettingRow>
            </>
          ) : null}
          <ISettingRow
            title="MITM 全量抓包"
            description="把所有 MITM 经过的 HTTPS 请求/响应落盘到 capture/ 目录。"
          >
            <IToggle
              modelValue={form.mitm_full_capture}
              onValueChange={(v) => patch({ mitm_full_capture: v })}
            />
          </ISettingRow>
          {form.mitm_full_capture ? (
            <ISettingRow
              title="打开 capture/ 目录"
              description="用系统文件管理器查看落盘的请求/响应。"
            >
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-ios-blue/10 px-3.5 py-1.5 text-[13px] font-medium text-ios-blue transition hover:bg-ios-blue/15 dark:text-blue-300"
                onClick={async () => {
                  try {
                    const path = await APIInfo.revealCaptureDir();
                    showToast(`已打开 ${path}`, "success");
                  } catch (e) {
                    showErrorToast(e, "打开目录失败");
                  }
                }}
              >
                <Folder className="h-3.5 w-3.5" />
                打开目录
              </button>
            </ISettingRow>
          ) : null}
          <ISettingRow
            title="protobuf debug dump"
            description="把 GetChatMessage 的 protobuf 字段树打印到日志。"
          >
            <IToggle
              modelValue={form.mitm_debug_dump}
              onValueChange={(v) => patch({ mitm_debug_dump: v })}
            />
          </ISettingRow>
          {form.mitm_debug_dump ? (
            <ISettingRow
              title="打开 proto_dumps/ 目录"
              description="查看 GetChatMessage 字段树 dump。"
            >
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-ios-blue/10 px-3.5 py-1.5 text-[13px] font-medium text-ios-blue transition hover:bg-ios-blue/15 dark:text-blue-300"
                onClick={async () => {
                  try {
                    const path = await APIInfo.revealProtoDumpDir();
                    showToast(`已打开 ${path}`, "success");
                  } catch (e) {
                    showErrorToast(e, "打开目录失败");
                  }
                }}
              >
                <Folder className="h-3.5 w-3.5" />
                打开目录
              </button>
            </ISettingRow>
          ) : null}
          <ISettingRow
            title="调试日志"
            description="切号/代理/额度判定的详细决策过程写入 debug.log。"
            noBorder
          >
            <IToggle
              modelValue={form.debug_log}
              onValueChange={(v) => patch({ debug_log: v })}
            />
          </ISettingRow>
        </Section>

        {/* ═══ 配置导入导出 ═══ */}
        <Section title="配置导入 / 导出" icon="💾">
          <ISettingRow
            title="导出当前配置"
            description="把 settings.json 复制到桌面，便于多设备同步。"
          >
            <button
              type="button"
              onClick={handleExport}
              className="no-drag-region rounded-full bg-ios-blue/10 hover:bg-ios-blue/15 px-4 py-2 text-[12px] font-bold text-ios-blue ios-btn"
            >
              导出
            </button>
          </ISettingRow>
          <ISettingRow
            title="导入配置"
            description="粘贴 settings.json 全文，覆盖当前配置。"
            noBorder
          >
            <button
              type="button"
              onClick={openImport}
              className="no-drag-region rounded-full bg-violet-500/10 hover:bg-violet-500/15 px-4 py-2 text-[12px] font-bold text-violet-700 dark:text-violet-300 ios-btn"
            >
              粘贴并导入
            </button>
          </ISettingRow>
        </Section>

        {/* ═══ F7 SmartFriend（仅作者自用） ═══ */}
        {/* F7-REMOVAL-BEGIN */}
        <Section title="F7 · SmartFriend（仅作者自用）" icon="🎩">
          <ISettingRow
            title="启用 F7 模式"
            description="把 GetChatMessage 类型从 CASCADE(5) 改成 SMART_FRIEND(13)，服务端按 SMART_FRIEND 计费、绕过日/周额度限制。仅作者自用，发布前会被移除。"
            tooltip={
              <div className="space-y-1">
                <div>
                  后端全路径覆盖：MITM HTTP、OpenAI Relay、Anthropic Relay
                  三个入口都会把 F7 从 5 中继为 13。
                </div>
                <div>
                  同时前端跳过额度告警（「耗尽」卡片仍可用），
                  自动切号暂停，热轮询不手动切号。
                </div>
                <div className="text-rose-600 dark:text-rose-300">
                  ⛔️该参数被服务端记录，必要时可能反推。重使用者请谨慎。
                </div>
              </div>
            }
          >
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                Author-only
              </span>
              <IToggle
                modelValue={form.smart_friend_enabled}
                onValueChange={(v) => patch({ smart_friend_enabled: v })}
              />
            </div>
          </ISettingRow>
          {form.smart_friend_enabled ? (
            <ISettingRow
              title="状态"
              description="F7 已开启 — 显示「耗尽」的账号实际仍可用，自动切号已暂停。"
              noBorder
            >
              <ShieldCheck
                className="w-5 h-5 text-emerald-500"
                strokeWidth={2.4}
              />
            </ISettingRow>
          ) : null}
        </Section>
        {/* F7-REMOVAL-END */}
      </div>

      {/* 导入配置弹窗 */}
      <IModalSheet
        open={importOpen}
        dismissable={!importBusy}
        maxWidth={620}
        onClose={() => {
          if (!importBusy) {
            setImportOpen(false);
            setImportText("");
          }
        }}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-[18px] font-bold text-ios-text dark:text-ios-textDark">
            导入配置
          </h3>
          <p className="mt-1 text-[12px] text-gray-500 dark:text-gray-400">
            粘贴 settings.json 全文（导出文件的内容）。导入后会立即覆盖当前配置。
          </p>
        </div>
        <div className="px-5 pb-3">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"concurrent_limit": 5, ...}'
            rows={12}
            spellCheck={false}
            autoFocus
            className="w-full resize-none rounded-[12px] border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#2c2c2e] px-3 py-2 text-[12px] font-mono text-ios-text dark:text-ios-textDark focus:outline-none focus:ring-2 focus:ring-ios-blue/30"
          />
        </div>
        <div className="px-5 pb-5 pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={importBusy}
            onClick={() => {
              setImportOpen(false);
              setImportText("");
            }}
            className="rounded-full bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] px-4 py-2 text-[12px] font-semibold text-ios-text dark:text-ios-textDark ios-btn disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={importBusy || !importText.trim()}
            onClick={submitImport}
            className="rounded-full bg-violet-500 hover:bg-violet-600 disabled:bg-violet-500/50 px-4 py-2 text-[12px] font-bold text-white ios-btn"
          >
            {importBusy ? "导入中…" : "导入"}
          </button>
        </div>
      </IModalSheet>
    </div>
  );
}

// ── 内部 Section wrapper ─────────────
function Section({
  title,
  icon,
  anchor,
  children,
}: {
  title: string;
  icon: string;
  anchor?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-health-anchor={anchor}>
      <h2 className="text-[13px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 px-2 flex items-center gap-2">
        <span className="text-[14px]">{icon}</span>
        {title}
      </h2>
      <div className="rounded-[18px] border border-black/[0.05] bg-white/70 overflow-hidden shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]">
        {children}
      </div>
    </section>
  );
}
