/**
 * E2E: CLI (temp CSV fixtures, text/JSON/--out) + HTTP server (POST /api/profile).
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let n = 0
const pending = []
const test = (name, fn) => {
  pending.push(async () => {
    try { await fn(); console.log(`ok   ${name}`); n++ }
    catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
  })
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-lens-e2e-'))
const CSV_FILE = path.join(dir, 'data.csv')
fs.writeFileSync(CSV_FILE, [
  'id,name,active,joined,score,notes',
  '1,Alice,true,2026-01-15,95,hello',
  '2,Bob,false,2026-02-20,87',
  '3,"Carol, PhD",true,2026-03-05,',
  ',Dave,true,2026-04-10,72',
].join('\n'), 'utf8')

// ---- CLI ----
const runCli = (args) => spawnSync(process.execPath, [path.join(ROOT, 'cli.js'), ...args], { encoding: 'utf8' })

test('CLI 文本摘要:行数/列数/类型/范围', () => {
  const r = runCli([CSV_FILE])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /数据行 4 · 列 6/)
  assert.match(r.stdout, /id\s+number/)
  assert.match(r.stdout, /name\s+string/)
  assert.match(r.stdout, /active\s+boolean/)
  assert.match(r.stdout, /joined\s+date/)
  assert.match(r.stdout, /min=1 max=3/)
  // 引号字段 "Carol, PhD" 不碎裂
  assert.ok(r.stdout.split('\n').some((l) => l.includes('Carol')), '引号字段保持完整')
})

test('CLI --json 输出完整 profile', () => {
  const r = runCli([CSV_FILE, '--json'])
  assert.equal(r.status, 0)
  const d = JSON.parse(r.stdout)
  assert.equal(d.rowCount, 4)
  assert.equal(d.columns.find((c) => c.name === 'joined').type, 'date')
  assert.ok(d.warnings.length === 0)
})

test('CLI --out 写入 JSON 文件;--delimiter 制表符', () => {
  const out = path.join(dir, 'profile.json')
  const r = runCli([CSV_FILE, '--json', '--out', out])
  assert.equal(r.status, 0)
  assert.ok(fs.existsSync(out))
  const tab = path.join(dir, 'tab.tsv')
  fs.writeFileSync(tab, 'a\tb\n1\t2', 'utf8')
  const r2 = runCli([tab, '--delimiter', '\\t'])
  assert.equal(r2.status, 0)
  assert.match(r2.stdout, /列 2/)
})

test('CLI 文件不存在报错', () => {
  const r = runCli([path.join(dir, 'nope.csv')])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /不存在/)
})

// ---- server E2E ----
function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)) })
  })
}
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGKILL')
}

test('server:POST /api/profile + 仪表盘 + 校验', async () => {
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  const logs = []
  child.stdout.on('data', (d) => logs.push(d.toString()))
  child.stderr.on('data', (d) => logs.push(d.toString()))
  try {
    let up = false
    for (let i = 0; i < 40 && !up; i++) {
      try { up = (await fetch(`${base}/api/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).ok || true } catch { await sleep(250) }
    }
    const dash = await fetch(`${base}/`)
    assert.equal(dash.status, 200)
    assert.match(await dash.text(), /csv-lens/)

    const good = await fetch(`${base}/api/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: fs.readFileSync(CSV_FILE, 'utf8'), delimiter: ',' }),
    })
    assert.equal(good.status, 200)
    const d = await good.json()
    assert.equal(d.rowCount, 4)
    assert.equal(d.columns.length, 6)
    assert.equal(d.columns.find((c) => c.name === 'joined').type, 'date')
    assert.ok(d.records.length >= 4)
    assert.ok(!d.warnings.length)

    const quoted = await fetch(`${base}/api/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'a,b\n"x\ny",1' }),
    })
    const dq = await quoted.json()
    assert.equal(dq.rowCount, 1, '多行引号字段算一条记录')

    const noContent = await fetch(`${base}/api/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    assert.equal(noContent.status, 400)

    const badDelim = await fetch(`${base}/api/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'a,b', delimiter: ';;' }),
    })
    assert.equal(badDelim.status, 400)
  } finally {
    killTree(child)
    await sleep(400)
  }
})

for (const p of pending) await p()
fs.rmSync(dir, { recursive: true, force: true })
console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
