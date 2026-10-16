/**
 * Which pages 本地批量分析 would send to the model: the first N, as today,
 * against 「按内容选页」(lib/ingestion/page-selection.ts). Read-only — no model
 * call, no database. For trying the option on real documents before relying
 * on it (user, 2026-10-16: 后台增加这种方案，我试用看看效果).
 *
 *   npm run compare:page-selection -- "D:\tenders\LP-SM-2-2026-MDLCH-1.pdf"
 *   npm run compare:page-selection -- "D:\tenders\a.pdf" "D:\tenders\b.pdf" --pages 30
 *
 * --pages is the tier cap: 20 常规 (default), 30 中型, 40 大型. A scanned PDF
 * (under 200 characters a page) is read as 本地批量分析 reads it: its own text
 * where it has some, Tesseract OCR where it does not and Tesseract is
 * installed (lib/ingestion/page-ocr.ts).
 */
import { extractPdfText } from "../lib/ingestion/document-intake";
import { pageRanges, selectRelevantPages } from "../lib/ingestion/page-selection";
import { findTesseract, pageTextsForScan } from "../lib/ingestion/page-ocr";

const pagesIndex = process.argv.indexOf("--pages");
const maxPages = pagesIndex >= 0 ? Number(process.argv[pagesIndex + 1]) : 20;
const files = process.argv.slice(2).filter((arg, i, args) => arg !== "--pages" && args[i - 1] !== "--pages");

if (files.length === 0 || !(maxPages > 0)) {
  console.error('用法：npm run compare:page-selection -- "文件.pdf" [更多文件…] [--pages 20|30|40]');
  process.exit(1);
}

async function main() {
  for (const file of files) {
    let pageTexts = extractPdfText(file).split("\f");
    if (pageTexts.length > 1 && !pageTexts[pageTexts.length - 1].trim()) pageTexts.pop();
    const scanned = pageTexts.join("").trim().length < 200 * pageTexts.length;
    let scanNote = "";
    if (scanned) {
      const started = Date.now();
      const scan = await pageTextsForScan(file);
      pageTexts = scan.texts;
      const tesseract = findTesseract();
      scanNote = tesseract
        ? `扫描件：本机 Tesseract（${tesseract.languages.join("+")}）识别了 ${scan.ocrPages} 页，用时 ${Math.round((Date.now() - started) / 1000)} 秒`
        : `扫描件：本机没装 Tesseract，${scan.unreadPages} 页读不出文字`;
    }
    const selection = selectRelevantPages(pageTexts, maxPages, { budget: scanned ? "pages" : "chars" });
    const chars = (pages: number[]) => pages.reduce((sum, page) => sum + pageTexts[page].length, 0);
    const firstN = pageTexts.map((_, page) => page).slice(0, maxPages);

    console.log(`\n=== ${file}`);
    console.log(`共 ${pageTexts.length} 页；上限 ${maxPages} 页${scanNote ? `；${scanNote}` : ""}`);
    console.log(`  原来（前 ${maxPages} 页）：第 ${pageRanges(firstN.map((page) => page + 1))} 页，${chars(firstN).toLocaleString("en-US")} 字`);
    console.log(`  按内容选页：第 ${pageRanges(selection.pages.map((page) => page + 1))} 页，${chars(selection.pages).toLocaleString("en-US")} 字${selection.note ? "" : "（与原来相同）"}`);
    console.log("  得分最高的 12 页（页码 · 要求分 · 项目介绍分 · 命中的关键词）：");
    for (const entry of [...selection.scores].sort((a, b) => b.score - a.score).slice(0, 12)) {
      const chosen = selection.pages.includes(entry.page) ? "✓" : " ";
      console.log(`   ${chosen} 第 ${String(entry.page + 1).padStart(3)} 页 · ${entry.score.toFixed(1).padStart(5)} · ${String(entry.projectScore).padStart(2)} · ${entry.keywords.slice(0, 6).join("、")}`);
    }
  }
}

main();
