/**
 * RFC4180 CSV parser — zero dependencies, STREAMING by construction.
 *
 * CsvParser.push(chunk) accepts text in ARBITRARY chunk boundaries (a quoted
 * multi-line field can span pushes); rows() returns all completed records.
 * parseCsv(text, opts) is the convenience one-shot wrapper.
 *
 * RFC4180 rules implemented:
 *   - quoted fields may contain delimiter, CRLF and doubled "" quotes
 *   - quotes only "escape" inside quoted fields; a bare quote in an unquoted
 *     field is kept as a literal character (tolerated, recorded as warning)
 *   - records end at CRLF, LF, or EOF; a fully empty line is skipped
 *   - a final line without newline is still a record
 *
 * Tolerated deviations are collected in warnings (never silently dropped).
 */

const stripBom = (t) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t)

export class CsvParser {
  constructor({ delimiter = ',', hasHeader = true } = {}) {
    if (delimiter.length !== 1) throw new Error('delimiter 必须是单个字符')
    if (delimiter === '"') throw new Error('delimiter 不能是引号')
    this.delim = delimiter
    this.hasHeader = hasHeader
    this._rows = []
    this.warnings = []
    this._buf = ''        // unprocessed carry-over between pushes
    this._field = ''      // current field under construction
    this._record = []     // current record under construction
    this._inQuotes = false
    this._quotePending = false  // saw a quote inside quotes; may be escaped ""
    this._recordHadContent = false
    this._started = false
  }

  /** Feed an arbitrary chunk of CSV text. */
  push(chunk) {
    const text = this._buf + String(chunk ?? '')
    let i = 0
    this._buf = ''
    while (i < text.length) {
      const ch = text[i]

      if (this._quotePending) {
        // Previous char was a quote INSIDE a quoted field.
        this._quotePending = false
        if (ch === '"') { this._field += '"'; i++; continue }       // escaped ""
        if (ch === this.delim) { this._inQuotes = false; this._endField(); i++; continue }  // close + new field
        if (ch === '\n' || ch === '\r') { this._inQuotes = false; this._endField(); this._endRecord(); i++; continue }
        // Quote followed by junk → tolerate as literal, warn once per record
        this._warn('引号后跟了非定界字符(按字面处理)')
        this._inQuotes = false
        this._field += '"'
        continue // re-process ch as a normal char (do not i++)
      }

      if (this._inQuotes) {
        if (ch === '"') { this._quotePending = true; i++; continue }
        this._field += ch
        i++
        continue
      }

      if (ch === '"' && this._field === '') {
        this._inQuotes = true
        this._recordHadContent = true
        i++
        continue
      }
      if (ch === '"') this._warn('未引号字段中出现引号(按字面处理)')

      if (ch === this.delim) { this._endField(); i++; continue }

      if (ch === '\n') { this._endField(); this._endRecord(); i++; continue }
      if (ch === '\r') {
        if (i + 1 >= text.length) {
          // This chunk ends with a bare \r — it may be half of a split CRLF.
          this._buf = '\r'
          return
        }
        // CRLF ends the record; a bare CR also ends one (tolerated).
        this._endField(); this._endRecord()
        if (text[i + 1] === '\n') i++
        i++
        continue
      }

      this._field += ch
      this._recordHadContent = true
      i++
    }
    this._started = true
  }

  /** Finalize and return all records (empty lines skipped). */
  rows() {
    if (this._inQuotes) this._warn('文件结束时有未闭合的引号(按字面闭合)')
    this._endField()
    this._endRecord()
    return this._rows
  }

  _endField() {
    this._record.push(this._field)
    this._field = ''
  }

  _endRecord() {
    const isEmpty = this._record.length === 1 && this._record[0] === '' && !this._recordHadContent
    if (!isEmpty) this._rows.push(this._record)
    else if (this.rows.length || this._started) this._warn('跳过空行')
    this._record = []
    this._recordHadContent = false
    this._inQuotes = false
  }

  _warn(msg) {
    if (this.warnings.length < 50) this.warnings.push(msg)
  }
}

/** One-shot convenience: parse a whole CSV string. */
export function parseCsv(text, opts = {}) {
  const p = new CsvParser(opts)
  p.push(stripBom(String(text ?? '')))
  const rows = p.rows()
  return { rows, warnings: p.warnings }
}

/** Convenience: rows → { header, records (objects keyed by header) }. */
export function withHeader(rows) {
  if (!rows.length) return { header: [], records: [] }
  const [header, ...data] = rows
  return { header, records: data.map((r) => Object.fromEntries(header.map((h, i) => [h ?? `col${i + 1}`, r[i] ?? '']))) }
}
