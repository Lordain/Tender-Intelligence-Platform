/**
 * Petroperú "Competencia internacional": the list parser, the documents
 * parser, which rows are calls, when a call is over, the relevance rules, the
 * five-day window and the 见招标文件 deadline — against the page and the
 * documents of five rows as read on 2026-09-25
 * (lib/ingestion/__fixtures__/petroperu-competencia-internacional-2026-09-25.json).
 *
 * Neither PCI call on the page is open today, so the open cases are the real
 * calls cut back to the documents they had in their first days.
 *
 * Usage: npm run test:petroperu
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePetroperuDocuments, parsePetroperuList, type PetroperuCall } from "@/lib/ingestion/connectors/petroperu-live";
import { isPetroperuCall, mapPetroperuCallToTender, petroperuClosingDocument, petroperuDocumentLinks } from "@/lib/ingestion/petroperu-mapper";
import { ingestPetroperu, PETROPERU_WINDOW_DAYS } from "@/lib/ingestion/ingest-petroperu";
import { deadlineIsInDocuments } from "@/lib/deadline-in-documents";
import { toTenderCardData } from "@/lib/tender-card";
import { toTenderListItem } from "@/lib/tender-list-page";
import { toPublicTenderDetail } from "@/lib/public-tender";
import { classifyStoredTender } from "@/lib/relevance";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

type Fixture = { html: string; documents: Record<string, Parameters<typeof parsePetroperuDocuments>[0]> };
const fixture = JSON.parse(
  readFileSync(join(__dirname, "../lib/ingestion/__fixtures__/petroperu-competencia-internacional-2026-09-25.json"), "utf8"),
) as Fixture;

const rows = parsePetroperuList(fixture.html);
const documents = Object.fromEntries(Object.entries(fixture.documents).map(([id, response]) => [id, parsePetroperuDocuments(response)]));
const row = (id: string) => rows.find((r) => r.id === id)!;
/** A real call as it stood when only its first `count` documents were up. */
const early = (id: string, count: number): PetroperuCall => ({ ...row(id), documents: documents[id].slice(0, count) });

async function main() {
  console.log("petroperu\n");

  console.log("列表");
  check("第一页 20 行", rows.length, 20);
  check("最新一行", [rows[0].id, rows[0].publishedOn, rows[0].code], ["464", "2026-09-07", "CAI-0001-2026-OFP"]);
  check("西语月份缩写（Ago、Dic、Ene）", [row("463").publishedOn, row("451").publishedOn, row("457").publishedOn], ["2026-08-21", "2025-12-29", "2026-01-30"]);
  check("只有 2 行是正式招标（PCI）", rows.filter(isPetroperuCall).map((r) => r.code), ["PCI-0002-2025-OFP – segunda convocatoria", "PCI-0001-2025-OTL"]);
  let threw = false;
  try {
    parsePetroperuList("<html>maintenance</html>");
  } catch {
    threw = true;
  }
  check("页面结构变了时报错，而不是当成 0 行", threw, true);

  console.log("\n文件");
  check("催化剂招标 33 个文件", documents["445"].length, 33);
  check("按上传顺序排", documents["445"][0].name, "Hoja de proceso");
  check("链接是完整地址", documents["445"][0].url.startsWith("https://www.petroperu.com.pe/Storage/tbl_documentos_del_proceso/"), true);
  check("CAI 行的文件是事后公示", documents["463"].map((d) => d.name), ["Informe técnico", "Orden de compra"]);

  console.log("\n是否已结束（看最新一个文件）");
  check("催化剂：最新是 ACTA BUENA PRO", petroperuClosingDocument({ ...row("445"), documents: documents["445"] }), "ACTA BUENA PRO");
  check("整体转型：最新是取消", petroperuClosingDocument({ ...row("447"), documents: documents["447"] }), "Cancelación de proceso");
  check("第一次授标后又被宣告无效、日程继续改 → 仍在进行", petroperuClosingDocument(early("445", documents["445"].findIndex((d) => /nulidad/i.test(d.name)) + 2)), undefined);
  check("已结束的不映射", mapPetroperuCallToTender({ ...row("445"), documents: documents["445"] }), null);
  check("CAI 行即使没有结束文件也不映射", mapPetroperuCallToTender({ ...row("463"), documents: [] }), null);

  console.log("\n映射（发布头几天的样子）");
  const catalyst = mapPetroperuCallToTender(early("445", 6), new Date("2025-11-01T15:00:00Z"))!;
  check("催化剂 → 中型", catalyst.relevance.tier, "significant");
  check("行业含能源矿业", catalyst.industries.includes("energy_mining"), true);
  check("货物类", catalyst.scopeType, "equipment");
  check("slug", catalyst.slug, "petroperu-pci-0001-2025-otl");
  check("没有截止日（见招标文件）", catalyst.submissionDeadline, undefined);
  check("发布日期按利马中午", catalyst.publicationDate, "2025-10-30T17:00:00.000Z");
  check("国家", catalyst.country, "Peru");
  const links = petroperuDocumentLinks(early("445", 6), catalyst.publicationDate);
  check("6 个文件都成为链接，文件名用文件标题", links.map((l) => l.fileName), [
    "Hoja de proceso.pdf",
    "Bases del proceso.pdf",
    "Carta invitación.pdf",
    "Condiciones técnicas.pdf",
    "Pliego de presentacion de consultas.docx",
    "Proforma de contrato.pdf",
  ]);
  const transformation = mapPetroperuCallToTender(early("447", 1), new Date("2025-11-20T15:00:00Z"))!;
  check("整体转型（咨询服务）→ 排除", [transformation.scopeType, transformation.relevance.tier], ["services", "excluded"]);

  console.log("\n近 5 天发布");
  check("默认窗口 5 天", PETROPERU_WINDOW_DAYS, 5);
  const earlyDocs = { "445": documents["445"].slice(0, 6), "447": documents["447"].slice(0, 1) };
  const onDay3 = await ingestPetroperu(null, { write: false, rows, documents: earlyDocs, now: new Date("2025-11-02T15:00:00Z") });
  check("发布第 3 天：导入催化剂", onDay3.kept.map((t) => t.tenderNumber), ["PCI-0001-2025-OTL"]);
  const onDay12 = await ingestPetroperu(null, { write: false, rows, documents: earlyDocs, now: new Date("2025-11-11T15:00:00Z") });
  check("发布第 12 天：不再导入", onDay12.kept.length, 0);
  const onSecondCall = await ingestPetroperu(null, { write: false, rows, documents: earlyDocs, now: new Date("2025-11-21T15:00:00Z") });
  check("第二次召集读到了，但被规则排除", onSecondCall.calls.map((c) => [c.call.id, c.skipReason?.startsWith("筛选规则") ?? false]), [["447", true]]);
  const today = await ingestPetroperu(null, { write: false, rows, documents, now: new Date("2026-09-25T15:00:00Z") });
  check("今天（2026-09-25）：近 5 天没有 PCI，也不去读任何文件", [today.calls.length, today.kept.length, today.staleWarning], [0, 0, null]);
  const empty = await ingestPetroperu(null, { write: false, rows: [], documents: {}, now: new Date("2026-09-25T15:00:00Z") });
  check("列表为空时警告", empty.staleWarning !== null, true);

  console.log("\n截止日显示「见招标文件」");
  check("Petroperú 没有截止日 → 见招标文件", deadlineIsInDocuments(catalyst), true);
  check("Petroperú 有了截止日（手动填的）→ 显示日期", deadlineIsInDocuments({ ...catalyst, submissionDeadline: "2025-12-01T17:00:00.000Z" }), false);
  check("其他来源没有截止日 → 仍是未提供", deadlineIsInDocuments({ ...catalyst, sourceName: "SEACE" }), false);
  // What a stored row carries after migration 0050; the mapper leaves it to the database.
  const stored = { ...catalyst, publicSlug: "p-test" };
  check("卡片带上标记", toTenderCardData(stored).deadlineInDocuments, true);
  check("列表带上标记", toTenderListItem(stored).deadlineInDocuments, true);
  check("公开详情带上标记", toPublicTenderDetail(stored).deadlineInDocuments, true);
  check("卡片不带来源名", JSON.stringify(toTenderCardData(stored)).includes("Petroperú —"), false);
  check("其他项目的卡片没有这个字段", "deadlineInDocuments" in toTenderCardData({ ...stored, sourceName: "SEACE" }), false);

  console.log("\n只作用于 Petroperú");
  const elsewhere = classifyStoredTender({
    title: catalyst.title.es,
    summary: catalyst.summary.es,
    buyer: "MUNICIPALIDAD DE EJEMPLO",
    country: "Peru",
    governmentLevel: "municipal",
    scopeType: "equipment",
    procedureType: "Licitación Pública",
    tenderNumber: "LP-1-2025",
    sourceName: "SEACE",
  });
  check("同一标题来自 SEACE 时仍走通用规则", elsewhere.relevance.tier !== "significant", true);

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
