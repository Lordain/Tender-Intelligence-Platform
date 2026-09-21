/**
 * Does PNCP already carry the notices the DOU would import?
 *
 * ── Why this has to be measured before a single DOU row is written ────────
 *
 * The DOU was worth reading because three things reach it and never reach
 * PNCP: concessions (not a *contratação* under Lei 14.133/2021), Seção 1 acts,
 * and state enterprises running their own procurement. That argument is about
 * what PNCP CANNOT carry. It says nothing about the overlap — and the four
 * machine-readable notices captured on 2026-09-18 are federal works published
 * through Compras.gov.br, which is exactly the traffic Lei 14.133 requires to
 * be in PNCP.
 *
 * So the likely shape is the uncomfortable one: the notices this platform can
 * parse are the ones it already has, and the one PNCP structurally cannot
 * carry (the Flona do Bom Futuro forest concession) is the prose one
 * dou-detail.ts refuses to map. This probe is here to confirm or kill that,
 * because the two outcomes lead to opposite connectors.
 *
 * ── And the second question, which decides whether dedup is even possible ─
 *
 * The two sources share NO identifier today:
 *
 *   PNCP row  → orgao_cnpj + numero_sequencial + ano, keyed as
 *               `numero_controle_pncp` = "<CNPJ>-1-<sequencial>/<ano>",
 *               and the upsert dedups on slug = `brazil-<that>`.
 *   DOU notice → the Comprasnet `compra` id in the edital link, which
 *               decomposes as UASG(6) + modalidade(2) + número(5) + ano(4).
 *               Confirmed on 4 of 4 captures: 39302403000512026 is UASG
 *               393024, modalidade 03, Concorrência 51, 2026.
 *
 * UASG is not CNPJ and PNCP's sequencial is not the edital number, so a DOU
 * import today would create a SECOND row for every tender PNCP already has —
 * and duplicates in this feed are not cosmetic: the same tender appears twice
 * with different deadlines, because the DOU gives Data de Abertura and PNCP
 * gives data_fim_vigencia.
 *
 * This prints the whole field list of a matched PNCP row, so the answer to
 * "is there any join key at all" comes from the payload rather than from
 * recollection of PNCP's API docs.
 *
 * Writes nothing, anywhere. No Supabase.
 *
 *   Actions → Probe Brazil doors → what=pncp-overlap
 *   npm run probe:pncp-overlap
 */
import { readFileSync, readdirSync } from "node:fs";
import { parseDouDetail, decodeComprasnetId, type DouDetail } from "@/lib/ingestion/dou-detail";

const DETAIL_DIR = "lib/ingestion/__fixtures__/dou/detail";
const SEARCH_URL = "https://pncp.gov.br/api/search";
const TIMEOUT_MS = 45_000;

async function search(q: string): Promise<{ items: Record<string, unknown>[]; error?: string }> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=10`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "TenderIntelligencePlatform/1.0 (open-data ingestion)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { items: [], error: `HTTP ${response.status} ${response.statusText}` };
    const body = (await response.json()) as { items?: unknown };
    return { items: Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [] };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** The first words of the object — long enough to be this tender, short enough that PNCP's index still matches it. */
function objectQuery(detail: DouDetail): string {
  return (detail.object ?? "").split(/\s+/).slice(0, 12).join(" ");
}

async function main() {
  const files = readdirSync(DETAIL_DIR).filter((f) => f.endsWith(".html")).sort();
  const labelled = files
    .map((f) => [f, parseDouDetail(readFileSync(`${DETAIL_DIR}/${f}`, "utf8"))] as const)
    .filter(([, d]) => d.shape === "comprasnet");

  console.log(`DOU × PNCP 重叠探测 —— ${files.length} 份详情页里 ${labelled.length} 份是标签式，逐条去 PNCP 里找\n`);

  let found = 0;
  let missing = 0;
  let unreachable = 0;
  let firstHit: Record<string, unknown> | undefined;

  for (const [file, detail] of labelled) {
    const compras = decodeComprasnetId(detail.editalUrl);
    const label = `${detail.instrument ?? "?"} ${detail.number ?? "?"}`;
    console.log(`── ${label}  (${file})`);
    console.log(`   Comprasnet: ${compras ? `UASG ${compras.uasg}，模式 ${compras.modalidade}，第 ${compras.numero} 号，${compras.ano} 年` : "编号解不出来"}`);

    const q = objectQuery(detail);
    const result = await search(q);
    if (result.error !== undefined) {
      unreachable += 1;
      console.log(`   PNCP 没问到：${result.error}  ← 这是「够不着」，不是「PNCP 里没有」\n`);
      continue;
    }
    // A hit is claimed only when the tender's own number appears in the row —
    // a free-text search matching the object text alone would call every
    // highway job in Brazil the same tender.
    const hits = result.items.filter((row) => {
      const blob = JSON.stringify(row);
      return detail.number !== undefined && blob.includes(detail.number.split("/")[0]);
    });
    if (hits.length > 0) {
      found += 1;
      firstHit ??= hits[0];
      console.log(`   PNCP 里有：${result.items.length} 条命中，其中 ${hits.length} 条带着同一个标号 → 会重复\n`);
    } else {
      missing += 1;
      console.log(`   PNCP 里没找到（检索回了 ${result.items.length} 条，都不带这个标号）→ 这条是 DOU 独有的\n`);
    }
  }

  console.log(`── ${found} 条 PNCP 已有，${missing} 条 DOU 独有，${unreachable} 条没问到 ──`);
  if (unreachable === labelled.length) {
    console.log("一条都没问到。PNCP 对这台机器不开，换台机器跑，别把这当成「没有重叠」。");
    process.exitCode = 1;
    return;
  }
  if (firstHit !== undefined) {
    // The whole point of the second question: is there any field on a PNCP row
    // that a DOU notice also carries? Printed rather than recalled.
    console.log("\n── 一条 PNCP 命中行的全部字段（看有没有能对上的连接键）──");
    for (const [key, value] of Object.entries(firstHit).sort(([a], [b]) => a.localeCompare(b))) {
      const shown = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
      console.log(`   ${key.padEnd(30)} ${shown.slice(0, 90)}`);
    }
    console.log("\n找 UASG / 采购单位编号 / 标号那几个字段。有 → 可以按号去重；没有 → 只能靠规则不让两边抓同一类。");
  }
  if (found > 0) {
    console.log(`\n${found} 条会和 PNCP 撞车。DOU 导入必须先有去重键，或者只导 PNCP 结构上装不下的那些（特许、第一节的批复、自建门户的国企）。`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
