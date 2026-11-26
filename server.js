/**
 * csv-lens server — zero dependency. POST /api/profile + single-file table view.
 *
 *   node server.js          → http://127.0.0.1:8799
 *   PORT=9000 node server.js
 *
 * The UI only accepts PASTED CSV text (no arbitrary file paths from clients).
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, withHeader } from './lib/parse.js'
import { profile } from './lib/profile.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 8800

const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}
const readBody = (req, limit = 8e6) => new Promise((resolve, reject) => {
  let buf = ''
  req.on('data', (c) => { buf += c; if (buf.length > limit) reject(new Error('body too large')) })
  req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}) } catch { reject(new Error('invalid JSON')) } })
  req.on('error', reject)
})

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`)
  try {
    if (u.pathname === '/api/profile' && req.method === 'POST') {
      const body = await readBody(req)
      if (typeof body.content !== 'string') return json(res, 400, { error: '需要 content 字段(CSV 文本)' })
      const delimiter = body.delimiter === '\\t' ? '\t' : (body.delimiter ?? ',')
      if (delimiter.length !== 1) return json(res, 400, { error: 'delimiter 必须是单个字符' })
      const { rows, warnings } = parseCsv(body.content, { delimiter })
      const p = profile(rows, { previewRows: Number(body.previewRows) || 10 })
      const { records } = withHeader(rows)
      return json(res, 200, {
        ...p,
        records: records.slice(0, 200),
        warnings,
        delimiter,
      })
    }
    if (u.pathname === '/' && req.method === 'GET') {
      const p = path.join(__dirname, 'public', 'index.html')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(fs.readFileSync(p))
    }
    return json(res, 404, { error: 'Not found' })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`csv-lens → http://127.0.0.1:${PORT}`)
})
process.on('SIGINT', () => { server.close(); process.exit(0) })
