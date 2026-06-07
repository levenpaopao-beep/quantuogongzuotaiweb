import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const outDir = path.join(root, "outputs", "shein_hot_warning_v11");
const dataPath = path.join(outDir, "shein_hot_warning_v11_data.json");
const outputPath = process.env.SHEIN_HOT_OUTPUT || path.join(outDir, "Shein爆旺款重复预警表_V1.1正式版_SKC排序版.xlsx");
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

function normalizeNumericRows(rows, headers) {
  return rows.map((row) => {
    const next = { ...row };
    for (const h of headers) {
      if ((/申报价|金额|价格|价差|报价/.test(h) && !/是否/.test(h)) && next[h] !== "" && next[h] != null) {
        next[h] = Number(next[h]) || 0;
      } else if (/月销|库存|数量|总数|冲突数|下架数|件数/.test(h) && next[h] !== "" && next[h] != null) {
        next[h] = Math.round(Number(next[h]) || 0);
      }
    }
    return next;
  });
}

function writeTable(sheet, headers, rows) {
  const normalizedRows = normalizeNumericRows(rows, headers);
  const colCount = headers.length;
  const data = [headers, ...normalizedRows.map((r) => headers.map((h) => r[h] ?? ""))];
  sheet.getRangeByIndexes(0, 0, data.length, colCount).values = data;
  const endCol = colName(colCount);
  sheet.getRange(`A1:${endCol}1`).format = {
    fill: "#1F4E78",
    font: { name: "Microsoft YaHei", bold: true, color: "#FFFFFF" },
    wrapText: true,
  };
  sheet.getRange(`A1:${endCol}${Math.max(data.length, 2)}`).format.borders = {
    preset: "all",
    style: "thin",
    color: "#D9E2EA",
  };
  sheet.getRange(`A2:${endCol}${Math.max(data.length, 2)}`).format = {
    font: { name: "Microsoft YaHei", size: 10 },
    borders: { preset: "all", style: "thin", color: "#D9E2EA" },
    wrapText: true,
    verticalAlignment: "top",
  };
  sheet.freezePanes.freezeRows(1);
  headers.forEach((h, i) => {
    const c = colName(i + 1);
    let width = 105;
    if (/商家编码|爆旺款skc|skc/.test(h)) width = 150;
    if (/货品名称|处理意见|说明/.test(h)) width = 230;
    if (/冲突类型|是否低于|负责人/.test(h)) width = 120;
    if (/申报价|报价|月销|库存|数量|总数|冲突数|下架数/.test(h)) width = 100;
    sheet.getRange(`${c}:${c}`).format.columnWidthPx = width;
    if (/申报价|金额|价格|价差|报价/.test(h) && !/是否/.test(h)) {
      sheet.getRange(`${c}2:${c}${data.length}`).format.numberFormat = "#,##0.00";
    } else if (/月销|库存|数量|总数|冲突数|下架数|件数/.test(h)) {
      sheet.getRange(`${c}2:${c}${data.length}`).format.numberFormat = "#,##0";
    }
  });
  return data.length;
}

await fs.mkdir(outDir, { recursive: true });
const workbook = Workbook.create();

const overviewHeaders = [
  "店铺编号",
  "店铺",
  "负责人",
  "爆款总数",
  "重复铺货预计总数",
  "平销冲突数",
  "爆款互相冲突数",
  "低于爆款报价数",
  "不低于爆款报价数",
  "立即下架数",
  "售完备货库存下架数",
  "30天内限时下架数",
];
const overview = workbook.worksheets.add("总览");
overview.showGridLines = false;
writeTable(overview, overviewHeaders, payload.overview);

const operationHeaders = [
  "商家编码",
  "货品名称",
  "skc",
  "所属店铺",
  "爆旺款skc",
  "爆旺款店铺",
  "爆款报价",
  "重复款申报价",
  "爆款月销件数",
  "重复款月销件数",
  "是否低于爆款报价",
  "爆款库存",
  "重复款库存",
  "负责人",
  "冲突类型",
  "处理意见",
];
const ops = workbook.worksheets.add("具体店铺操作表");
ops.showGridLines = false;
const opRows = writeTable(ops, operationHeaders, payload.operations);
const lowerCol = operationHeaders.indexOf("是否低于爆款报价") + 1;
const adviceCol = operationHeaders.indexOf("处理意见") + 1;
for (let r = 2; r <= opRows; r++) {
  const lowerValue = payload.operations[r - 2]?.["是否低于爆款报价"];
  const advice = payload.operations[r - 2]?.["处理意见"];
  if (lowerValue === "是") {
    ops.getRange(`${colName(lowerCol)}${r}`).format = {
      fill: "#F4CCCC",
      font: { name: "Microsoft YaHei", bold: true, color: "#9C0006" },
      borders: { preset: "all", style: "thin", color: "#D9E2EA" },
    };
  }
  if (advice === "立即下架！") {
    ops.getRange(`${colName(adviceCol)}${r}`).format = {
      font: { name: "Microsoft YaHei", bold: true, color: "#C00000" },
      borders: { preset: "all", style: "thin", color: "#D9E2EA" },
      wrapText: true,
    };
  }
}

const notes = workbook.worksheets.add("说明");
notes.showGridLines = false;
const noteRows = payload.notes.map(([project, explanation]) => ({ 项目: project, 说明: explanation }));
const noteCount = writeTable(notes, ["项目", "说明"], noteRows);
notes.getRange(`A1:B${noteCount}`).format.wrapText = true;
notes.getRange("A:A").format.columnWidthPx = 150;
notes.getRange("B:B").format.columnWidthPx = 760;

for (const sheetName of ["总览", "具体店铺操作表", "说明"]) {
  const preview = await workbook.render({ sheetName, range: "A1:Q20", scale: 1, format: "png" });
  await fs.writeFile(path.join(outDir, `${sheetName}.png`), new Uint8Array(await preview.arrayBuffer()));
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
