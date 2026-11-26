/**
 * Column type inference over string values. Deliberately conservative:
 * a column is only as strong as its weakest non-empty value — mixing
 * numbers with text degrades the whole column to 'string'.
 */

const NUM_RE = /^[+-]?(\d+(\.\d+)?|\.\d+)$/
const BOOL_SET = new Set(['true', 'false', 'yes', 'no', '是', '否', 'y', 'n', 't', 'f'])
const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}([T\s]\d{1,2}:\d{2}(:\d{2})?)?$/

export const isEmpty = (v) => v == null || String(v).trim() === ''

export function coerce(type, v) {
  const s = String(v).trim()
  if (type === 'number') return Number(s)
  if (type === 'boolean') return /^(true|yes|是|y|t|1)$/i.test(s)
  if (type === 'date') return Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
  return s
}

/** Infer the column type from raw string values (empty values ignored). */
export function inferType(values) {
  const nonEmpty = values.filter((v) => !isEmpty(v))
  if (!nonEmpty.length) return 'empty'
  let sawNumber = false
  let sawBool = false
  let sawDate = false
  for (const v of nonEmpty) {
    const s = String(v).trim()
    if (NUM_RE.test(s)) { sawNumber = true; continue }
    if (BOOL_SET.has(s.toLowerCase())) { sawBool = true; continue }
    if (DATE_RE.test(s) && !Number.isNaN(Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'))) { sawDate = true; continue }
    return 'string' // 任何一个非空值是普通字符串 → 整列降级
  }
  if (sawDate) return 'date'
  if (sawNumber) return 'number'
  if (sawBool) return 'boolean'
  return 'string'
}
