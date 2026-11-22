#!/usr/bin/env node
// 宿主半区的冒烟测试：不启动 DSH，用最小 ctx 把 lib/index.js 挂起来，
// 直接调用它注册的路由处理器，验证「配置读写 / 导出导入 / 资源下发 / 旧数据迁移」。
// 全程只用临时 DSH_HOME，不碰真实数据。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
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
const cleanups = []

const webServer = {
  register(route) {
    routes.push(route)
    return () => {}
  },
  tapIndex(fn) {
    injections.push(fn)
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

function fakeReq(method, url, body) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1:12345' }
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
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers || {}) },
    end(chunk) { if (chunk !== undefined) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))) },
    get body() { return Buffer.concat(this.chunks).toString('utf8') },
    get bytes() { return Buffer.concat(this.chunks) },
  }
  return res
}

async function call(method, url, body) {
  const route = routes.find((r) => r.path === url && (!r.kind || r.kind === 'exact'))
  if (!route) throw new Error(`路由没有注册：${method} ${url}`)
  const req = fakeReq(method, url, body)
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
