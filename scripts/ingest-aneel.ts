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
 * Usage — `<saved-page>` is YOUR saved file, not a literal name:
 *   npm run ingest:aneel -- --consultas                              (no file needed)
 *   npm run ingest:aneel -- "C:\\Users\\me\\Downloads\\Empreendimentos.html"
 *   npm run ingest:aneel -- <saved-page> --write                     (upserts)
 *   npm run ingest:aneel -- <saved-page> --published 2025-11-11      (real publication date)
 *   npm run ingest:aneel -- <saved-page> --documents docs.json       (the documentos_editais list)
 *   npm run ingest:aneel -- <saved-page> --include-finished          (import a concluded auction anyway)
 *
 * `--documents` takes a JSON array of { section, title, url? } read off
 * `documentos_editais.cfm?IdProgramaEdital=<id>`; without it the auction is
 * staged from its consultation alone, which is correct but coarser.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { decodeAneelPage, readAneelEditalFile, readAneelGeracaoFile } from "../lib/ingestion/connectors/aneel-editais-file";
import { mapAneelEditalToTenders, aneelAuctionLiveness, ANEEL_SOURCE_NAME } from "../lib/ingestion/aneel-transmissao-mapper";
import { mapAneelGeracaoToTenders, ANEEL_GERACAO_SOURCE_NAME } from "../lib/ingestion/aneel-geracao-mapper";
import {
  ANEEL_CONSULTAS,
  ANEEL_PARTICIPATION_URLS,
  consultaLabel,
  consultaWindowState,
  daysUntilConsultaCloses,
  findConsultaForAuction,
} from "../lib/ingestion/aneel-consulta-publica";
import type { AneelDocumentEntry } from "../lib/ingestion/aneel-auction-stage";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { hasWriteFlag } from "@/lib/cli-write-flag";

/** Flags that consume the next argument, so its value is never mistaken for the file path. */
const VALUE_FLAGS = new Set(["published", "documents"]);

function parseArgs(argv: string[]): { positional: string[]; flags: Map<string, string | true> } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (VALUE_FLAGS.has(name)) {
      flags.set(name, argv[i + 1] ?? "");
      i += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { positional, flags };
}

function usage(): void {
  console.error("用法（<保存的页面> 换成你自己保存的文件，不是字面量）：");
  console.error("  npm run ingest:aneel -- --consultas                          看哪场公众咨询开着");
  console.error('  npm run ingest:aneel -- "C:\\Users\\你\\Downloads\\Empreendimentos.html"');
  console.error("  npm run ingest:aneel -- <保存的页面> --write                  写入 Supabase");
  console.error("  npm run ingest:aneel -- <保存的页面> --published YYYY-MM-DD   用真实发布日期");
  console.error("  npm run ingest:aneel -- <保存的页面> --documents docs.json    带上文档清单");
}

/** Where the file comes from, printed whenever one cannot be found. */
function captureSteps(): void {
  console.error("");
  console.error("怎么拿到这个文件：");
  console.error("  1. 浏览器打开 https://www2.aneel.gov.br/aplicacoes_liferay/editais_transmissao/edital_transmissao.cfm");
  console.error("  2. 要往年的就先选年份，然后【点 Pesquisar，等页面刷新】—— 只选不点，存下来还是原来那一年");
  console.error("  3. Ctrl+S 保存为「网页，仅 HTML」");
  console.error("  4. 把保存下来的文件路径传给本命令（路径有空格就加引号）");
}

/** Reports a missing or unreadable path in one line instead of an ENOENT stack trace. */
function requireFile(path: string, what: string): string {
  const full = resolve(path);
  if (!existsSync(full)) {
    console.error(`找不到${what}：${full}`);
    return "";
  }
  if (statSync(full).isDirectory()) {
    console.error(`${what}是个目录，不是文件：${full}`);
    return "";
  }
  return full;
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
  // Added 2026-09-19 from a capture of ANEEL's own homepage. Every consulta
  // above is typed from trade press; these three addresses are the site's own
  // navigation, and they sit on www.gov.br/aneel — the one ANEEL host that
  // answered 200 from both the laptop and the deployment while www2,
  // git.aneel, leilao.aneel and the two report portals were all shut. So this
  // is the part of the lifecycle that needs no change of network egress, only
  // a saved page.
  console.log("要把上面这几条从「听说」变成「核对过」，存这三页发我就行 —— 它们在唯一打得开的那台主机上：");
  console.log(`  标书草案征询（正式稿，含投资额和技术指标）  ${ANEEL_PARTICIPATION_URLS.consultasPublicas}`);
  console.log(`  规则意见征集（更早，草案都还没有）          ${ANEEL_PARTICIPATION_URLS.tomadaDeSubsidios}`);
  console.log(`  公开听证（一般在征询窗口之内，不是替代）    ${ANEEL_PARTICIPATION_URLS.audienciasPublicas}`);
  console.log("");
}

/**
 * `editais_geracao/edital_geracao.cfm` — several auctions per page, no lots,
 * one tender each. See lib/ingestion/aneel-geracao-mapper.ts for why the
 * transmission path cannot be reused.
 */
async function ingestGeracao(path: string, flags: Map<string, string | true>, now: Date): Promise<void> {
  const editais = readAneelGeracaoFile(path);
  if (editais.length === 0) {
    console.error("这一页读不出任何场次 —— 保存时可能丢了内容，或者页面结构变了。");
    process.exit(1);
  }

  console.log(`ANEEL 发电/容量拍卖 —— 这一页有 ${editais.length} 场\n`);
  const publicationDate = typeof flags.get("published") === "string" ? (flags.get("published") as string) : undefined;

  const tenders = [];
  for (const edital of editais) {
    const rows = mapAneelGeracaoToTenders({ edital, publicationDate }, now);
    // The same rule as transmission: 只要正在招标、未发标的. A past-year page
    // renders identically to this year's, so the year is the evidence when no
    // document list was captured.
    const stale = edital.year !== null && edital.year < now.getFullYear();
    const mark = stale && !flags.has("include-finished") ? "跳过（往年场次）" : rows[0]?.status ?? "—";
    console.log(`  ${edital.heading ?? `Leilão ${edital.auctionNumber}/${edital.year}`}`);
    console.log(`    ${rows[0]?.title.es ?? "（读不出标题）"}`);
    console.log(`    ${mark} · ${rows[0]?.scopeType === "works" ? "含新建，有设备/EPC 机会" : "仅面向已有项目，无新建采购"} · ${rows[0]?.relevance.tier ?? "—"}`);
    console.log(`    标书与附件：${edital.links.documentosUrl ?? "（页面没给）"}`);
    if (stale && !flags.has("include-finished")) continue;
    tenders.push(...rows);
  }

  const excluded = tenders.filter((t) => t.relevance.tier === "excluded");
  if (excluded.length > 0) console.log(`\n⚠ ${excluded.length} 条被相关度判为 excluded，不会写入。`);

  if (!hasWriteFlag()) {
    console.log(`\n共 ${tenders.length} 条。dry run（加 --write 才写库）—— 什么都没写入 Supabase。`);
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
  console.log(`\n写入 ${upsertedCount} / ${tenders.length} 条，来源 "${ANEEL_GERACAO_SOURCE_NAME}"。`);
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const now = new Date();

  if (flags.has("consultas")) {
    printConsultas(now);
    return;
  }

  const filePath = positional[0];
  if (!filePath) {
    console.error("没传文件。");
    usage();
    captureSteps();
    process.exit(1);
  }

  const resolvedPath = requireFile(filePath, "保存的页面");
  if (!resolvedPath) {
    captureSteps();
    process.exit(1);
  }

  // Which of ANEEL's two applications this page came from, read from the page
  // itself rather than asked for as a flag. They are genuinely different
  // documents — the generation page carries SEVERAL auctions and no lots — so
  // getting this wrong silently imports nothing (measured: the transmission
  // mapper over the generation page returns zero rows).
  const rawHtml = decodeAneelPage(resolvedPath);
  if (/LEIL[ÃA]O\s+DE\s+GERA[ÇC][ÃA]O/i.test(rawHtml)) {
    await ingestGeracao(resolvedPath, flags, now);
    return;
  }

  const edital = readAneelEditalFile(resolvedPath);
  if (edital.auctionNumber === null || edital.year === null) {
    console.error("读不出场次号/年份 —— 这份文件多半不是 edital_transmissao.cfm 的保存页，或者保存时丢了内容。");
    process.exit(1);
  }

  const documentsFlag = flags.get("documents");
  const documentsPath = typeof documentsFlag === "string" && documentsFlag.length > 0 ? documentsFlag : undefined;
  let documents: AneelDocumentEntry[] = [];
  if (documentsPath) {
    const resolvedDocuments = requireFile(documentsPath, "文档清单 JSON");
    if (!resolvedDocuments) process.exit(1);
    documents = JSON.parse(readFileSync(resolvedDocuments, "utf8")) as AneelDocumentEntry[];
  }

  const consulta = findConsultaForAuction(edital.auctionNumber, edital.year, "transmissao");

  // 只要正在招标、未发标的（user, 2026-09-19）. See aneelAuctionLiveness for
  // why a past YEAR counts as evidence when no document list was captured:
  // every past year renders in the same template, so without documents a
  // decade-old auction reads as ten upcoming opportunities.
  const liveness = aneelAuctionLiveness(edital, documents, consulta, now);
  if (!liveness.live && !flags.has("include-finished")) {
    console.log(`${edital.heading ?? `Leilão ${edital.auctionNumber}/${edital.year}`}`);
    console.log(`\n跳过：${liveness.reason}`);
    console.log("一条都没有导入。确实要导入这场已结束的拍卖，加 --include-finished。");
    return;
  }

  const tenders = mapAneelEditalToTenders(
    {
      edital,
      documents,
      publicationDate: typeof flags.get("published") === "string" ? (flags.get("published") as string) : undefined,
      consulta,
    },
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
  console.log(`状态：${[...new Set(tenders.map((t) => t.status))].join(", ") || "（无）"}`);
  if (!liveness.live) console.log(`⚠ 这场按判断已经结束（${liveness.reason}），是 --include-finished 强行导入的。`);
  console.log("");

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
