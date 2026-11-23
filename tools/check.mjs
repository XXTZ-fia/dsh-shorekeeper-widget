#!/usr/bin/env node
// 自检：清单、版本、语法、资源引用、残留品牌词。
// 只读仓库文件，不联网、不写任何东西（退出码非 0 即失败）。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fails = []
const warns = []
const ok = []
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(ROOT, rel))

function fail(msg) { fails.push(msg) }
function warn(msg) { warns.push(msg) }
function pass(msg) { ok.push(msg) }

// 1) package.json
let pkg = null
try {
  pkg = JSON.parse(read('package.json'))
  pass('package.json 可解析')
} catch (err) {
  fail('package.json 解析失败：' + err.message)
}

if (pkg) {
  for (const key of ['name', 'version', 'main', 'icon', 'files', 'license']) {
    if (!pkg[key]) fail(`package.json 缺少字段 ${key}`)
  }
  if (pkg.name !== 'dsh-shorekeeper-widget') fail(`package.json name 应为 dsh-shorekeeper-widget，实际 ${pkg.name}`)
  if (!/^\d+\.\d+\.\d+$/.test(String(pkg.version))) fail(`版本号格式不对：${pkg.version}`)
  if (pkg.main && !exists(pkg.main)) fail(`main 指向的文件不存在：${pkg.main}`)
  if (pkg.icon && !exists(pkg.icon)) fail(`icon 指向的文件不存在：${pkg.icon}`)
  const patch = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
  if (!patch) fail('package.json 缺少 dsh.bundle.patch')
  else if (!exists(patch)) fail(`bundle patch 不存在：${patch}`)
  else {
    const yml = read(patch.replace(/^\.\//, ''))
    if (!yml.includes(`name: ${pkg.name}`)) fail(`cordis.patch.yml 里的 name 与包名不一致（应为 ${pkg.name}）`)
    if (!/^\s*-\s*insert:/m.test(yml)) fail('cordis.patch.yml 缺少 insert 段')
    pass('bundle 挂载声明与包名一致')
  }
  for (const f of pkg.files || []) {
    if (!/[*?]/.test(f) && !exists(f)) fail(`files 里列出的路径不存在：${f}`)
  }
}

// 2) 版本号与宿主常量一致
try {
  const host = read('lib/index.js')
  const m = /const BUILD_VERSION = '([^']+)'/.exec(host)
  if (!m) fail('lib/index.js 里找不到 BUILD_VERSION')
  else if (pkg && m[1] !== pkg.version) fail(`BUILD_VERSION(${m[1]}) 与 package.json(${pkg.version}) 不一致`)
  else pass('BUILD_VERSION 与 package.json 一致')
  const ch = /const BUILD_CHANNEL = '([^']+)'/.exec(host)
  if (!ch) warn('找不到 BUILD_CHANNEL')
} catch (err) {
  fail('读取 lib/index.js 失败：' + err.message)
}

// 3) 语法检查（stdio: 'ignore' —— 沙箱里子进程的管道可能被拒，这里只需要退出码）
const jsFiles = ['lib/index.js', 'lib/accounting.mjs', 'assets/shorekeeper-widget.js']
for (const rel of jsFiles) {
  if (!exists(rel)) { fail(`缺少文件：${rel}`); continue }
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'ignore' })
  if (r.status === 0) pass(`语法 OK：${rel}`)
  else fail(`语法错误：${rel}（退出码 ${r.status}${r.error ? '，' + r.error.code : ''}）`)
}

// 4) 宿主引用的随包资源必须存在
try {
  const host = read('lib/index.js')
  const re = /path\.join\(PACKAGE_ROOT, 'assets', '([^']+)'\)/g
  const seen = new Set()
  let m
  while ((m = re.exec(host))) seen.add(m[1])
  for (const name of seen) {
    if (!exists(path.join('assets', name))) fail(`宿主引用了不存在的资源：assets/${name}`)
  }
  if (seen.size) pass(`宿主引用的 ${seen.size} 个资源都在`)
} catch (err) {
  fail('检查资源引用失败：' + err.message)
}

// 5) 启动影片三件套必须在包内（路由能注册、文件缺了会在播放时才 404）
for (const f of ['assets/startup-hd.mp4', 'assets/startup-sd.mp4', 'assets/startup-poster.jpg']) {
  if (!exists(f)) fail(`缺少启动影片资源：${f}`)
  else {
    const size = fs.statSync(path.join(ROOT, f)).size
    if (size < 1024) fail(`启动影片资源过小（疑似空文件）：${f}`)
  }
}
if (['assets/startup-hd.mp4', 'assets/startup-sd.mp4', 'assets/startup-poster.jpg'].every((f) => exists(f))) {
  pass('启动影片三件套齐全')
}

// 6) 残留品牌词（旧版迁移表与「上游」说明里出现是允许的）
const BRAND_ALLOW = /LEGACY_|\.dshw-|whale-(roles|audio|bubble-imgs)|dsh-whale-widget|上游|迁移/
for (const rel of ['lib/index.js', 'assets/shorekeeper-widget.js', 'package.json', 'cordis.patch.yml', 'README.md']) {
  if (!exists(rel)) continue
  const lines = read(rel).split(/\r?\n/)
  lines.forEach((line, i) => {
    if (!/whale|鲸鱼/i.test(line)) return
    // 旧数据迁移 / 变更日志式的说明可以出现，其它一律视为漏改
    if (BRAND_ALLOW.test(line)) return
    warn(`${rel}:${i + 1} 仍有旧品牌词：${line.trim().slice(0, 90)}`)
  })
}

// 6) 关键路由必须在宿主侧注册
try {
  const host = read('lib/index.js')
  const required = [
    '/dsh-shorekeeper/widget.js',
    '/dsh-shorekeeper/size.json',
    '/dsh-shorekeeper/image.png',
    '/dsh-shorekeeper/export.json',
    '/dsh-shorekeeper/import.json',
  ]
  for (const r of required) {
    if (!host.includes(`path: '${r}'`)) fail(`宿主缺少路由：${r}`)
  }
  if (required.every((r) => host.includes(`path: '${r}'`))) pass('关键路由齐全')

  // 客户端引用的静态路由，宿主必须都有（只查完整的字面量，动态拼接的跳过）
  const client = read('assets/shorekeeper-widget.js')
  const used = new Set()
  const cre = /'(\/dsh-shorekeeper\/[a-z0-9.\-]+\.(?:json|js|png|gif|mp4|jpg))(?:\?[^']*)?'/gi
  let cm
  while ((cm = cre.exec(client))) used.add(cm[1])
  // 路由可以写成 path: '/x' ，也可以在 STARTUP_ASSETS 这类表里以键名出现（循环注册）
  const missing = [...used].filter((u) => !host.includes(`path: '${u}'`) && !host.includes(`'${u}'`))
  if (missing.length) fail('客户端引用了宿主未注册的路由：' + missing.join(', '))
  else if (used.size) pass(`客户端引用的 ${used.size} 条静态路由都已注册`)
} catch (err) {
  fail('检查路由失败：' + err.message)
}

// 输出
for (const s of ok) console.log('  ok   ' + s)
for (const s of warns) console.log('  warn ' + s)
for (const s of fails) console.log('  FAIL ' + s)
console.log('')
if (fails.length) {
  console.error(`自检失败：${fails.length} 项错误，${warns.length} 项警告`)
  process.exit(1)
}
console.log(`自检通过：${ok.length} 项检查，${warns.length} 项警告`)
