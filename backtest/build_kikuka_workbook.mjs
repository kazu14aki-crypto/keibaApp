import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const reportDir = path.join(root, "backtest", "reports", "kikuka_2026_2026-10-22");
const outputPath = path.join(reportDir, "菊花賞2026_全レース比較分析.xlsx");
const previewDir = path.join(reportDir, "preview");
const font = "Arial";
const colors = {
  navy: "#17365D", green: "#0F5132", green2: "#DDEBDD", gold: "#B68D28",
  gold2: "#F5E8BD", light: "#F3F6F8", gray: "#667085", red: "#B42318", red2: "#FEE4E2",
};

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ""; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter(r => r.some(v => v !== "")).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

async function loadCsv(name) {
  return parseCsv(await fs.readFile(path.join(reportDir, name), "utf8"));
}

const numericKeys = new Set([
  "year", "distance", "headcount", "num", "impost", "finish", "popularity", "odds", "run_time", "last3f",
  "corner1", "corner2", "corner3", "corner4", "weight", "margin", "pci", "starts", "wins", "top3_rate",
  "max_distance", "starts_2200_plus", "top3_rate_2200_plus", "starts_2400_plus", "top3_rate_2400_plus",
  "recent3_score", "class_score", "composite_score", "latest_finish", "field_rows", "reported_headcount",
  "target_count", "winner_time", "best_last3f", "avg_last3f", "target_flag", "time_behind_winner",
  "last3f_diff_to_best", "field_time_rank", "field_last3f_rank", "finish_percentile", "field_size",
  "winner_last3f", "winner_corner4", "top3_avg_corner4", "top3_avg_last3f", "lap_first1000", "lap_middle1000",
  "lap_last1000", "lap_last3f", "first1000", "middle1000", "last1000",
]);

function typed(key, value) {
  if (value === "" || value == null) return null;
  if (key === "date" || key === "latest_date") return new Date(`${value}T00:00:00Z`);
  if (numericKeys.has(key) || /^lap_\d+$/.test(key)) return Number(value);
  return value;
}

function colName(n) {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

function styleTitle(sheet, title, subtitle, lastCol) {
  sheet.showGridLines = false;
  sheet.getRange("A2").values = [[title]];
  sheet.getRange("A2").format.font = { name: font, size: 14, bold: true, color: colors.navy };
  sheet.getRange(`A3:${lastCol}3`).format.borders = { bottom: { style: "thin", color: colors.gold } };
  sheet.getRange("A3").values = [[subtitle]];
  sheet.getRange("A3").format.font = { name: font, size: 10, italic: true, color: colors.gray };
}

function setColumnWidths(sheet, cols, rows, headerRow, totalRows) {
  cols.forEach((c, i) => {
    const maxLen = Math.max(c.label.length, ...rows.slice(0, 250).map(r => String(r[c.key] ?? "").length));
    const wide = ["race_name", "target_names", "target_names_in_race", "reason", "source_url"].includes(c.key);
    const width = wide ? Math.min(42, Math.max(18, maxLen * 1.15)) : Math.min(18, Math.max(8, maxLen * 1.15));
    sheet.getRangeByIndexes(headerRow - 1, i, totalRows - headerRow + 1, 1).format.columnWidth = width;
  });
}

function writeDataset(sheet, title, subtitle, rows, cols, tableName, options = {}) {
  const lastCol = colName(cols.length);
  styleTitle(sheet, title, subtitle, lastCol);
  const headerRow = 5;
  const headers = cols.map(c => c.label);
  const matrix = rows.map(row => cols.map(c => typed(c.key, row[c.key])));
  sheet.getRangeByIndexes(headerRow - 1, 0, 1, cols.length).values = [headers];
  if (matrix.length) sheet.getRangeByIndexes(headerRow, 0, matrix.length, cols.length).values = matrix;
  const used = sheet.getRangeByIndexes(headerRow - 1, 0, matrix.length + 1, cols.length);
  used.format.font = { name: font, size: 10, color: "#202124" };
  sheet.getRangeByIndexes(headerRow - 1, 0, 1, cols.length).format = {
    fill: colors.navy,
    font: { name: font, size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { insideVertical: { style: "thin", color: "#FFFFFF" }, bottom: { style: "medium", color: colors.gold } },
  };
  sheet.getRangeByIndexes(headerRow, 0, matrix.length, cols.length).format.verticalAlignment = "center";
  if (matrix.length) {
    const table = sheet.tables.add(`A${headerRow}:${lastCol}${headerRow + matrix.length}`, true, tableName);
    table.style = "TableStyleMedium2";
    table.showFilterButton = true;
  }
  cols.forEach((c, i) => {
    const range = sheet.getRangeByIndexes(headerRow, i, matrix.length || 1, 1);
    if (c.format) range.format.numberFormat = c.format;
    if (c.align) range.format.horizontalAlignment = c.align;
  });
  setColumnWidths(sheet, cols, rows, headerRow, matrix.length + headerRow);
  sheet.freezePanes.freezeRows(headerRow);
  if (options.freezeCols) sheet.freezePanes.freezeColumns(options.freezeCols);
  if (options.targetFlagKey) {
    const idx = cols.findIndex(c => c.key === options.targetFlagKey);
    if (idx >= 0 && matrix.length) sheet.getRangeByIndexes(headerRow, idx, matrix.length, 1).conditionalFormats.add("cellIs", {
      operator: "equal", formula: 1, format: { fill: colors.gold2, font: { bold: true, color: "#6B4F00" } },
    });
  }
  return { headerRow, dataStart: headerRow + 1, dataEnd: headerRow + matrix.length, lastCol };
}

const [runnerSummary, raceCompare, allParticipants, pastKikuka, pastSummary, pastLaps, prediction] = await Promise.all([
  loadCsv("runner_summary.csv"), loadCsv("race_comparison.csv"), loadCsv("all_race_participants.csv"),
  loadCsv("past_kikuka_all_runners.csv"), loadCsv("past_kikuka_summary.csv"), loadCsv("past_kikuka_race_laps.csv"),
  loadCsv("prediction.csv"),
]);
const trialLaps = parseCsv(await fs.readFile(path.join(root, "backtest", "kikuka_key_trial_laps.csv"), "utf8"));

const workbook = Workbook.create();
const summary = workbook.worksheets.add("予想概要");
const runners = workbook.worksheets.add("対象馬一覧");
const races = workbook.worksheets.add("レース比較");
const detail = workbook.worksheets.add("全出走明細");
const past = workbook.worksheets.add("過去菊花賞");
const laps = workbook.worksheets.add("200mラップ");
const audit = workbook.worksheets.add("データ検査");

summary.tabColor = colors.green;
runners.tabColor = "#4F7A63";
races.tabColor = "#4F7A63";
audit.tabColor = "#98A2B3";

styleTitle(summary, "2026年 菊花賞 全レース比較分析", "2026-10-22時点。枠順・当日オッズ・当日馬場の確定前", "Q");
summary.getRange("A5:H5").values = [["対象馬", null, "対象レース", null, "全出走明細", null, "比較完了レース", null]];
summary.getRange("A6:F6").formulas = [["=COUNTA('対象馬一覧'!A6:A23)", null, "=COUNTA('レース比較'!A6:A86)", null, "=COUNTA('全出走明細'!A6:A1018)", null]];
summary.getRange("G6:H6").values = [[raceCompare.filter(r => r.coverage_status.startsWith("完全")).length, null]];
for (const addr of ["A5:B6", "C5:D6", "E5:F6", "G5:H6"]) {
  summary.getRange(addr).format = { fill: colors.light, font: { name: font, size: 11, bold: true, color: colors.navy }, horizontalAlignment: "center", verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: "#D0D5DD" } };
}
summary.getRange("A6:H6").format.font = { name: font, size: 14, bold: true, color: colors.green };
summary.getRange("A8:C8").values = [["印", "馬名", "評価理由"]];
summary.getRange("A8:C8").format = { fill: colors.navy, font: { name: font, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
summary.getRange(`A9:C${8 + prediction.length}`).values = prediction.map(r => [r.mark, r.name, r.reason]);
summary.getRange(`A9:C${8 + prediction.length}`).format.font = { name: font, size: 10 };
summary.getRange(`A9:A${8 + prediction.length}`).format = { horizontalAlignment: "center", font: { name: font, size: 11, bold: true, color: colors.gold } };
summary.getRange(`C9:C${8 + prediction.length}`).format.wrapText = true;
summary.getRange("A:A").format.columnWidth = 7;
summary.getRange("B:B").format.columnWidth = 20;
summary.getRange("C:C").format.columnWidth = 58;
summary.getRange("J8:K8").values = [["馬名", "機械集計点"]];
summary.getRange("J9:K16").values = runnerSummary.slice(0, 8).map(r => [r.name, Number(r.composite_score)]);
summary.getRange("J8:K8").format = { fill: colors.navy, font: { name: font, size: 10, bold: true, color: "#FFFFFF" } };
summary.getRange("K9:K16").format.numberFormat = "0.00";
const chart = summary.charts.add("bar", summary.getRange("J8:K16"));
chart.title = "機械集計点 上位8頭";
chart.titleTextStyle.fontSize = 12;
chart.titleTextStyle.typeface = font;
chart.hasLegend = false;
chart.xAxis = { axisType: "textAxis", textStyle: { typeface: font, fontSize: 10 } };
chart.yAxis = { numberFormatCode: "0", numberFormatSourceLinked: false, textStyle: { typeface: font, fontSize: 10 } };
chart.setPosition("E8", "M22");
summary.getRange("A19:C19").values = [["比較の見方", null, null]];
summary.getRange("A19:C19").format = { fill: colors.green2, font: { name: font, size: 10, bold: true, color: colors.green }, borders: { bottom: { style: "thin", color: colors.green } } };
summary.getRange("A20:C23").values = [
  ["走破時計", "同一レースの勝ち馬との差で比較", "距離・馬場が違うレース間の生時計比較は避ける"],
  ["上がり3F", "同一レース最速との差と順位で比較", "後方待機の上がりだけを過大評価しない"],
  ["位置取り", "4角位置と着順の組み合わせで確認", "早仕掛けで粘った内容を評価できる"],
  ["注意", "予想は暫定", "枠順・当日馬場・オッズ確定後に更新が必要"],
];
summary.getRange("A20:C23").format.font = { name: font, size: 10 };
summary.getRange("A20:A23").format.font = { name: font, size: 10, bold: true, color: colors.navy };
summary.getRange("B20:C23").format.columnWidth = 35;
summary.showGridLines = false;

writeDataset(runners, "菊花賞 出走想定馬", "全履歴と長距離実績の集計。総合点はオッズ・枠順・当日馬場を未使用", runnerSummary, [
  { key: "name", label: "馬名" }, { key: "composite_score", label: "総合点", format: "0.00" },
  { key: "starts", label: "出走", format: "0" }, { key: "wins", label: "勝利", format: "0" },
  { key: "top3_rate", label: "複勝率", format: "0.0%" }, { key: "max_distance", label: "最長距離", format: "0\"m\"" },
  { key: "starts_2200_plus", label: "2200m+出走", format: "0" }, { key: "top3_rate_2200_plus", label: "2200m+複勝率", format: "0.0%" },
  { key: "starts_2400_plus", label: "2400m+出走", format: "0" }, { key: "top3_rate_2400_plus", label: "2400m+複勝率", format: "0.0%" },
  { key: "recent3_score", label: "直近3走指数", format: "0.000" }, { key: "class_score", label: "格指数", format: "0.000" },
  { key: "latest_date", label: "最終出走", format: "yyyy-mm-dd" }, { key: "latest_race", label: "最終レース" }, { key: "latest_finish", label: "着順", format: "0" },
], "RunnerSummaryTable", { freezeCols: 1 });
runners.getRange("B6:B23").conditionalFormats.add("colorScale", { colors: ["#FEE4E2", "#FEF0C7", "#D1FADF"], thresholds: ["min", { type: "percentile", value: 50 }, "max"] });

writeDataset(races, "対象馬が走ったレース比較", "81レースをレース単位で集約。取消馬は出走明細に含めない", raceCompare, [
  { key: "date", label: "日付", format: "yyyy-mm-dd" }, { key: "track", label: "競馬場" }, { key: "race_no", label: "R" },
  { key: "race_name", label: "レース名" }, { key: "surface", label: "芝/ダ" }, { key: "distance", label: "距離", format: "0\"m\"" },
  { key: "going", label: "馬場" }, { key: "field_rows", label: "出走数", format: "0" }, { key: "reported_headcount", label: "登録頭数", format: "0" },
  { key: "coverage_status", label: "収録状態" }, { key: "target_count", label: "対象馬数", format: "0" }, { key: "target_names", label: "対象馬" },
  { key: "winner", label: "勝ち馬" }, { key: "winner_time", label: "勝ち時計秒", format: "0.0" },
  { key: "fastest_last3f_horse", label: "最速上がり馬" }, { key: "best_last3f", label: "最速上がり", format: "0.0" },
  { key: "avg_last3f", label: "平均上がり", format: "0.00" }, { key: "source", label: "データ源" },
], "RaceComparisonTable", { freezeCols: 4 });
races.getRange("J6:J86").conditionalFormats.add("containsText", { text: "要確認", format: { fill: colors.red2, font: { bold: true, color: colors.red } } });

writeDataset(detail, "全出走明細", "対象馬が出走した81レースの全出走馬。黄色は菊花賞の対象馬", allParticipants, [
  { key: "date", label: "日付", format: "yyyy-mm-dd" }, { key: "track", label: "競馬場" }, { key: "race_no", label: "R" },
  { key: "race_name", label: "レース名" }, { key: "surface", label: "芝/ダ" }, { key: "distance", label: "距離", format: "0\"m\"" },
  { key: "going", label: "馬場" }, { key: "target_names_in_race", label: "同走した対象馬" }, { key: "target_flag", label: "対象", format: "0" },
  { key: "finish", label: "着順", format: "0" }, { key: "num", label: "馬番", format: "0" }, { key: "name", label: "馬名" },
  { key: "jockey", label: "騎手" }, { key: "impost", label: "斤量", format: "0.0" }, { key: "popularity", label: "人気", format: "0" },
  { key: "odds", label: "単勝", format: "0.0" }, { key: "run_time", label: "走破秒", format: "0.0" },
  { key: "time_behind_winner", label: "勝ち馬差秒", format: "0.0" }, { key: "field_time_rank", label: "時計順位", format: "0" },
  { key: "last3f", label: "上がり3F", format: "0.0" }, { key: "field_last3f_rank", label: "上がり順位", format: "0" },
  { key: "last3f_diff_to_best", label: "最速上がり差", format: "0.0" }, { key: "corner1", label: "1角", format: "0" },
  { key: "corner2", label: "2角", format: "0" }, { key: "corner3", label: "3角", format: "0" }, { key: "corner4", label: "4角", format: "0" },
  { key: "headcount", label: "頭数", format: "0" }, { key: "source", label: "データ源" },
], "AllParticipantsTable", { freezeCols: 4, targetFlagKey: "target_flag" });

writeDataset(past, "過去菊花賞 全出走馬", "1996～2025年の全出走馬。比較用に時計・上がり・通過順・人気を保持", pastKikuka, [
  { key: "date", label: "日付", format: "yyyy-mm-dd" }, { key: "track", label: "競馬場" }, { key: "going", label: "馬場" },
  { key: "finish", label: "着順", format: "0" }, { key: "num", label: "馬番", format: "0" }, { key: "name", label: "馬名" },
  { key: "jockey", label: "騎手" }, { key: "popularity", label: "人気", format: "0" }, { key: "odds", label: "単勝", format: "0.0" },
  { key: "run_time", label: "走破秒", format: "0.0" }, { key: "last3f", label: "上がり3F", format: "0.0" },
  { key: "corner1", label: "1角", format: "0" }, { key: "corner2", label: "2角", format: "0" }, { key: "corner3", label: "3角", format: "0" },
  { key: "corner4", label: "4角", format: "0" }, { key: "headcount", label: "頭数", format: "0" }, { key: "pci", label: "PCI", format: "0.0" },
], "PastKikukaTable", { freezeCols: 3 });

const expandedLaps = [
  ...pastLaps.map(r => ({ race_name: "菊花賞", distance: "3000", ...r })),
  ...trialLaps,
].map(r => {
  const out = { ...r };
  const splitValues = String(r.lap_200m || "").split("-").filter(Boolean).map(Number);
  splitValues.forEach((v, i) => { out[`lap_${i + 1}`] = v; });
  if (!out.first1000 && splitValues.length >= 5) out.first1000 = splitValues.slice(0, 5).reduce((a, b) => a + b, 0).toFixed(1);
  if (!out.last1000 && splitValues.length >= 5) out.last1000 = splitValues.slice(-5).reduce((a, b) => a + b, 0).toFixed(1);
  if (!out.last3f && splitValues.length >= 3) out.last3f = splitValues.slice(-3).reduce((a, b) => a + b, 0).toFixed(1);
  return out;
});
const lapCols = [
  { key: "date", label: "日付", format: "yyyy-mm-dd" }, { key: "track", label: "競馬場" }, { key: "race_name", label: "レース名" },
  { key: "distance", label: "距離", format: "0\"m\"" }, { key: "going", label: "馬場" }, { key: "winner", label: "勝ち馬" },
  { key: "winner_time", label: "勝ち時計秒", format: "0.0" },
  ...Array.from({ length: 15 }, (_, i) => ({ key: `lap_${i + 1}`, label: `${(i + 1) * 200}m`, format: "0.0" })),
  { key: "first1000", label: "前半1000", format: "0.0" }, { key: "middle1000", label: "中盤1000", format: "0.0" },
  { key: "last1000", label: "後半1000", format: "0.0" }, { key: "last3f", label: "レース上がり3F", format: "0.0" }, { key: "source_url", label: "公式URL" },
];
writeDataset(laps, "200mレースラップ", "JRA公式で取得できた過去10年の菊花賞と2026年主要トライアル。空欄は距離不足または未集計", expandedLaps, lapCols, "RaceLapsTable", { freezeCols: 3 });

styleTitle(audit, "データ検査と定義", "収録範囲、比較指標、出典を確認するための監査用シート", "H");
audit.getRange("A5:B10").values = [
  ["項目", "結果"], ["対象馬", runnerSummary.length], ["対象レース", raceCompare.length], ["全出走明細", allParticipants.length],
  ["収録完了レース", raceCompare.filter(r => r.coverage_status.startsWith("完全")).length], ["要確認レース", raceCompare.filter(r => r.coverage_status === "要確認").length],
];
audit.getRange("A5:B5").format = { fill: colors.navy, font: { name: font, size: 10, bold: true, color: "#FFFFFF" } };
audit.getRange("A6:B10").format.font = { name: font, size: 10 };
audit.getRange("A12:C12").values = [["指標", "定義", "用途"]];
audit.getRange("A13:C17").values = [
  ["勝ち馬差秒", "各馬の走破秒－同一レース勝ち時計", "距離・馬場が同じ条件内で時計を比較"],
  ["上がり順位", "同一レース内の上がり3F順位", "生の上がり値より相対性能を確認"],
  ["最速上がり差", "各馬上がり3F－同一レース最速上がり", "展開差を残しつつ末脚差を定量化"],
  ["収録状態", "登録頭数との差1は取消馬として完全扱い", "実際に走った全馬が対象"],
  ["個別200m", "公開データにないため未推定", "推測値を混ぜず、走破時計・上がり3F・通過順で比較"],
];
audit.getRange("A12:C12").format = { fill: colors.green, font: { name: font, size: 10, bold: true, color: "#FFFFFF" } };
audit.getRange("A13:C17").format.font = { name: font, size: 10 };
audit.getRange("A:A").format.columnWidth = 22; audit.getRange("B:B").format.columnWidth = 38; audit.getRange("C:C").format.columnWidth = 46;
audit.getRange("A19:C19").values = [["出典", "対象", "URL"]];
const recentSources = [
  ["WIN!競馬", "信夫山特別", "https://www.winkeiba.jp/race/results?DOR=20260711&RaceNum=09&RacetrackCd=03"],
  ["WIN!競馬", "阿寒湖特別", "https://www.winkeiba.jp/race/results?DOR=20260816&RaceNum=12&RacetrackCd=01"],
  ["WIN!競馬", "日本海ステークス", "https://www.winkeiba.jp/race/results?DOR=20260830&RaceNum=07&RacetrackCd=04"],
  ["WIN!競馬", "能勢特別", "https://www.winkeiba.jp/race/results?DOR=20260913&RaceNum=09&RacetrackCd=09"],
  ["WIN!競馬", "セントライト記念", "https://www.winkeiba.jp/race/results?DOR=20260913&RaceNum=11&RacetrackCd=06"],
  ["WIN!競馬", "九十九里特別", "https://www.winkeiba.jp/race/results?DOR=20260919&RaceNum=10&RacetrackCd=06"],
  ["WIN!競馬", "キタサンブラックカップ", "https://www.winkeiba.jp/race/results?DOR=20260921&RaceNum=10&RacetrackCd=09"],
  ["WIN!競馬", "神戸新聞杯", "https://www.winkeiba.jp/race/results?DOR=20260921&RaceNum=11&RacetrackCd=09"],
  ["WIN!競馬", "ポートアイランドS", "https://www.winkeiba.jp/race/results?DOR=20260927&RaceNum=11&RacetrackCd=09"],
  ["JRA", "セントライト記念200mラップ", "https://www.jra.go.jp/datafile/seiseki/replay/2026/084.html"],
  ["JRA", "神戸新聞杯200mラップ", "https://www.jra.go.jp/datafile/seiseki/replay/2026/088.html"],
];
audit.getRange(`A20:C${19 + recentSources.length}`).values = recentSources;
audit.getRange("A19:C19").format = { fill: colors.navy, font: { name: font, size: 10, bold: true, color: "#FFFFFF" } };
audit.getRange(`A20:C${19 + recentSources.length}`).format.font = { name: font, size: 9 };
audit.getRange("C:C").format.columnWidth = 70;
audit.freezePanes.freezeRows(5);
audit.showGridLines = false;

workbook.recalculate();
const checks = {};
checks.summary = (await workbook.inspect({ kind: "table", range: "予想概要!A1:M23", include: "values,formulas", tableMaxRows: 25, tableMaxCols: 14, maxChars: 7000 })).ndjson;
checks.races = (await workbook.inspect({ kind: "table", range: "レース比較!A1:R12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 18, maxChars: 7000 })).ndjson;
checks.errors = (await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" })).ndjson;
await fs.mkdir(previewDir, { recursive: true });
const previewRanges = {
  "予想概要": "A1:M23", "対象馬一覧": "A1:O23", "レース比較": "A1:R22", "全出走明細": "A1:AB24",
  "過去菊花賞": "A1:Q24", "200mラップ": "A1:AB20", "データ検査": "A1:C30",
};
for (const [sheetName, range] of Object.entries(previewRanges)) {
  const png = await workbook.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await png.arrayBuffer()));
}
await fs.mkdir(reportDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
checks.savedSheets = (await reopened.inspect({ kind: "sheet", include: "id,name", maxChars: 3000 })).ndjson;
checks.savedSummary = (await reopened.inspect({ kind: "table", range: "予想概要!A5:H6", include: "values,formulas", tableMaxRows: 4, tableMaxCols: 8, maxChars: 3000 })).ndjson;
checks.savedErrors = (await reopened.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "saved file formula error scan" })).ndjson;
console.log(JSON.stringify({ outputPath, sheets: Object.keys(previewRanges), counts: { runners: runnerSummary.length, races: raceCompare.length, participants: allParticipants.length, pastKikuka: pastKikuka.length }, checks }, null, 2));
