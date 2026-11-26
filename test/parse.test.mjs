/** RFC4180 parser tests: quotes, multi-line fields, streaming chunks, BOM. */
import assert from 'node:assert/strict'
import { CsvParser, parseCsv, withHeader } from '../lib/parse.js'

let n = 0
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); n++ }
  catch (e) { console.error(`FAIL ${name}\n     ${e.stack}`); process.exitCode = 1 }
}

test('basic rows, CRLF, trailing record without newline', () => {
  const { rows, warnings } = parseCsv('a,b,c\r\n1,2,3\n4,5,6')
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']])
  assert.deepEqual(warnings, [])
})

test('quoted field contains delimiter', () => {
  const { rows } = parseCsv('name,tags\n"Zhang, San","x,y"')
  assert.deepEqual(rows, [['name', 'tags'], ['Zhang, San', 'x,y']])
})

test('quoted field contains CRLF (multi-line field)', () => {
  const { rows } = parseCsv('body,ok\n"line1\nline2\r\nline3",yes')
  assert.deepEqual(rows, [['body', 'ok'], ['line1\nline2\r\nline3', 'yes']])
})

test('doubled quotes "" become a literal quote', () => {
  const { rows } = parseCsv('q,a\n"he said ""hi"" to me",1')
  assert.deepEqual(rows, [['q', 'a'], ['he said "hi" to me', '1']])
})

test('BOM is stripped', () => {
  const { rows } = parseCsv('\ufeffa,b\n1,2')
  assert.deepEqual(rows[0], ['a', 'b'])
})

test('empty lines are skipped; quoted empty line is kept', () => {
  const { rows } = parseCsv('a,b\n\n\n1,2\n\n""\n')
  assert.deepEqual(rows, [['a', 'b'], ['1', '2'], ['']])
})

test('empty fields between delimiters are preserved', () => {
  const { rows } = parseCsv('a,,c\n,,')
  assert.deepEqual(rows, [['a', '', 'c'], ['', '', '']])
})

test('quoted empty field "" is distinct from missing', () => {
  const { rows } = parseCsv('a,b\n"",x')
  assert.deepEqual(rows, [['a', 'b'], ['', 'x']])
})

test('custom delimiter (; and tab)', () => {
  assert.deepEqual(parseCsv('a;b\n1;2', { delimiter: ';' }).rows, [['a', 'b'], ['1', '2']])
  assert.deepEqual(parseCsv('a\tb\n1\t2', { delimiter: '\t' }).rows, [['a', 'b'], ['1', '2']])
})

test('bare quote in unquoted field is tolerated with warning', () => {
  const { rows, warnings } = parseCsv('name,note\nit"s fine,2')
  assert.deepEqual(rows, [['name', 'note'], ['it"s fine', '2']])
  assert.ok(warnings.length > 0)
})

test('unclosed quote at EOF is tolerated with warning', () => {
  const { rows, warnings } = parseCsv('a,b\n"unclosed,2')
  assert.deepEqual(rows[1], ['unclosed,2'])
  assert.ok(warnings.some((w) => w.includes('未闭合')))
})

test('streaming: arbitrary chunk boundaries produce identical rows', () => {
  const text = 'a,b\n"multi\nline",3\nplain,4\n"x""y",5'
  const oneShot = parseCsv(text).rows
  for (const chunkSize of [1, 2, 3, 5, 7, 11]) {
    const p = new CsvParser()
    for (let i = 0; i < text.length; i += chunkSize) p.push(text.slice(i, i + chunkSize))
    assert.deepEqual(p.rows(), oneShot, `chunk 大小 ${chunkSize} 必须与一次性解析一致`)
  }
})

test('streaming push of empty chunks is harmless', () => {
  const p = new CsvParser()
  p.push(''); p.push('a,b'); p.push(''); p.push('\n1,2')
  assert.deepEqual(p.rows(), [['a', 'b'], ['1', '2']])
})

test('withHeader keys records by header', () => {
  const { header, records } = withHeader(parseCsv('id,name\n1,张三\n2,李四').rows)
  assert.deepEqual(header, ['id', 'name'])
  assert.deepEqual(records, [{ id: '1', name: '张三' }, { id: '2', name: '李四' }])
})

test('delimiter constraints', () => {
  assert.throws(() => parseCsv('a,b', { delimiter: ';;' }), /单个字符/)
  assert.throws(() => parseCsv('a,b', { delimiter: '"' }), /引号/)
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ', 0 failed'}`)
