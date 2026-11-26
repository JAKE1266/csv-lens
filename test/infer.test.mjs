/** Type inference + profiler tests. */
import assert from 'node:assert/strict'
import { inferType, coerce } from '../lib/infer.js'
import { profile } from '../lib/profile.js'
import { parseCsv } from '../lib/parse.js'

let n = 0
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); n++ }
  catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
}

test('inferType: number (int/float/negative)', () => {
  assert.equal(inferType(['1', '-2.5', '+3']), 'number')
  assert.equal(inferType(['1', '2', '.5']), 'number')
})

test('inferType: boolean variants', () => {
  assert.equal(inferType(['true', 'false']), 'boolean')
  assert.equal(inferType(['是', '否']), 'boolean')
  assert.equal(inferType(['Y', 'N', 'y']), 'boolean')
})

test('inferType: ISO dates', () => {
  assert.equal(inferType(['2026-11-21', '2026-11-22']), 'date')
  assert.equal(inferType(['2026-11-21 08:00:00']), 'date')
})

test('inferType: any plain string degrades the column', () => {
  assert.equal(inferType(['1', '2', 'abc']), 'string')
  assert.equal(inferType(['2026-11-21', '昨天']), 'string')
})

test('inferType: empty-only column is empty', () => {
  assert.equal(inferType(['', '  ', '']), 'empty')
  assert.equal(inferType([]), 'empty')
})

test('coerce: number/boolean/date conversions', () => {
  assert.equal(coerce('number', '3.5'), 3.5)
  assert.equal(coerce('boolean', '是'), true)
  assert.equal(coerce('boolean', 'no'), false)
  assert.equal(coerce('date', '2026-11-21'), Date.parse('2026-11-21T00:00:00Z'))
})

const CSV = [
  'id,name,active,joined,score,notes',
  '1,Alice,true,2026-01-15,95,hello',
  '2,Bob,false,2026-02-20,87,',
  '3,Carol,true,2026-03-05,,world',
  ',Dave,true,2026-04-10,72,hello',
].join('\n')

test('profile: per-column stats over parsed rows', () => {
  const { rows } = parseCsv(CSV)
  const p = profile(rows)
  assert.equal(p.rowCount, 4)
  assert.equal(p.columnCount, 6)
  const byName = Object.fromEntries(p.columns.map((c) => [c.name, c]))
  // id: number
  assert.equal(byName.id.type, 'number')
  assert.equal(byName.id.missing, 1)
  assert.equal(byName.id.min, 1)
  assert.equal(byName.id.max, 3)
  // name: string with unique count
  assert.equal(byName.name.type, 'string')
  assert.equal(byName.name.unique, 4)
  assert.deepEqual(byName.name.samples, ['Alice', 'Bob', 'Carol'])
  // active: boolean
  assert.equal(byName.active.type, 'boolean')
  assert.equal(byName.active.true, 3)
  assert.equal(byName.active.false, 1)
  // joined: date with min/max
  assert.equal(byName.joined.type, 'date')
  assert.equal(byName.joined.min, new Date('2026-01-15T00:00:00Z').toISOString())
  // score: number with missing
  assert.equal(byName.score.missing, 1)
  assert.equal(byName.score.max, 95)
})

test('profile: preview capped at 10 data rows (+header)', () => {
  const rows = [['h'], ...Array.from({ length: 25 }, (_, i) => [`v${i}`])]
  const p = profile(rows)
  assert.equal(p.rowCount, 25)
  assert.equal(p.preview.length, 11)
})

test('profile: empty CSV → zero rows, no columns', () => {
  const p = profile(parseCsv('').rows)
  assert.equal(p.rowCount, 0)
  assert.deepEqual(p.columns, [])
})

test('profile: duplicate header names still profile both columns', () => {
  const { rows } = parseCsv('v,v\n1,2')
  const p = profile(rows)
  assert.equal(p.columns.length, 2)
  assert.deepEqual(p.columns.map((c) => c.min), [1, 2])
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
