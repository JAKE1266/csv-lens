/**
 * Profiler — rows (from CsvParser, first row = header) → per-column stats:
 *   { name, type, missing, unique, min, max, samples }
 * plus a capped preview of the raw rows.
 */
import { inferType, coerce } from './infer.js'
import { isEmpty } from './infer.js'

const SAMPLE_COUNT = 3
const PREVIEW_ROWS = 10

export function profile(rows, { previewRows = PREVIEW_ROWS } = {}) {
  if (!rows.length) return { rowCount: 0, columns: [], preview: [] }
  const [header, ...data] = rows
  const names = header.map((h, i) => (String(h ?? '').trim() || `col${i + 1}`))

  const columns = names.map((name, colIdx) => {
    const values = data.map((r) => r[colIdx] ?? '')
    const type = inferType(values)
    const missing = values.filter((v) => isEmpty(v)).length
    const nonEmpty = values.filter((v) => !isEmpty(v)).map((v) => String(v).trim())
    const unique = new Set(nonEmpty).size
    const col = { name, type, missing, unique, samples: nonEmpty.slice(0, SAMPLE_COUNT) }

    if (type === 'number') {
      const nums = nonEmpty.map((v) => Number(v))
      col.min = Math.min(...nums)
      col.max = Math.max(...nums)
      col.sum = nums.reduce((a, b) => a + b, 0)
    } else if (type === 'date') {
      const ms = nonEmpty.map((v) => coerce('date', v)).filter((x) => !Number.isNaN(x))
      if (ms.length) {
        col.min = new Date(Math.min(...ms)).toISOString()
        col.max = new Date(Math.max(...ms)).toISOString()
      }
    } else if (type === 'boolean') {
      col.true = nonEmpty.filter((v) => coerce('boolean', v) === true).length
      col.false = nonEmpty.length - col.true
    }
    return col
  })

  return {
    rowCount: data.length,
    columnCount: names.length,
    columns,
    preview: rows.slice(0, previewRows + 1), // header + up to N data rows
    totalRows: data.length,
  }
}
