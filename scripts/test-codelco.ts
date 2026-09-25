/**
 * Codelco public calls: the table parser, the five ways the page writes a
 * date, which calls are still open, and the tiers, against the real table
 * captured on 2026-09-25 (lib/ingestion/__fixtures__/codelco-licitaciones-en-proceso-2026-09-25.html).
 *
 * On the capture date nothing was open, so the open/closed cases are replayed
 * as of 2026-07-05, when the SX-EW chemicals call and others still were.
 *
 * Usage: npm run test:codelco
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codelcoCallIsOpen, lastDateIn, parseCodelcoTable } from "@/lib/ingestion/connectors/codelco-live";
import { codelcoTenderNumber, mapCodelcoCallToTender } from "@/lib/ingestion/codelco-mapper";
import { santiagoToday } from "@/lib/ingestion/ingest-codelco";
import { platformDay } from "@/lib/tender-status";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

const html = readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/codelco-licitaciones-en-proceso-2026-09-25.html"), "utf8");
const calls = parseCodelcoTable(html);
const find = (needle: string) => calls.find((call) => call.subject.includes(needle))!;

console.log("codelco\n");
console.log("表格");
check("51 行全部解析", calls.length, 51);
check("找不到表格时报错", (() => { try { parseCodelcoTable("<html></html>"); return false; } catch { return true; } })(), true);
check("SX-EW 化学品：总部", find("SX-EW").operation, "Casa Matriz");
check("链接是绝对地址", find("SX-EW").link?.startsWith("https://www.codelco.com/prontus_codelco/"), true);

console.log("\n日期的五种写法");
check("16 de Julio de 2026", lastDateIn("… vía email a X hasta 16 de Julio de 2026.", "2026"), "2026-07-16");
check("desde … hasta …：取后一个", lastDateIn("desde el 25 de mayo de 2026 hasta 29 de Junio de 2026.", "2026"), "2026-06-29");
check("hasta el 22 de diciembre 2025（没有 de）", lastDateIn("hasta el 22 de diciembre 2025", "2025"), "2025-12-22");
check("27-11-2025", lastDateIn("hasta el 27-11-2025 a las 17:00 hrs", "2025"), "2025-11-27");
check("09.01.2025", lastDateIn("ofertas hasta el 09.01.2025 a las 16:00 hrs.", "2024"), "2025-01-09");
check("19/08/2024", lastDateIn("hasta 19/08/2024 a las 18:00 hrs", "2024"), "2024-08-19");
check("04 de abril del año 2024", lastDateIn("hasta el 04 de abril del año 2024", "2024"), "2024-04-04");
check("28 de marzo.（没有年份，取发布年份）", lastDateIn("hasta el 28 de marzo.", "2024"), "2024-03-28");
check("hasta la recepción de ofertas：没有日期", lastDateIn("hasta la recepción de ofertas", "2026"), undefined);

console.log("\n还开着的（截至 2026-09-25 与 2026-07-05）");
check("2026-09-25 一条都没开着", calls.filter((call) => codelcoCallIsOpen(call, "2026-09-25")).length, 0);
check("SX-EW 化学品在 7-05 还在报名期", codelcoCallIsOpen(find("SX-EW"), "2026-07-05"), true);
check("印刷品在 7-05 已过报名期（6-29）", codelcoCallIsOpen(find("Impresos"), "2026-07-05"), false);
check("没写日期的，发布 30 天内算开着", codelcoCallIsOpen(find("Fortificación"), "2026-06-20"), true);
check("没写日期的，超过 30 天不算", codelcoCallIsOpen(find("Fortificación"), "2026-07-05"), false);
check("圣地亚哥日期", santiagoToday(new Date("2026-09-25T02:00:00Z")), "2026-09-24");

console.log("\n编号");
check("Ariba 事件号 WS…（同时有 Doc 时取 WS）", codelcoTenderNumber(find("Doc2151697849")), "WS1942644289");
check("Doc…", codelcoTenderNumber(find("Doc2139010271")), "Doc2139010271");
check("没有事件号时用日期+标题", codelcoTenderNumber(find("SX-EW")).startsWith("CODELCO-2026-07-01-"), true);

console.log("\n档位");
const at = (needle: string, today: string) => mapCodelcoCallToTender(find(needle), today, new Date(`${today}T12:00:00Z`));
const sxew = at("SX-EW", "2026-07-05")!;
check("SX-EW 化学品（总部统一采购）→ 中型", sxew.relevance.tier, "significant");
check("行业含能源矿业", sxew.industries.includes("energy_mining"), true);
check("报名截止写进截止日（网站按墨西哥城时间显示为 7-16）", platformDay(sxew.submissionDeadline!), "2026-07-16");
check("发布日期显示为同一天", platformDay(sxew.publicationDate), "2026-07-01");
check("摘要写明是报名截止、标书在 Ariba", /Manifestación de interés hasta el 2026-07-16/.test(sxew.summary.es), true);
check("印刷品 → 排除", at("Impresos", "2026-06-10")?.relevance.tier, "excluded");
check("桌椅 → 排除", at("Sillas", "2026-05-10")?.relevance.tier, "excluded");
check("电缆（总部）→ 中型", at("Cables eléctricos", "2026-04-10")?.relevance.tier, "significant");
check("活动策划（服务）→ 排除", at("Organizadoras de Eventos", "2025-05-20")?.relevance.tier, "excluded");
check("Gabriela Mistral 矿区的建设安装（服务但有施工）→ 常规", at("S03.00.00", "2026-05-10")?.relevance.tier, "standard");
check("RFI 电缆 → 预告", at("RFI Cables", "2025-12-10")?.status, "planned");
check("已过报名期的不映射", at("SX-EW", "2026-09-25"), null);

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
