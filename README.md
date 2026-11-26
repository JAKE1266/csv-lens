# csv-lens

零依赖 **CSV 分析器**:RFC4180 解析(引号内逗号/换行、`""` 转义、多行字段,**流式分块可用**)、列类型推断(数字/日期/布尔)、每列统计(缺失/唯一/min-max/样本)。CLI 摘要与本地 Web 表格预览双入口。纯 Node.js(≥18)。

> Web UI 只接受**粘贴的文本**,不提供任意文件路径读取——本地文件场景走 CLI。

## 快速开始

```bash
npm test                  # 36 项断言
node cli.js data.csv      # 文本摘要(每列类型/缺失/唯一/范围)
node cli.js data.csv --json --out profile.json
node server.js            # → http://127.0.0.1:8800(粘贴分析 + 表格预览)
```

## CLI

```
csv-lens <file.csv> [选项]
  --delimiter D     定界符(默认 ,;支持 ; 与 \t)
  --rows N          预览数据行数(默认 10)
  --json            输出完整 profile(JSON)
  --out FILE        写入文件
```

## 能力

- **RFC4180 解析器**:字符级状态机,`push(chunk)` 任意分块边界下结果一致(流式可用);引号内逗号/换行、`""` 转义、BOM、CRLF、裸引号与未闭合引号容错(进 warnings 不静默丢)
- **类型推断**:整列一致才算——`number`(负数/小数)、`boolean`(true/false/yes/no/是/否/y/n/t/f)、`date`(ISO 形态)、否则 `string`;全空列 `empty`
- **列统计**:缺失数、唯一数;number 列 min/max/sum;date 列 min/max;boolean 列 true/false 计数;样本前 3 个
- **Web 表格预览**:粘贴 + 定界符选择 → 列概览卡片 + 前 N 行表格(>64KiB 大文件请用 CLI)

## API

```
POST /api/profile { content, delimiter?, previewRows? }
     → { rowCount, columnCount, columns: [{ name, type, missing, unique, min?, max?, sum?, true?, false?, samples }],
         records(≤200), preview, warnings, delimiter }
GET  /                  仪表盘
```

## 文件结构

```
csv-lens/
├── cli.js             # CLI(文本摘要/JSON/--out)
├── server.js          # POST /api/profile + 单文件表格视图
├── public/index.html  # 粘贴分析(列概览卡片/表格预览/警告)
├── lib/
│   ├── parse.js       # CsvParser(流式状态机)+ parseCsv + withHeader
│   ├── infer.js       # inferType + coerce(number/boolean/date)
│   └── profile.js     # 列统计聚合 + 预览截断
└── test/              # parse(15) + infer/profile(10) + server E2E(6) + 语法(6) = 36 项
```

## License

MIT
