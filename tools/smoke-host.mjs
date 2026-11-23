#!/usr/bin/env node
// 宿主半区的冒烟测试：不启动 DSH，用最小 ctx 把 lib/index.js 挂起来，
// 直接调用它注册的路由处理器，验证「配置读写 / 导出导入 / 资源下发 / 旧数据迁移」。
// 全程只用临时 DSH_HOME，不碰真实数据。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skdw-smoke-'))
process.env.DSH_HOME = tmp

// 预置一份「旧版」数据，用来验证自动迁移
fs.writeFileSync(path.join(tmp, '.dshw-size.json'), JSON.stringify({ scale: 1.2, sound: false }), 'utf8')
fs.mkdirSync(path.join(tmp, 'whale-roles'), { recursive: true })
fs.writeFileSync(path.join(tmp, 'whale-roles', 'roles.json'), JSON.stringify({ version: 1, roles: [] }), 'utf8')

const routes = []
const injections = []
const indexTaps = []
const cleanups = []

const webServer = {
  register(route) {
    routes.push(route)
    return () => {}
  },
  tapIndex(fn) {
    indexTaps.push(fn)
    return () => {}
  },
}

const ctx = {
  webServer,
  credentials: {
    get: async () => null,
    set: async () => {},
    delete: async () => {},
  },
  connection: { requestRejection: () => null },
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  on() { return () => {} },
  emit() { return false },
  get(name) {
    if (name === 'connection') return ctx.connection
    if (name === 'credentials') return ctx.credentials
    if (name === 'deepseekAccount') return null
    return null
  },
  effect(fn) {
    const d = fn()
    if (typeof d === 'function') cleanups.push(d)
    return () => {}
  },
}

const root = {
  effect(fn) {
    const d = fn()
    if (typeof d === 'function') cleanups.push(d)
    return () => {}
  },
  on(event, handler) {
    if (event === 'webserver/index-inject') {
      const table = []
      handler(table)
      injections.push(table)
    }
    return () => {}
  },
  inject(names, cb) {
    cb(ctx)
    return () => {}
  },
}

function fakeReq(method, url, body, headers) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = Object.assign({ host: '127.0.0.1:12345' }, headers || {})
  req.destroy = () => {}
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(body, 'utf8'))
      req.emit('end')
    })
  } else {
    process.nextTick(() => req.emit('end'))
  }
  return req
}

function fakeRes() {
  // 必须是可写流：影片路由用 fs.createReadStream(...).pipe(res)
  const chunks = []
  const res = new Writable({
    write(chunk, enc, cb) { chunks.push(Buffer.from(chunk)); cb() },
  })
  res.statusCode = 200
  res.headers = {}
  res.writeHead = function (code, headers) {
    this.statusCode = code
    Object.assign(this.headers, headers || {})
    return this
  }
  Object.defineProperty(res, 'body', { get() { return Buffer.concat(chunks).toString('utf8') } })
  Object.defineProperty(res, 'bytes', { get() { return Buffer.concat(chunks) } })
  return res
}

function callAndWait(method, url, body, headers) {
  return new Promise((resolve) => {
    call(method, url, body, headers).then((res) => {
      if (res.writableFinished) return resolve(res)
      res.on('finish', () => resolve(res))
      res.on('close', () => resolve(res))
    })
  })
}

async function call(method, url, body, headers) {
  const route = routes.find((r) => r.path === url && (!r.kind || r.kind === 'exact'))
  if (!route) throw new Error(`路由没有注册：${method} ${url}`)
  const req = fakeReq(method, url, body, headers)
  const res = fakeRes()
  await route.handler(req, res)
  return res
}

const checks = []
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail })
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + (detail || '')}`)
}

const mod = await import(pathToFileURL(path.join(ROOT, 'lib', 'index.js')).href)
mod.default.apply(root)

console.log('临时 DSH_HOME:', tmp)

// 1) 旧数据迁移
check('旧 .dshw-size.json 已迁移为 .skdw-size.json', fs.existsSync(path.join(tmp, '.skdw-size.json')))
check('旧 whale-roles 目录已迁移', fs.existsSync(path.join(tmp, 'shorekeeper-roles', 'roles.json')))

// 2) 默认配置
let r = await call('GET', '/dsh-shorekeeper/size.json')
let d = JSON.parse(r.body)
check('GET size.json 200', r.statusCode === 200)
check('默认 introOn = true', d.introOn === true, JSON.stringify(d))
check('默认 introMs = 2600', d.introMs === 2600, JSON.stringify(d))
check('默认 introStyle = veil', d.introStyle === 'veil', JSON.stringify(d))
check('迁移来的 scale 生效', d.scale === 1.2, String(d.scale))

// 3) 写入启动动画设置
r = await call('PUT', '/dsh-shorekeeper/size.json', JSON.stringify({
  scale: 1.2, introOn: false, introMs: 4200, introStyle: 'starlit',
}))
d = JSON.parse(r.body)
check('PUT size.json ok', d.ok === true, r.body)
check('PUT 后 introOn = false', d.introOn === false, r.body)
check('PUT 后 introMs = 4200', d.introMs === 4200, r.body)
check('PUT 后 introStyle = starlit', d.introStyle === 'starlit', r.body)
const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, '.skdw-size.json'), 'utf8'))
check('落盘文件带 intro 三键', onDisk.introOn === false && onDisk.introMs === 4200 && onDisk.introStyle === 'starlit')

// 4) 缺字段不洗默认（issue #97 约定）
r = await call('PUT', '/dsh-shorekeeper/size.json', JSON.stringify({ scale: 1.2 }))
d = JSON.parse(r.body)
check('缺字段沿用旧值（introOn 仍 false）', d.introOn === false, r.body)
check('缺字段沿用旧值（introMs 仍 4200）', d.introMs === 4200, r.body)

// 5) 导出 / 导入
r = await call('GET', '/dsh-shorekeeper/export.json')
d = JSON.parse(r.body)
check('GET export.json ok', d.ok === true && d.sections && d.sections.settings)
check('导出含启动动画设置', d.sections.settings.introMs === 4200, JSON.stringify(d.sections.settings || {}))
check('导出不含密钥字段', !/apiKey|api_key|sk-[A-Za-z0-9]{8}/.test(r.body))

const imported = {
  ok: true,
  sections: {
    settings: { scale: 1.5, introOn: true, introMs: 1500, introStyle: 'minimal' },
    bubble: { version: 9 },
  },
}
r = await call('POST', '/dsh-shorekeeper/import.json', JSON.stringify(imported))
d = JSON.parse(r.body)
check('POST import.json ok', d.ok === true, r.body)
check('导入 reported sections', Array.isArray(d.imported) && d.imported.includes('settings'), r.body)
r = await call('GET', '/dsh-shorekeeper/size.json')
d = JSON.parse(r.body)
check('导入后 introMs = 1500', d.introMs === 1500, r.body)
check('导入前留了 .before-import 备份', fs.existsSync(path.join(tmp, '.skdw-size.json.before-import')))

// 6) 资源与脚本下发
r = await call('GET', '/dsh-shorekeeper/widget.js')
check('GET widget.js 200', r.statusCode === 200)
check('widget.js 含启动动画代码', r.body.includes('skdwIntroPlay'))
r = await call('GET', '/dsh-shorekeeper/image.png')
check('GET image.png 200 且是 PNG', r.statusCode === 200 && r.bytes[0] === 0x89 && r.bytes[1] === 0x50, String(r.statusCode))
r = await call('GET', '/dsh-shorekeeper/rua.gif')
check('GET rua.gif 200（用 petpet 回退）', r.statusCode === 200, String(r.statusCode))

// 7) 注入行存在
const table = injections.find((x) => Array.isArray(x))
check('注册了桌面端注入行', !!table && JSON.stringify(table).includes('/dsh-shorekeeper/widget.js'))
check('桌面端注入行里带启动黑幕', !!table && JSON.stringify(table).includes('skdw-boot-veil'))
if (Array.isArray(table)) {
  check('黑幕行排在挂件行之前', String(table[0] && table[0].text || '').includes('skdw-boot-veil'))
}

// 7b) web 侧 tapIndex：黑幕要内联进 <head>，widget.js 仍挂在 </body> 前，且幂等
if (indexTaps.length) {
  const sample = '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><div id="root"></div></body></html>'
  let out = sample
  for (const fn of indexTaps) out = fn(out) || out
  check('tapIndex 把黑幕注入到 <head> 之后', /<head[^>]*><script>[^<]*skdw-boot-veil/.test(out), out.slice(0, 120))
  check('tapIndex 仍注入 widget.js', out.includes('/dsh-shorekeeper/widget.js'))
  const twice = (indexTaps[0] || ((h) => h))(out) || out
  check('tapIndex 幂等（黑幕只出现一次）', (twice.match(/id="skdw-boot-veil"/g) || []).length === 1, String((twice.match(/id="skdw-boot-veil"/g) || []).length))
}

// 8) 启动影片：海报、整片、Range、HEAD
r = await callAndWait('GET', '/dsh-shorekeeper/startup-poster.jpg')
check('GET 海报 200 且是 JPEG', r.statusCode === 200 && r.bytes[0] === 0xff && r.bytes[1] === 0xd8, String(r.statusCode))

r = await callAndWait('GET', '/dsh-shorekeeper/startup-hd.mp4', undefined, { range: 'bytes=0-1023' })
check('Range 请求返回 206', r.statusCode === 206, String(r.statusCode))
check('Range 返回 1024 字节', r.bytes.length === 1024, String(r.bytes.length))
check('Content-Range 正确', /^bytes 0-1023\/\d+$/.test(String(r.headers['Content-Range'])), String(r.headers['Content-Range']))
check('支持 Range 标记', r.headers['Accept-Ranges'] === 'bytes', String(r.headers['Accept-Ranges']))
check('影片带长缓存', /max-age=\d+/.test(String(r.headers['Cache-Control'])), String(r.headers['Cache-Control']))

r = await callAndWait('HEAD', '/dsh-shorekeeper/startup-hd.mp4')
check('HEAD 影片 200', r.statusCode === 200, String(r.statusCode))
const hdSize = Number(r.headers['Content-Length'])
check('HEAD 带 Content-Length 且与文件一致', hdSize > 1024 * 1024, String(hdSize))

r = await callAndWait('GET', '/dsh-shorekeeper/startup-sd.mp4')
check('GET 流畅档整片 200', r.statusCode === 200 && r.bytes.length === Number(fs.readFileSync(path.join(ROOT, 'assets', 'startup-sd.mp4')).length), String(r.statusCode))

// 9) 启动编排资源：样式 / 线稿 / 标识
r = await callAndWait('GET', '/dsh-shorekeeper/splash.css')
check('GET splash.css 200', r.statusCode === 200, String(r.statusCode))
check('splash.css 含 skf-root', r.body.includes('.skf-root'))
r = await callAndWait('GET', '/dsh-shorekeeper/sketch-paths.json')
check('GET sketch-paths.json 200', r.statusCode === 200, String(r.statusCode))
let sketch = null
try { sketch = JSON.parse(r.body) } catch (err) {}
check('线稿 443 条', !!sketch && Array.isArray(sketch.paths) && sketch.paths.length === 443, sketch ? String(sketch.paths.length) : 'parse fail')
r = await callAndWait('GET', '/dsh-shorekeeper/logo-parts.json')
let logo = null
try { logo = JSON.parse(r.body) } catch (err) {}
check('标识 24 个部件', Array.isArray(logo) && logo.length === 24, logo ? String(logo.length) : 'parse fail')

// 10) 启动影片的配置项
r = await call('GET', '/dsh-shorekeeper/size.json')
d = JSON.parse(r.body)
check('默认 introQuality = auto', d.introQuality === 'auto', JSON.stringify(d.introQuality))
check('默认 introText = true', d.introText === true, JSON.stringify(d.introText))
r = await call('PUT', '/dsh-shorekeeper/size.json', JSON.stringify({ scale: 1.2, introQuality: 'sd', introText: false }))
d = JSON.parse(r.body)
check('PUT 后 introQuality = sd', d.introQuality === 'sd', r.body)
check('PUT 后 introText = false', d.introText === false, r.body)
const onDisk2 = JSON.parse(fs.readFileSync(path.join(tmp, '.skdw-size.json'), 'utf8'))
check('落盘文件带画质/文字键', onDisk2.introQuality === 'sd' && onDisk2.introText === false)

// 清理
for (const fn of cleanups) { try { fn() } catch (err) {} }
try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (err) {}

const failed = checks.filter((c) => !c.ok)
console.log('')
if (failed.length) {
  console.error(`冒烟测试失败：${failed.length}/${checks.length}`)
  process.exit(1)
}
console.log(`冒烟测试通过：${checks.length} 项全部通过`)
