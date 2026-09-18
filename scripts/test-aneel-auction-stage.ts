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

if (failures > 0) {
  console.error(`\n${failures} 项没通过。`);
  process.exit(1);
}
console.log("\n全部通过。");
