// 状态变化图 — 切到 Dashboard 但 routeMode=providers / 命令面板打开 / 任务抽屉 / 暗色主题
import { chromium } from 'playwright'
import { resolve } from 'path'

const BASE = 'http://127.0.0.1:3457/'
const OUT_DIR = resolve(import.meta.dirname, '../../docs/images')
const VIEWPORT = { width: 1440, height: 900 }
const DEVICE_SCALE = 2

const SHOTS = [
  {
    file: 'preview-dashboard-providers.png',
    setup: async (page) => {
      await page.evaluate(() => {
        const settings = window.__SETTINGS_STORE__
        if (settings) {
          const cur = settings.getState().settings
          settings.setState({ settings: { ...cur, mitm_route_mode: 'providers' } })
        }
        window.__MAIN_VIEW_STORE__.getState().setActiveTab('Dashboard')
      })
    },
    wait: 1800,
  },
  {
    file: 'preview-command-palette.png',
    setup: async (page) => {
      await page.evaluate(() => {
        window.__MAIN_VIEW_STORE__.getState().setActiveTab('Dashboard')
      })
      await page.waitForTimeout(800)
      // ⌘K 触发命令面板
      await page.keyboard.press('Meta+k')
    },
    wait: 600,
  },
  {
    file: 'preview-dark-mode.png',
    setup: async (page) => {
      await page.evaluate(() => {
        document.documentElement.classList.add('dark')
        document.documentElement.setAttribute('data-theme', 'dark')
        window.__MAIN_VIEW_STORE__.getState().setActiveTab('Dashboard')
      })
    },
    wait: 1500,
  },
  {
    file: 'preview-providers-import.png',
    setup: async (page) => {
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark')
        document.documentElement.removeAttribute('data-theme')
        window.__MAIN_VIEW_STORE__.getState().setActiveTab('Providers')
      })
      await page.waitForTimeout(800)
      // 点「批量导入」按钮
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'))
        const target = btns.find(b => (b.textContent ?? '').trim().includes('批量导入'))
        if (target) target.click()
      })
    },
    wait: 800,
  },
]

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE, colorScheme: 'light' })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__mockBridgeInstalled === true, { timeout: 5000 })
await page.waitForFunction(() => window.__MAIN_VIEW_STORE__ != null, { timeout: 5000 })
await page.waitForTimeout(2500)

for (const shot of SHOTS) {
  console.log(`[capture-states] → ${shot.file}`)
  await shot.setup(page)
  await page.waitForTimeout(shot.wait)
  const out = resolve(OUT_DIR, shot.file)
  await page.screenshot({ path: out, fullPage: false })
  console.log(`        saved ${out}`)
}

await browser.close()
console.log('[capture-states] 完成')
