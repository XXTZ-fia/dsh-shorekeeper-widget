#!/usr/bin/env node
// 生成发布包：dist/dsh-shorekeeper-widget-v<version>.zip
// 自带最小 ZIP 写入器（deflate），不依赖系统 zip / 7z，Windows / macOS / Linux 行为一致。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const ZIP_ROOT = 'dsh-shorekeeper-widget' // 解压后得到这一层，里面就是插件包
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(DIST, `${pkg.name}-v${pkg.version}.zip`)

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---------- 时间 ----------
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f)
  const day = (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
  return { time, day }
}

// ---------- 收集文件 ----------
function walk(dir, base = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(abs, rel))
    else if (e.isFile()) out.push({ abs, rel })
  }
  return out
}

const entries = []
// package.json 必须始终在包里（npm 也隐式包含它），它不是 files 列表里的条目。
const includeList = ['package.json', ...(pkg.files || []).filter((f) => f !== 'package.json')]
for (const item of includeList) {
  const abs = path.join(ROOT, item)
  if (!fs.existsSync(abs)) { console.error(`✗ files 里列出的路径不存在：${item}`); process.exit(1) }
  const st = fs.statSync(abs)
  if (st.isDirectory()) {
    for (const f of walk(abs, item)) entries.push(f)
  } else {
    entries.push({ abs, rel: item })
  }
}
entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))

// ---------- 写 ZIP ----------
const chunks = []
const central = []
let offset = 0

for (const entry of entries) {
  const data = fs.readFileSync(entry.abs)
  const crc = crc32(data)
  const deflated = zlib.deflateRawSync(data, { level: 9 })
  const useDeflate = deflated.length < data.length
  const body = useDeflate ? deflated : data
  const method = useDeflate ? 8 : 0
  const name = Buffer.from(`${ZIP_ROOT}/${entry.rel}`, 'utf8')
  const st = fs.statSync(entry.abs)
  const { time, day } = dosDateTime(st.mtime)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)      // version needed
  local.writeUInt16LE(0x0800, 6)  // UTF-8 文件名
  local.writeUInt16LE(method, 8)
  local.writeUInt16LE(time, 10)
  local.writeUInt16LE(day, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(body.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  local.writeUInt16LE(0, 28)

  chunks.push(local, name, body)

  const cd = Buffer.alloc(46)
  cd.writeUInt32LE(0x02014b50, 0)
  cd.writeUInt16LE(20, 4)         // version made by
  cd.writeUInt16LE(20, 6)         // version needed
  cd.writeUInt16LE(0x0800, 8)
  cd.writeUInt16LE(method, 10)
  cd.writeUInt16LE(time, 12)
  cd.writeUInt16LE(day, 14)
  cd.writeUInt32LE(crc, 16)
  cd.writeUInt32LE(body.length, 20)
  cd.writeUInt32LE(data.length, 24)
  cd.writeUInt16LE(name.length, 28)
  cd.writeUInt16LE(0, 30)         // extra
  cd.writeUInt16LE(0, 32)         // comment
  cd.writeUInt16LE(0, 34)         // disk
  cd.writeUInt16LE(0, 36)         // internal attr
  cd.writeUInt32LE(0, 38)         // external attr
  cd.writeUInt32LE(offset, 42)
  central.push(Buffer.concat([cd, name]))

  offset += local.length + name.length + body.length
}

const centralBuf = Buffer.concat(central)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(0, 4)
eocd.writeUInt16LE(0, 6)
eocd.writeUInt16LE(entries.length, 8)
eocd.writeUInt16LE(entries.length, 10)
eocd.writeUInt32LE(centralBuf.length, 12)
eocd.writeUInt32LE(offset, 16)
eocd.writeUInt16LE(0, 20)

fs.mkdirSync(DIST, { recursive: true })
const zipBuf = Buffer.concat([...chunks, centralBuf, eocd])
fs.writeFileSync(OUT, zipBuf)

// ---------- 校验和 ----------
const sha = crypto.createHash('sha256').update(zipBuf).digest('hex')
fs.writeFileSync(OUT + '.sha256', `${sha}  ${path.basename(OUT)}\n`, 'utf8')

console.log(`✓ ${path.relative(ROOT, OUT)}`)
console.log(`  ${entries.length} 个文件，${(zipBuf.length / 1024 / 1024).toFixed(2)} MB`)
console.log(`  sha256 ${sha}`)
