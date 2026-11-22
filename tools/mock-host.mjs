#!/usr/bin/env node
// 本地 mock 宿主：不装 DSH、不重启 DSH，也能在浏览器里看挂件与启动动画。
//
//   npm run mock            # 默认 http://127.0.0.1:8791
//   node tools/mock-host.mjs --port 9000 --scale 1.2 --intro 3000 --style starlit
//
// 页面里放了一个模拟 composer（挂件只在「主聊天界面」初始化），接口全部是本地桩数据：
//   size.json / balance.json / roles.json / bubble.json / audio.json …
// 改 assets/ 里的东西后刷新页面即可看到（宿主按 mtime 重读，这里直接读文件）。
// 只监听回环地址，不发任何外网请求。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(ROOT, 'assets')

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const PORT = Number(arg('port', '8791'))
const SCALE = Number(arg('scale', '1.2'))
const INTRO_MS = Number(arg('intro', '2600'))
const INTRO_STYLE = arg('style', 'veil')
const MENU = process.argv.includes('--menu')

const SIZE = {
  scale: SCALE, sound: false, vol: 0.9, soundSet: 'duck', usageMode: 'ledger', peakMode: 'default',
  bubbleOn: true, pressOn: true, turnCostOn: true, turnCostCloseMs: 5000,
  scrollGapOn: false, scrollGapPx: 17, menuBtnHide: false, codexStatsOn: false,
  introOn: true, introMs: INTRO_MS, introStyle: INTRO_STYLE,
  version: '1.0.0', versionLabel: 'v1.0.0',
}
const BALANCE = {
  ok: true,
  totalBalance: 128.42, currency: 'CNY',
  todayUsage: 3.21, todayUsageCurrency: 'CNY',
  bonusBalance: 10, rechargeBalance: 118.42,
  usageLabel: '本地估算', isPeak: false,
  peakNextChangeAt: Date.now() + 3600_000, peakHolidays: [],
  versionLabel: 'v1.0.0',
}
const STUBS = {
  '/dsh-shorekeeper/size.json': SIZE,
  '/dsh-shorekeeper/balance.json': BALANCE,
  '/dsh-shorekeeper/last-turn.json': { ok: true, seq: 0, turn: null, amount: null, tokens: null, ts: null },
  '/dsh-shorekeeper/wait.json': { ok: true, pending: null },
  '/dsh-shorekeeper/roles.json': { ok: true, roles: [{ id: 'default', name: '守岸人' }] },
  '/dsh-shorekeeper/bubble.json': { ok: true, version: 1, items: [] },
  '/dsh-shorekeeper/bubble-imgs.json': { ok: true, images: [] },
  '/dsh-shorekeeper/audio.json': { ok: true, fragments: [], groups: [] },
  '/dsh-shorekeeper/usage-settings.json': { ok: true, settings: {} },
  '/dsh-shorekeeper/usage-records.json': { ok: true, days: [], events: [] },
  '/dsh-shorekeeper/api-models.json': { ok: true, models: [] },
  '/dsh-shorekeeper/about.json': { ok: true, plugin: { version: '1.0.0', label: 'v1.0.0' }, build: {}, runtime: {} },
  '/dsh-shorekeeper/update-check.json': { ok: true },
}
const FILES = {
  '/dsh-shorekeeper/widget.js': 'shorekeeper-widget.js',
  '/dsh-shorekeeper/image.png': 'shorekeeper.png',
  '/dsh-shorekeeper/intro-image.png': 'shorekeeper-intro.png',
  '/dsh-shorekeeper/rua.gif': 'bubble-petpet.gif',
}
const MIME = { '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.gif': 'image/gif' }

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>守岸人挂件 · mock 宿主</title>
<style>
  html,body{margin:0;height:100%;background:#f7f9fd;font-family:system-ui}
  #root{padding:40px}
  textarea{width:520px;height:120px;border:1px solid #ccd;border-radius:8px;padding:10px}
  #errlog{position:fixed;left:8px;bottom:8px;z-index:2147483647;margin:0;padding:6px 8px;font-size:11px;
    background:#300;color:#fdd;max-width:60vw;white-space:pre-wrap;display:none}
</style></head><body>
<div id="root"><textarea placeholder="mock composer"></textarea></div>
<pre id="errlog"></pre>
<script>
window.__errs = []
window.addEventListener('error', function (e) { window.__errs.push('error: ' + (e.message || '') + ' @ ' + (e.filename || '')) })
window.addEventListener('unhandledrejection', function (e) { window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)) })
setInterval(function () {
  var p = document.getElementById('errlog')
  if (!p) return
  if (window.__errs.length) { p.style.display = 'block'; p.textContent = window.__errs.join('\\n') }
}, 300)
${MENU ? `setTimeout(function(){ var b = document.querySelector('.skdwv-menu-btn'); if (b) b.click() }, 3500)` : ''}
</script>
<script src="/dsh-shorekeeper/widget.js"></script>
</body></html>`

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://127.0.0.1').pathname
  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(PAGE)
    return
  }
  if (STUBS[p]) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(STUBS[p]))
    return
  }
  if (FILES[p]) {
    const file = path.join(ASSETS, FILES[p])
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(fs.readFileSync(file))
      return
    }
  }
  if (p.startsWith('/dsh-shorekeeper/sound/') || p === '/dsh-shorekeeper/audio-fragment') {
    res.writeHead(204)
    res.end()
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('not found: ' + p)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('守岸人挂件 mock 宿主：http://127.0.0.1:' + PORT + '/')
  console.log('  scale=' + SCALE + ' intro=' + INTRO_MS + 'ms style=' + INTRO_STYLE + (MENU ? ' （自动打开菜单）' : ''))
  console.log('  Ctrl+C 停止')
})
