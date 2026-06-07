import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const outDir = path.join(root, "outputs", "shein_hot_audit_20260602");
const dataPath = path.join(outDir, "shein_hot_duplicate_data.json");
const outputPath = path.join(outDir, "Shein爆旺款重复铺货核查_20260602_Temu操作表口径版.xlsx");

const payload = JSON.parse(await fs.readFile(dataPath, "utf8"));

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function rangeFor(startRow, startCol, rowCount, colCount) {
  const a = `${colName(startCol)}${startRow}`;
  const b = `${colName(startCol + colCount - 1)}${startRow + rowCount - 1}`;
  return `${a}:${b}`;
}

function widthFor(header) {
  if (/处理意见|货品名称|规格名称|说明/.test(header)) return 240;
  if (/SKC|商家编码/.test(header)) return 170;
  if (/申报价|价格差|销量|件数|日均|数量|行数|SKU数/.test(header)) return 105;
  if (/冲突类型|负责人|店铺|是否/.test(header)) return 110;
  return 130;
}

function writeSheet(workbook, config) {
  const sheet = workbook.worksheets.add(config.name);
  sheet.showGridLines = false;
  const headers = config.headers;
  const rows = config.rows.length ? config.rows : [["无符合条件记录", ...Array(Math.max(headers.length - 1, 0)).fill("")]];
  const colCount = headers.length;
  const endCol = colName(colCount);

  sheet.getRange("A1").values = [[config.title]];
  sheet.getRange("A1").format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF", size: 14 },
    horizontalAlignment: "left",
  };
  sheet.getRange("A2").values = [[`数据源：${payload.source}；有效SKU ${payload.record_count} 行；爆旺SKC ${payload.hot_skc_count} 个；冲突 ${payload.conflict_count} 行`]];
  sheet.getRange("A2").format = { fill: "#EAF2F8", font: { color: "#1F4E78" } };

  sheet.getRange(rangeFor(3, 1, 1, colCount)).values = [headers];
  sheet.getRange(rangeFor(3, 1, 1, colCount)).format = {
    fill: "#D9EAF7",
    font: { bold: true, color: "#1F2937" },
    borders: { preset: "all", style: "thin", color: "#B7C9D6" },
    wrapText: true,
  };
  sheet.getRange(rangeFor(4, 1, rows.length, colCount)).values = rows;
  sheet.getRange(rangeFor(4, 1, rows.length, colCount)).format = {
    borders: { preset: "all", style: "thin", color: "#D9E2EA" },
    wrapText: true,
    verticalAlignment: "top",
  };

  for (let i = 0; i < colCount; i++) {
    const col = colName(i + 1);
    sheet.getRange(`${col}:${col}`).format.columnWidthPx = widthFor(headers[i]);
  }
  sheet.getRange(`A1:${endCol}${Math.min(rows.length + 3, 200)}`).format.font = { name: "Microsoft YaHei", size: 10 };
  sheet.getRange(`A1:${endCol}1`).format = {
    fill: "#1F4E78",
    font: { name: "Microsoft YaHei", size: 14, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "left",
  };
  sheet.getRange(`A2:${endCol}2`).format = {
    fill: "#EAF2F8",
    font: { name: "Microsoft YaHei", size: 10, color: "#1F4E78" },
    horizontalAlignment: "left",
  };
  sheet.freezePanes.freezeRows(3);

  const numberHeaders = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /申报价|价格差|销量|件数|日均|数量|行数|SKU数|天数|合计/.test(h));
  for (const { i } of numberHeaders) {
    const col = colName(i + 1);
    sheet.getRange(`${col}4:${col}${rows.length + 3}`).format.numberFormat = "#,##0.00";
  }

  const lowerIndex = headers.findIndex((h) => /是否低于爆旺款|重复铺货供货价/.test(h));
  if (lowerIndex >= 0) {
    const col = colName(lowerIndex + 1);
    for (let r = 0; r < rows.length; r++) {
      if (rows[r][lowerIndex] === "是") {
        sheet.getRange(`${col}${r + 4}`).format = {
          fill: "#F4CCCC",
          font: { bold: true, color: "#9C0006" },
          borders: { preset: "all", style: "thin", color: "#D9E2EA" },
        };
      }
    }
  }
  return sheet;
}

await fs.mkdir(outDir, { recursive: true });
const workbook = Workbook.create();
for (const sheetConfig of payload.sheets) {
  writeSheet(workbook, sheetConfig);
}

for (const sheetConfig of payload.sheets) {
  const preview = await workbook.render({
    sheetName: sheetConfig.name,
    range: "A1:J18",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outDir, `${sheetConfig.name}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const scan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(scan.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
