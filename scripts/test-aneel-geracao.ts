/**
 * ANEEL's generation / capacity-auction page, against a real capture.
 *
 * lib/ingestion/__fixtures__/aneel-edital-geracao-2026.html is the 2026 page
 * of `editais_geracao/edital_geracao.cfm`, saved from a browser on
 * 2026-09-19 (6009 bytes, ISO-8859-1). Everything below was written after
 * reading it, not before.
 *
 * The transmission reader could not have been reused as-is, and each of these
 * groups is one reason why — measured, not assumed: running the transmission
 * mapper over this page produced ZERO rows.
 *
 * Usage: npm run test:aneel-geracao
 */
import { readAneelGeracaoFile } from "../lib/ingestion/connectors/aneel-editais-file";
import { mapAneelGeracaoToTenders, admitsNewProjects, ANEEL_GERACAO_SOURCE_NAME } from "../lib/ingestion/aneel-geracao-mapper";

const FIXTURE = "lib/ingestion/__fixtures__/aneel-edital-geracao-2026.html";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}\n      实际 ${a}\n      期望 ${b}`);
  }
}

const editais = readAneelGeracaoFile(FIXTURE);

console.log("一页多场 —— 输电页只有一场，这一页有两场");
// A whole-document reader returns the first auction and silently drops the
// rest. That silence is the whole reason parseAneelAuctionBlock exists.
check("读出 2 场", editais.length, 2);
check("按页面顺序，003 在前", [editais[0]?.auctionNumber, editais[1]?.auctionNumber], [3, 2]);
check("都是 2026", [...new Set(editais.map((e) => e.year))], [2026]);
check("segment 标成 geracao", [...new Set(editais.map((e) => e.segment))], ["geracao"]);

console.log("\n标题里没有 Nº —— 输电页有，这一页没有");
// "LEILÃO DE GERAÇÃO ANEEL 003/2026", not "ANEEL Nº 003/2026". A pattern that
// required the Nº read this page's heading as null.
check("标题读出来了", editais[0]?.heading, "LEILÃO DE GERAÇÃO ANEEL 003/2026");
check("重音没被解码毁掉", /GERAÇÃO/.test(editais[0]?.heading ?? ""), true);
check("Objeto 里的重音也活着", /Potência|Óleo/.test(editais[0]?.objeto ?? ""), true);
check("第二场的 Objeto 是另一种技术", /Gás Natural, Carvão Mineral e UHEs/.test(editais[1]?.objeto ?? ""), true);

console.log("\n没有标段 —— 这是整场一条的原因");
check("Empreendimentos 是空的", [editais[0]?.lotes.length, editais[1]?.lotes.length], [0, 0]);

console.log("\n链接：路径和输电页不同，而且没有 R1–R5");
// Rebuilding this URL from the transmission base gives a 404: the two
// applications are served from different paths.
check(
  "文档页用的是 /aplicacoes/，不是 /aplicacoes_liferay/",
  editais[0]?.links.documentosUrl,
  "https://www2.aneel.gov.br/aplicacoes/editais_geracao/documentos_editais.cfm?IdProgramaEdital=222",
);
check("第二场是另一个 IdProgramaEdital", /IdProgramaEdital=221$/.test(editais[1]?.links.documentosUrl ?? ""), true);
// No frmcdt.cfm anywhere on this page — so the per-lot economic studies that
// would carry an investment figure do not exist on this side at all.
check("没有 R1–R5 报告链接", [editais[0]?.links.relatoriosUrl, editais[1]?.links.relatoriosUrl], [null, null]);
check("两场各有自己的公众咨询链接", [
  /ideParticipacaoPublica=3971/.test(editais[0]?.links.consultaPublicaUrl ?? ""),
  /ideParticipacaoPublica=3970/.test(editais[1]?.links.consultaPublicaUrl ?? ""),
], [true, true]);

console.log("\n年份选择器在每一块之外，要从整页补回来");
check("每一场都带着年份列表", [editais[0]?.availableYears.length, editais[1]?.availableYears.length], [27, 27]);
check("1988 也在（比输电页还早）", editais[0]?.availableYears.includes(1988), true);

console.log("\nnovos / existentes —— 决定这场有没有设备采购机会");
check("「novos e existentes」→ 有新建", admitsNewProjects("a partir de empreendimentos de geração novos e existentes"), true);
check("「existentes」→ 没有新建", admitsNewProjects("a partir de empreendimentos de geração existentes"), false);
check("读不到 Objeto 时按没有新建处理", admitsNewProjects(null), false);

const rows = editais.flatMap((edital) => mapAneelGeracaoToTenders({ edital }, new Date("2026-09-19T00:00:00Z")));

console.log("\n映射：整场一条");
check("两场 → 两条", rows.length, 2);
check("slug 按场次编号", rows.map((r) => r.slug), ["aneel-geracao-2026-3", "aneel-geracao-2026-2"]);
check("来源名和输电分开", [...new Set(rows.map((r) => r.sourceName))], [ANEEL_GERACAO_SOURCE_NAME]);
check("联邦级", [...new Set(rows.map((r) => r.governmentLevel))], ["federal"]);
check("行业带 power", rows.every((r) => r.industries.includes("power")), true);

console.log("\nscopeType 跟着 novos / existentes 走");
// 003/2026 re-contracts capacity from plants that already exist — there is
// nothing to sell into. 002/2026 admits new projects. Two nearly identical
// Portuguese sentences, opposite answers for a supplier.
check("003（仅已有）→ services", rows[0]?.scopeType, "services");
check("002（含新建）→ works", rows[1]?.scopeType, "works");
check("摘要里用中文点破「仅面向已有」", /没有新建设备采购机会/.test(rows[0]?.summary.es ?? ""), true);
check("含新建的那条不说这句", /没有新建设备采购机会/.test(rows[1]?.summary.es ?? ""), false);

console.log("\n标题：不能把整句样板文抄进去");
// The Objeto joins the technology to the boilerplate with a COMMA, inside a
// dash-delimited segment — splitting on the dash alone put a 30-word sentence
// in the title.
check("标题是干净的", rows[0]?.title.es, "Leilão de Geração ANEEL nº 3/2026 — LRCAP — UTEs a Óleo e Biodiesel");
check("标题里没有 destinado a", /destinado a/i.test(rows[0]?.title.es ?? ""), false);
check("第二场的技术也切对了", rows[1]?.title.es, "Leilão de Geração ANEEL nº 2/2026 — LRCAP — UTEs a Gás Natural, Carvão Mineral e UHEs");

console.log("\n分级与状态");
// A federal capacity auction is flagship on its procedure — see
// isFederalConcessionAuction. Neither row has an amount, and there is no page
// on this side that carries one.
check("两条都是大型项目", [...new Set(rows.map((r) => r.relevance.tier))], ["flagship"]);
check("没有 estimatedValue", rows.every((r) => r.estimatedValue === undefined), true);
check("没传文档清单时是 planned", [...new Set(rows.map((r) => r.status))], ["planned"]);
check("没传发布日期时标记为估算", rows.every((r) => r.publicationDateIsEstimated === true), true);
check("摘要里给出标书链接", /documentos_editais\.cfm/.test(rows[0]?.summary.es ?? ""), true);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
