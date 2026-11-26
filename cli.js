#!/usr/bin/env node
/**
 * csv-lens CLI — zero-dependency CSV profiler.
 *
 *   csv-lens <file.csv> [选项]
 *     --delimiter ,      定界符(单字符: , ; | \t)
 *     --rows N           预览行数(默认 10)
 *     --json             JSON 输出(完整 profile)
 *     --out FILE         写入文件
 *
 * 退出码:解析成功 0,失败 1。
 */
import fs from 'node:fs'
import { parseCsv, withHeader } from './lib/parse.js'
import { profile } from './lib/profile.js'

function usage() {
  return [
    'csv-lens — 零依赖 CSV 分析器',
    '',
    '用法:',
    '  csv-lens <file.csv> [选项]',
    '',
    '选项:',
    '  --delimiter D     定界符(默认 ,;支持 ; | \\t)',
    '  --rows N          预览数据行数(默认 10)',
    '  --json            JSON 输出完整 profile',
    '  --out FILE        写入文件',
  ].join('\n')
}

function parseArgv(argv) {
  const pos = []
  const opts = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++ }
      else opts[key] = true
    } else pos.push(a)
  }
  return { pos, opts }
}

function fmtNum(v) { return v == null ? '—' : String(v) }

export async function main(argv = process.argv.slice(2)) {
  const { pos, opts } = parseArgv(argv)
  const file = pos[0]
  if (!file || opts.help) { console.log(usage()); return file ? 0 : 1 }
  if (!fs.existsSync(file)) throw new Error(`文件不存在: ${file}`)

  const text = fs.readFileSync(file, 'utf8')
  const delimiter = opts.delimiter === '\\t' ? '\t' : (opts.delimiter ?? ',')
  const { rows, warnings } = parseCsv(text, { delimiter })
  const p = profile(rows, { previewRows: Number(opts.rows) || 10 })

  if (opts.json) {
    const text2 = JSON.stringify({ file, ...p, warnings }, null, 2)
    if (opts.out) fs.writeFileSync(opts.out, text2 + '\n', 'utf8')
    else console.log(text2)
    return 0
  }

  const lines = []
  lines.push(`csv-lens — ${file}`)
  lines.push(`数据行 ${p.rowCount} · 列 ${p.columnCount}${warnings.length ? ` · 解析警告 ${warnings.length}` : ''}`)
  lines.push('')
  lines.push('列概览:')
  lines.push(`  ${'列'.padEnd(10)} ${'类型'.padEnd(8)} 缺失  唯一  范围/计数`)
  for (const c of p.columns) {
    const range = c.type === 'number'
      ? `min=${fmtNum(c.min)} max=${fmtNum(c.max)} sum=${fmtNum(c.sum)}`
      : c.type === 'date'
        ? `${c.min ?? '—'} → ${c.max ?? '—'}`
        : c.type === 'boolean'
          ? `true×${fmtNum(c.true)} false×${fmtNum(c.false)}`
          : `${c.samples[0] ?? '—'}`.slice(0, 24)
    lines.push(`  ${c.name.padEnd(10)} ${c.type.padEnd(8)} ${String(c.missing).padEnd(5)} ${String(c.unique).padEnd(5)} ${range}`)
  }
  lines.push('')
  lines.push(`预览(前 ${p.preview.length - 1} 行数据):`)
  for (const row of p.preview) lines.push('  ' + row.map((v) => (String(v).includes(',') ? `"${v}"` : v)).join(delimiter))
  if (warnings.length) {
    lines.push('')
    lines.push('解析警告:')
    for (const w of warnings.slice(0, 10)) lines.push(`  ⚠ ${w}`)
  }
  const report = lines.join('\n')
  if (opts.out) fs.writeFileSync(opts.out, report + '\n', 'utf8')
  else console.log(report)
  return 0
}

if (process.argv[1] && process.argv[1].endsWith('cli.js')) {
  main().then(
    (code) => { process.exitCode = code },
    (e) => { console.error(`错误: ${e.message}`); process.exitCode = 1 },
  )
}
