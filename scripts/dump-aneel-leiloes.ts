/**
 * ANEEL's auction-result spreadsheet, measured before anything is mapped.
 *
 * Four probe runs settled where this file comes from and why it arrives by
 * hand rather than over HTTP:
 *
 *   www.gov.br/aneel/…/leiloes        200, server-rendered, from both machines
 *     └─ links three "Planilha em Excel" on git.aneel.gov.br
 *   git.aneel.gov.br                  403 "Just a moment…" — Cloudflare's JS
 *                                     challenge, unchanged by a browser UA
 *   dadosabertos.aneel.gov.br         TCP timeout from two continents
 *   leilao.aneel.gov.br               TCP timeout from two continents
 *
 * So the data is public and the URLs are exact. What refuses them turned out
 * to be stronger than a bot check: run five opened the transmission URL in the
 * user's own Chrome and got Cloudflare's **hard block** — "Sorry, you have
 * been blocked. You are unable to access aneel.gov.br" — not the "Just a
 * moment…" challenge a script sees. A challenge is answered by a better
 * client; a block of that class is decided on the caller's IP or ASN and is
 * answered only by a different network. So "download it in a browser" is not
 * enough on its own; it has to be a browser on an egress that host will talk
 * to. (The deployment saw the challenge rather than the block, so its address
 * is not on the same list.)
 *
 * The shape is still the one this repo has used three times — Compras MX,
 * Ecopetrol, Proyectos México: a person obtains the file, and the mapper is
 * written against the real capture.
 *
 * The three files, exactly as gov.br links them:
 *
 *   https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/
 *       relatorioseindicadores/leiloes/Resultado_leiloes_transmissao.xlsx
 *       relatorioseindicadores/leiloes/Resultado_leiloes_geracao.xlsx
 *       relatorioseindicadores/leiloes/Resultado_leiloes_sistemas_isolados.xlsx
 *
 * What this script is for: printing the sheet names, the real column headers,
 * their inferred types and the first rows — so the mapper is written from the
 * file rather than from the tag list a search engine showed us. The tags said
 * `RAP`, `preço teto`, `deságio`, `investimento`; what the columns are ACTUALLY
 * called is a different question, and mapping the wrong one into
 * `estimatedValue` is the trap already written down in lib/ingestion/README.md
 * (RAP is an annual revenue cap; the figure a bidder sizes the job by is the
 * estimated investment).
 *
 * Read-only. No Supabase, no writes, no model calls, no network.
 *
 * Usage:
 *   npm run dump:aneel-leiloes -- Resultado_leiloes_transmissao.xlsx
 *   npm run dump:aneel-leiloes -- <file>.xlsx --rows 5
 */
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { toCsv, writeReviewCsv, type CsvValue } from "@/lib/ingestion/review-csv";

const OUT_DIR = "exports";

/** What a cell holds, described rather than coerced — a date read as a number is a silent mapping bug. */
function describeCell(value: ExcelJS.CellValue): { kind: string; text: string } {
  if (value === null || value === undefined) return { kind: "空", text: "" };
  if (value instanceof Date) return { kind: "日期", text: value.toISOString() };
  if (typeof value === "number") return { kind: "数字", text: String(value) };
  if (typeof value === "boolean") return { kind: "布尔", text: String(value) };
  if (typeof value === "object") {
    const rich = value as { richText?: { text?: string }[]; text?: string; result?: unknown; hyperlink?: string };
    if (Array.isArray(rich.richText)) return { kind: "富文本", text: rich.richText.map((part) => part.text ?? "").join("") };
    if (rich.hyperlink) return { kind: "链接", text: `${rich.text ?? ""} → ${rich.hyperlink}` };
    // A formula cell carries its cached result; the mapper wants the result,
    // never the formula, and this is where that becomes visible.
    if ("result" in rich) return { kind: "公式", text: String(rich.result ?? "") };
    return { kind: "对象", text: JSON.stringify(value).slice(0, 120) };
  }
  return { kind: "文本", text: String(value) };
}

/**
 * The header row is not always row 1.
 *
 * Government spreadsheets routinely open with a title banner, a logo row and
 * a blank line. Taking row 1 on faith produces a mapper keyed on "" and
 * "Column2", which fails in a way that looks like the file being wrong. So the
 * first row whose cells are mostly non-empty strings wins, and the row number
 * is printed, because if this guess is wrong the mapper must be told.
 */
function findHeaderRow(sheet: ExcelJS.Worksheet, maxScan = 12): number {
  for (let rowNumber = 1; rowNumber <= Math.min(maxScan, sheet.rowCount); rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = (Array.isArray(row.values) ? row.values.slice(1) : []) as ExcelJS.CellValue[];
    const filled = values.filter((value) => typeof value === "string" && value.trim() !== "");
    if (filled.length >= 3 && filled.length >= values.length / 2) return rowNumber;
  }
  return 1;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  const rowsFlagIndex = args.indexOf("--rows");
  const sampleRows = Math.max(1, Number(rowsFlagIndex >= 0 ? args[rowsFlagIndex + 1] : 3) || 3);

  if (!file) {
    console.error("用法：npm run dump:aneel-leiloes -- <文件>.xlsx [--rows 5]\n");
    console.error("文件从这三个地址之一下载。注意 git.aneel 对中国出口是硬封锁（Sorry, you have been blocked），");
    console.error("真浏览器也过不去 —— 要换一个网络出口，或者看 E2d/E2e 那两个 ANEEL 子域名通不通：");
    console.error("  https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/relatorioseindicadores/leiloes/Resultado_leiloes_transmissao.xlsx");
    console.error("  https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/relatorioseindicadores/leiloes/Resultado_leiloes_geracao.xlsx");
    console.error("  https://git.aneel.gov.br/publico/centralconteudo/-/raw/main/relatorioseindicadores/leiloes/Resultado_leiloes_sistemas_isolados.xlsx");
    process.exit(1);
  }
  if (!existsSync(file)) {
    console.error(`找不到文件：${file}`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  console.log(`ANEEL 拍卖结果表 —— ${file}\n`);
  console.log(`工作表 ${workbook.worksheets.length} 个：${workbook.worksheets.map((sheet) => `「${sheet.name}」${sheet.rowCount} 行`).join("、")}\n`);

  const columnRows: CsvValue[][] = [];

  for (const sheet of workbook.worksheets) {
    console.log("─".repeat(72));
    console.log(`\n工作表「${sheet.name}」 —— ${sheet.rowCount} 行 × ${sheet.columnCount} 列\n`);
    if (sheet.rowCount === 0) {
      console.log("  空表。\n");
      continue;
    }

    const headerRowNumber = findHeaderRow(sheet);
    if (headerRowNumber !== 1) {
      console.log(`  ⚠ 表头不在第 1 行，在第 ${headerRowNumber} 行 —— 前面是标题/空行。映射器要跳过这几行。\n`);
    }
    const headerRow = sheet.getRow(headerRowNumber);
    const headers = ((Array.isArray(headerRow.values) ? headerRow.values.slice(1) : []) as ExcelJS.CellValue[]).map((value) => describeCell(value).text.trim());

    console.log(`  列名（第 ${headerRowNumber} 行），共 ${headers.length} 列 —— 映射器照这个写：`);
    headers.forEach((header, index) => {
      // The type is read from the first data row, not the header, because a
      // column called "Data" holding a string is a different mapping job from
      // one holding a real date.
      const firstData = sheet.getRow(headerRowNumber + 1).getCell(index + 1).value;
      const { kind, text } = describeCell(firstData);
      console.log(`    ${String(index + 1).padStart(3)}. ${(header || "（空列名）").padEnd(38)} ${kind.padEnd(5)} ${text.slice(0, 60)}`);
      columnRows.push([sheet.name, index + 1, header, kind, text.slice(0, 120)]);
    });
    console.log();

    console.log(`  前 ${sampleRows} 行原样：`);
    for (let offset = 1; offset <= sampleRows; offset += 1) {
      const row = sheet.getRow(headerRowNumber + offset);
      if (!row || row.cellCount === 0) break;
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        const { text } = describeCell(row.getCell(index + 1).value);
        if (text !== "") record[header || `列${index + 1}`] = text;
      });
      console.log(JSON.stringify(record, null, 2).split("\n").map((line) => `    ${line}`).join("\n"));
    }
    console.log();
  }

  if (columnRows.length > 0) {
    writeReviewCsv({
      dir: OUT_DIR,
      baseName: `aneel-leiloes-columns-${new Date().toISOString().slice(0, 10)}`,
      csv: toCsv(["sheet", "index", "column", "type", "first_value"], columnRows),
      label: "dump:aneel-leiloes",
      failureNote: "上面终端里的列名没有丢，CSV 只是没写成。",
    });
    console.log();
  }

  console.log("─".repeat(72));
  console.log("\n接下来要判断的三件事，都在上面的列名里：\n");
  console.log("  1. 哪一列是【预估总投资 CAPEX】—— 那个才是 estimatedValue（已确认口径）。");
  console.log("     别拿 RAP：RAP 是每年允许收的钱，跟市政合同金额并排显示会差一个量级。");
  console.log("  2. 哪一列是【标段】—— 一场拍卖有多个 lote，每个 lote 是独立的一条项目，不是一条。");
  console.log("  3. 哪一列是【中标方】和【拍卖日期】—— 这张表是结果表，对应中标方/中标金额那一侧。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
