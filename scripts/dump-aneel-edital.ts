/**
 * Prints what readAneelEditalFile() got out of a saved ANEEL auction page.
 *
 * The page is behind a Cloudflare challenge a script cannot pass, so it comes
 * from the browser: open
 * www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm,
 * pick a year in its own selector, Ctrl+S as "Webpage, HTML only", run this.
 *
 * Usage:
 *   npm run dump:aneel-edital -- edital_transmissao.cfm.html
 */
import { existsSync } from "node:fs";
import { readAneelEditalFile } from "@/lib/ingestion/connectors/aneel-editais-file";

const file = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!file || !existsSync(file)) {
  console.error("用法：npm run dump:aneel-edital -- <存下来的页面>.html");
  console.error("页面：https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm");
  console.error("（脚本过不了 Cloudflare 的验证，浏览器可以 —— 选好年份后 Ctrl+S 存「网页，仅 HTML」）");
  process.exit(1);
}

const edital = readAneelEditalFile(file);

console.log(`${edital.heading ?? "（没读到标题）"}\n`);
console.log(`场次 ${edital.auctionNumber ?? "?"} / ${edital.year ?? "?"} · 标段 ${edital.lotes.length} 个`);
console.log(`Objeto 涉及 ${edital.objetoStates.length} 个州：${edital.objetoStates.join("、")}\n`);

for (const lote of edital.lotes) {
  const kind = [lote.hasNewInstallations ? "新建" : null, lote.hasContinuity ? "续期" : null].filter(Boolean).join(" + ") || "未标注";
  console.log(`LOTE ${lote.number}  ${lote.ufs.join("/") || "（州未读出）"}  ${kind}  最高 ${lote.maxVoltageKv ?? "?"} kV  设施 ${lote.installations.length} 条${lote.sublotes.length > 0 ? `  子标段 ${lote.sublotes.join("、")}` : ""}`);
  for (const installation of lote.installations) console.log(`    · ${installation}`);
}

console.log(`\n钱不在这一页上。RAP 上限和预估投资在这两处：`);
console.log(`  edital 及附件：${edital.links.documentosUrl ?? "（页面上没有）"}`);
console.log(`  R1–R5 研究报告：${edital.links.relatoriosUrl ?? "（页面上没有）"}`);
if (edital.links.consultaPublicaUrl) console.log(`  前置的公开征求意见：${edital.links.consultaPublicaUrl}`);

console.log(`\n这一页的年份下拉有 ${edital.availableYears.length} 个年份（${edital.availableYears.at(-1)}–${edital.availableYears[0]}）——`);
console.log("每个年份就是一次 POST，历史场次可以按年一场一场翻出来。");
