/**
 * Imports one ANEEL transmission auction from a saved copy of its page.
 *
 * Until 2026-09-19 every piece of the ANEEL work — the lot parser, the page
 * reader, the stage model, the mapper — was complete and referenced nowhere.
 * This is the wiring that makes it runnable.
 *
 * ── Why a file and not a fetch ────────────────────────────────────────────
 *
 * www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm
 * sits behind a Cloudflare challenge that a script cannot pass and a real
 * browser can, measured from two networks on 2026-09-18. So the page is saved
 * from a browser (Ctrl+S) and passed in here — the same shape as Compras MX,
 * Ecopetrol and Proyectos México. See `npm run dump:aneel-edital` for the
 * capture instructions.
 *
 * ── The year selector is a POST ───────────────────────────────────────────
 *
 * Picking a year in the dropdown does nothing on its own: the form POSTs back
 * to the same URL, so **you must click "Pesquisar" and wait for the page to
 * reload before saving**. Saving straight after changing the dropdown gives a
 * byte-identical copy of the year you were already on — which is exactly what
 * happened on the first attempt at capturing 2025.
 *
 * Usage:
 *   npm run ingest:aneel -- path/to/edital_transmissao.cfm.html             (dry run)
 *   npm run ingest:aneel -- path/to/page.html --write                       (upserts)
 *   npm run ingest:aneel -- path/to/page.html --published 2025-11-11        (real publication date)
 *   npm run ingest:aneel -- path/to/page.html --documents docs.json         (the documentos_editais list)
 *   npm run ingest:aneel -- --consultas                                     (just list the tracked consultations)
 *
 * `--documents` takes a JSON array of { section, title, url? } read off
 * `documentos_editais.cfm?IdProgramaEdital=<id>`; without it the auction is
 * staged from its consultation alone, which is correct but coarser.
 */
import { readFileSync } from "node:fs";
import { readAneelEditalFile } from "../lib/ingestion/connectors/aneel-editais-file";
import { mapAneelEditalToTenders, ANEEL_SOURCE_NAME } from "../lib/ingestion/aneel-transmissao-mapper";
import {
  ANEEL_CONSULTAS,
  consultaLabel,
  consultaWindowState,
  daysUntilConsultaCloses,
  findConsultaForAuction,
} from "../lib/ingestion/aneel-consulta-publica";
import type { AneelDocumentEntry } from "../lib/ingestion/aneel-auction-stage";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function printConsultas(now: Date): void {
  console.log("ANEEL 公众咨询（标书草案阶段）\n");
  for (const consulta of ANEEL_CONSULTAS) {
    const state = consultaWindowState(consulta, now);
    const left = daysUntilConsultaCloses(consulta, now);
    const mark = state === "open" ? "★ 进行中" : state === "upcoming" ? "· 未开始" : "  已结束";
    const countdown = state === "open" ? `，还有 ${left} 天` : "";
    console.log(`${mark}  ${consultaLabel(consulta)} → Leilão ${consulta.auctionNumber}/${consulta.auctionYear}（${consulta.segment}）${countdown}`);
    console.log(`         征询窗口 ${consulta.opensOn} → ${consulta.closesOn}${consulta.contributionsEmail ? `，意见寄 ${consulta.contributionsEmail}` : ""}`);
    if (consulta.auctionDate) console.log(`         拍卖日 ${consulta.auctionDate}`);
    if (consulta.announcedInvestmentBrl) {
      console.log(`         公告投资额 R$ ${(consulta.announcedInvestmentBrl / 1_000_000_000).toFixed(1)} bi（全场合计${consulta.loteCount ? `，${consulta.loteCount} 个标段` : ""}，未按标段拆分）`);
    }
    console.log(`         ${consulta.note}`);
    if (!consulta.confirmed) console.log(`         ⚠ 未与 ANEEL 官网核对，来源：${consulta.provenanceUrl}`);
    console.log("");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const now = new Date();

  if (args.includes("--consultas")) {
    printConsultas(now);
    return;
  }

  const filePath = args.find((a) => !a.startsWith("--") && /\.html?$/i.test(a));
  if (!filePath) {
    console.error("Usage: npm run ingest:aneel -- <saved-edital_transmissao.html> [--write] [--published YYYY-MM-DD] [--documents docs.json]");
    console.error("       npm run ingest:aneel -- --consultas");
    process.exit(1);
  }

  const edital = readAneelEditalFile(filePath);
  if (edital.auctionNumber === null || edital.year === null) {
    console.error("读不出场次号/年份 —— 这份文件多半不是 edital_transmissao.cfm 的保存页，或者保存时丢了内容。");
    process.exit(1);
  }

  const documentsPath = flagValue(args, "documents");
  const documents: AneelDocumentEntry[] = documentsPath
    ? (JSON.parse(readFileSync(documentsPath, "utf8")) as AneelDocumentEntry[])
    : [];

  const consulta = findConsultaForAuction(edital.auctionNumber, edital.year, "transmissao");
  const tenders = mapAneelEditalToTenders(
    { edital, documents, publicationDate: flagValue(args, "published"), consulta },
    now,
  );

  console.log(`${edital.heading ?? `Leilão ${edital.auctionNumber}/${edital.year}`}`);
  console.log(`标段 ${edital.lotes.length} 个 → ${tenders.length} 条项目，来源 "${ANEEL_SOURCE_NAME}"`);
  if (edital.links.documentosUrl) console.log(`文档页：${edital.links.documentosUrl}`);
  if (edital.links.relatoriosUrl) console.log(`R1–R5：${edital.links.relatoriosUrl}`);
  if (edital.links.consultaPublicaUrl) console.log(`公众咨询：${edital.links.consultaPublicaUrl}`);
  if (!documentsPath) {
    console.log("（没传 --documents，阶段判定只用了公众咨询记录；文档清单能把「已送 TCU / 已发标 / 已拍完」区分开。）");
  }
  if (consulta) {
    console.log(`匹配到 ${consultaLabel(consulta)}（${consultaWindowState(consulta, now)}）${consulta.confirmed ? "" : " —— 未与 ANEEL 官网核对"}`);
  }
  console.log(`状态：${[...new Set(tenders.map((t) => t.status))].join(", ") || "（无）"}\n`);

  const excluded = tenders.filter((t) => t.relevance.tier === "excluded");
  if (excluded.length > 0) {
    console.log(`⚠ ${excluded.length} 条被相关度判为 excluded，不会写入：`);
    for (const row of excluded) console.log(`   ${row.slug}`);
  }

  if (!hasWriteFlag()) {
    console.log(JSON.stringify(tenders.slice(0, 2), null, 2));
    if (tenders.length > 2) console.log(`\n...另外 ${tenders.length - 2} 条未显示。`);
    console.log("\ndry run（加 --write 才写库）—— 什么都没写入 Supabase。");
    return;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");

  const { upsertedCount, skippedExcludedCount, failed } = await upsertTendersBatched(supabase, tenders);
  if (failed && failed.length > 0) {
    console.error(`${failed.length} 条写入失败：`);
    for (const f of failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  if (skippedExcludedCount) console.log(`跳过 ${skippedExcludedCount} 条 excluded。`);
  console.log(`写入 ${upsertedCount} / ${tenders.length} 条。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
