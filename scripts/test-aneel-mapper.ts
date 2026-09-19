/**
 * The ten lots, mapped, against the real captured page.
 *
 * What this is guarding is mostly the things that would be wrong SILENTLY: a
 * value invented where none exists, a status that says 招标中 for an auction
 * whose edital has not been written, and the industry tag two of these lots
 * were carrying for no reason but the name of their state.
 */
import { readAneelEditalFile } from "@/lib/ingestion/connectors/aneel-editais-file";
import { mapAneelEditalToTenders } from "@/lib/ingestion/aneel-transmissao-mapper";
import type { AneelDocumentEntry } from "@/lib/ingestion/aneel-auction-stage";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

const edital = readAneelEditalFile("lib/ingestion/__fixtures__/aneel-edital-transmissao-2026.html");
const documents: AneelDocumentEntry[] = [
  { section: "edital", title: "Despacho 3.323, de 11/11/2025 - Autorização de envio da minuta do Edital do Leilão nº 1/2026 para apreciação do TCU e abertura de prazo para visitas técnicas" },
  { section: "adendos", title: "Relação das subestações e dos contatos para agendamento de visitas às instalações existentes - Atualizado em 16/12/2025" },
];
const rows = mapAneelEditalToTenders({ edital, documents, publicationDate: "2025-11-11" }, new Date("2026-09-18T00:00:00Z"));

console.log("一个标段一条");
check("十条", rows.length, 10);
check("slug 互不相同", new Set(rows.map((row) => row.slug)).size, 10);
check("slug 形状", rows[2]?.slug, "aneel-transmissao-2026-1-lote-3");
check("标书编号带场次和标段", rows[2]?.tenderNumber, "Leilão 1/2026-ANEEL — Lote 3");

console.log("\n金额：这个阶段就是没有，不能编");
// The edital is not published, so the RAP ceiling and the investment estimate
// do not exist. 0 would read as "worth nothing" to the value floor.
check("没有 estimatedValue", rows.every((row) => row.estimatedValue === undefined), true);
check("也没有币种", rows.every((row) => row.currency === undefined), true);

console.log("\n状态：草案还在 TCU，不能标成招标中");
check("全部 planned", [...new Set(rows.map((row) => row.status))], ["planned"]);

console.log("\n行业标签：州名不能变成水务信号");
// Lot 1 is Rio de Janeiro and lot 3 is Rio Grande do Norte. Before the place
// name strip both came out ["power","water"].
check("标段 1 只有 power", rows[0]?.industries, ["power"]);
check("标段 3 只有 power", rows[2]?.industries, ["power"]);
check("十条全是 power", rows.every((row) => row.industries.join() === "power"), true);

console.log("\n标题要说清楚买的是什么");
// "Lote 3" alone says nothing, and this platform's own no-content rule would
// rightly exclude it. The installations are the description.
check("标题里有设施", /SE 500 kV Cear[áa] Mirim II/.test(rows[2]?.title.es ?? ""), true);
check("标题里有场次号", /n[ºo] 1\/2026/.test(rows[2]?.title.es ?? ""), true);
check("标题里有州", /\(RN\/CE\)/.test(rows[2]?.title.es ?? ""), true);
check("没有一条被相关度排除", rows.every((row) => row.relevance.tier !== "excluded"), true);

console.log("\n其它字段");
check("联邦级", [...new Set(rows.map((row) => row.governmentLevel))], ["federal"]);
check("工程类", [...new Set(rows.map((row) => row.scopeType))], ["works"]);
check("程序类型", [...new Set(rows.map((row) => row.procedureType))], ["Leilão de Transmissão"]);
check("地点用 UF", rows[7]?.location, "MS");
check("发布日期用传进来的那个，不标估算", [rows[0]?.publicationDate, rows[0]?.publicationDateIsEstimated], ["2025-11-11", undefined]);

// Without a real publication date the row must say so rather than pass the
// capture time off as a government date.
const undated = mapAneelEditalToTenders({ edital, documents }, new Date("2026-09-18T00:00:00Z"));
check("没有发布日期时标记为估算", undated[0]?.publicationDateIsEstimated, true);

console.log("\n子标段：暂不拆成四条");
// Whether ANEEL takes bids per sublote or per lot is not stated on the page.
// Four invented rows would be four wrong tenders instead of one honest one.
check("标段 3 仍是一条", rows.filter((row) => row.slug.endsWith("lote-3")).length, 1);
check("但摘要里点了名", /sublotes 3A, 3B, 3C, 3D/.test(rows[2]?.summary.es ?? ""), true);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
