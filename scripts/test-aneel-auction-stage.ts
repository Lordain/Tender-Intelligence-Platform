/**
 * Where an ANEEL auction is, pinned against the real document list.
 *
 * The strings below are copied from
 * `documentos_editais.cfm?IdProgramaEdital=220` (Leilão 001/2026) as it stood
 * on 2026-09-18. The case that matters is the first one, and it is a trap:
 * the "Edital" section HAS a file, so any rule that counts files would call
 * this auction open — while the file is an order authorising the DRAFT to be
 * sent to the TCU for review. Marking it 招标中 would put a tender in the feed
 * that nobody can bid on, with an amount that does not exist yet.
 */
import { findConsultaForAuction } from "../lib/ingestion/aneel-consulta-publica";
import { readAneelAuctionStage, type AneelDocumentEntry } from "@/lib/ingestion/aneel-auction-stage";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      得到 ${JSON.stringify(actual)}\n      期望 ${JSON.stringify(expected)}`}`);
}

// Real, verbatim.
const LEILAO_1_2026: AneelDocumentEntry[] = [
  {
    section: "edital",
    title: "Despacho 3.323, de 11/11/2025 - Autorização de envio da minuta do Edital do Leilão nº 1/2026 para apreciação do TCU e abertura de prazo para visitas técnicas",
  },
  {
    section: "adendos",
    title: "Relação das subestações e dos contatos para agendamento de visitas às instalações existentes - Atualizado em 16/12/2025",
  },
];

console.log("Leilão 001/2026 的真实文件清单");
const reading = readAneelAuctionStage(LEILAO_1_2026);
// The trap: the section is non-empty, and the auction is still pre-edital.
check("阶段是「送 TCU 审」，不是「已发标」", reading.stage, "tcu_review");
check("状态是 planned，不是 open", reading.status, "planned");
check("踏勘窗口已开", reading.technicalVisitsOpen, true);
check("说明里点明了金额还不存在", /金额还不存在/.test(reading.note), true);

console.log("\n发标之后");
check(
  "真正的 edital 出现 → open",
  readAneelAuctionStage([...LEILAO_1_2026, { section: "edital", title: "Edital do Leilão nº 1/2026" }]).status,
  "open",
);
// A published edital must not be defeated by the older despacho sitting in the
// same section — the two coexist on ANEEL's page for the whole auction.
check(
  "旧的 despacho 还在也不影响",
  readAneelAuctionStage([...LEILAO_1_2026, { section: "edital", title: "Edital do Leilão nº 1/2026" }]).stage,
  "edital_published",
);

console.log("\n拍完之后");
check(
  "有结果/纪要 → awarded",
  readAneelAuctionStage([
    ...LEILAO_1_2026,
    { section: "edital", title: "Edital do Leilão nº 1/2026" },
    { section: "relatorios", title: "Ata do Leilão nº 1/2026" },
  ]).status,
  "awarded",
);

console.log("\n边界");
check("一份文件都没有 → planned", readAneelAuctionStage([]).status, "planned");
check("一份文件都没有 → announced", readAneelAuctionStage([]).stage, "announced");
// A file whose title says neither "edital" nor "minuta" is not evidence of
// anything; treating it as a published edital is the expensive mistake.
check(
  "标题看不出是什么的文件 → 仍按未发布",
  readAneelAuctionStage([{ section: "edital", title: "Comunicado sobre o cronograma" }]).stage,
  "announced",
);
check("没有踏勘字样时不谎报", readAneelAuctionStage([{ section: "adendos", title: "Relação das subestações" }]).technicalVisitsOpen, false);

console.log("\n公众咨询：比送 TCU 更早的一站");
// Measured 2026-09-19 against CP 032/2026, the draft edital of Leilão de
// Transmissão 1/2027 — the stage the user asked to track, and the first one
// that carries an investment figure at all.
const CP_1_2027 = findConsultaForAuction(1, 2027, "transmissao");
check("注册表里有 1/2027 的公众咨询", CP_1_2027 !== null, true);
check(
  "有公众咨询、没有别的文件 → consulta_publica",
  readAneelAuctionStage([], CP_1_2027, new Date("2026-09-19T00:00:00Z")).stage,
  "consulta_publica",
);
check(
  "公众咨询阶段仍然是 planned",
  readAneelAuctionStage([], CP_1_2027, new Date("2026-09-19T00:00:00Z")).status,
  "planned",
);
// The window is what a bidder acts on, so the note has to carry the date.
check(
  "窗口开着时说明里有截止日",
  /2026-10-26/.test(readAneelAuctionStage([], CP_1_2027, new Date("2026-09-19T00:00:00Z")).note),
  true,
);
check(
  "窗口开着时说明里有金额",
  /12,9 bi/.test(readAneelAuctionStage([], CP_1_2027, new Date("2026-09-19T00:00:00Z")).note),
  true,
);
// Same consultation read after it closes must not still say "进行中" — a
// closed window is the difference between "you can still object to the spec"
// and "the spec is now what you have to build to".
check(
  "过了截止日 → 说明改口",
  /已结束/.test(readAneelAuctionStage([], CP_1_2027, new Date("2026-11-01T00:00:00Z")).note),
  true,
);
check(
  "还没开始 → 说明也改口",
  /尚未开始/.test(readAneelAuctionStage([], CP_1_2027, new Date("2026-08-01T00:00:00Z")).note),
  true,
);
// Ordering: everything the document page evidences happened AFTER the
// consultation, so it must win. A consultation that stays visible on the page
// must never drag a published edital back to `planned`.
check(
  "已发标时公众咨询不能把它拉回 planned",
  readAneelAuctionStage(
    [{ section: "edital", title: "Edital do Leilão nº 1/2026" }],
    CP_1_2027,
    new Date("2026-09-19T00:00:00Z"),
  ).stage,
  "edital_published",
);
check(
  "送 TCU 审优先于公众咨询",
  readAneelAuctionStage(LEILAO_1_2026, CP_1_2027, new Date("2026-09-19T00:00:00Z")).stage,
  "tcu_review",
);
// ANEEL also names the consultation in its own document titles, so the stage
// is reachable without the seeded record.
check(
  "文档标题里写了 consulta pública 也能认出来",
  readAneelAuctionStage([{ section: "edital", title: "Consulta Pública nº 032/2026 — minuta do edital" }]).stage,
  "consulta_publica",
);
check(
  "CP 032/2026 这种缩写也认",
  readAneelAuctionStage([{ section: "anexos", title: "Contribuições recebidas — CP 032/2026" }]).stage,
  "consulta_publica",
);
// And the stage must not fire on an unrelated title that merely mentions the public.
check(
  "普通文件不会被误判成公众咨询",
  readAneelAuctionStage([{ section: "anexos", title: "Relação das subestações" }]).stage,
  "announced",
);

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
