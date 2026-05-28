// scripts/screenshot/capture.mjs
//
// 用 playwright 把 vite dev (VITE_MOCK_BRIDGE=1) 启的 React 渲染截 6 张图,
// 替换 docs/images/preview-*.png。
//
// 前置:vite 已在 :3457 跑;chromium 已通过 playwright install 装好。

import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { resolve } from 'path'

const BASE = 'http://127.0.0.1:3457/'
const OUT_DIR = resolve(import.meta.dirname, '../../docs/images')
mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORT = { width: 1440, height: 900 }
const DEVICE_SCALE = 2  // retina, 截出来更清晰

// 6 张图任务:每张指定 sidebar 点哪个 tab + 截图前等多久 + 输出文件名
const SHOTS = [
  { tab: 'Dashboard', file: 'preview-dashboard.png', wait: 2000 },
  { tab: 'Accounts',  file: 'preview-accounts.png',  wait: 2500 },
  { tab: 'Providers', file: 'preview-providers.png', wait: 1800 },
  { tab: 'Relay',     file: 'preview-relay.png',     wait: 1500 },
  { tab: 'Usage',     file: 'preview-usage.png',     wait: 2500 },
  { tab: 'Settings',  file: 'preview-settings.png',  wait: 2000 },
  { tab: 'Cleanup',   file: 'preview-cleanup.png',   wait: 1800 },
  { tab: 'Help',      file: 'preview-help.png',      wait: 1500 },
  { tab: 'About',     file: 'preview-about.png',     wait: 1500 },
]

async function setActiveTab(page, tab) {
  await page.evaluate((t) => {
    const store = window.__MAIN_VIEW_STORE__
    if (store) store.getState().setActiveTab(t)
  }, tab)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    colorScheme: 'light',
  })
  const page = await ctx.newPage()

  console.log(`[capture] 打开 ${BASE}`)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__mockBridgeInstalled === true, { timeout: 5000 })
  await page.waitForFunction(() => window.__MAIN_VIEW_STORE__ != null, { timeout: 5000 })
  // 等首屏数据加载完
  await page.waitForTimeout(2500)

  for (const shot of SHOTS) {
    console.log(`[capture] → ${shot.tab}`)
    await setActiveTab(page, shot.tab)
    await page.waitForTimeout(shot.wait)
    const out = resolve(OUT_DIR, shot.file)
    await page.screenshot({ path: out, fullPage: false })
    console.log(`        saved ${out}`)
  }

  await browser.close()
  console.log('[capture] 完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
