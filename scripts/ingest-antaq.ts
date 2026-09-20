/**
 * CLI for ANTAQ's port-concession public hearings.
 *
 * The parser (lib/ingestion/antaq-audiencia-parser.ts) and the mapper
 * (lib/ingestion/antaq-mapper.ts) were written on 2026-09-19 against five real
 * captured pages and then referenced by nothing runnable. This and
 * lib/ingestion/connectors/antaq-live.ts are the wiring that makes the source
 * exist. Read the connector's header before changing anything here: which
 * hosts are fetched, and which are deliberately not, is the whole story of
 * what this source covers.
 *
 * ── Why a hearing and not an auction ──────────────────────────────────────
 *
 * ANTAQ's auction pages sit on leilao.antaq.gov.br, measured shut from the
 * laptop, from Vercel and from the GitHub runner alike. The hearings sit on
 * www.gov.br, which all three open — and a hearing runs BEFORE the auction,
 * publishing the draft edital, the draft contract and the EVTEA six to eight
 * weeks ahead. For a bidder who has to read Portuguese, price a thirty-year
 * concession and assemble a consortium, that is the stage where the work
 * starts. antaq-mapper.ts's header argues this at length.
 *
 * ── Why a window is applied here and not in the connector ─────────────────
 *
 * "Em andamento" is ANTAQ's archive, not its live list: it goes back to 2022.
 * The connector reports what ANTAQ lists; deciding how far back is worth
 * importing is a product call, so it is a flag with a stated default rather
 * than a constant buried in a fetch layer.
 *
 * ── And why it counts YEARS, off the hearing's own number ─────────────────
 *
 * It used to count months off `publishedAt` through filterRecentTenders(),
 * and that measured the wrong thing: gov.br's byline date is Plone's, ANTAQ
 * re-stamps it, and AP 07/2025's page claims to have been published five
 * months after its comment period closed. So a hearing survived the window by
 * having been edited, not by being recent. lib/ingestion/antaq-window.ts
 * carries the three measurements and the replacement rule — the year on the
 * hearing's number decides, its own cronograma can rescue an older one that
 * is still running, and Plone's date only gets to warn.
 *
 * DRY RUN BY DEFAULT. `--write` needs the two dashes —
 * `npm run ingest:antaq --write` hands the flag to npm instead of to this
 * script, and lib/cli-write-flag.ts refuses rather than letting that pass as
 * a silent no-op.
 *
 * Usage:
 *   npm run ingest:antaq                                （dry run，今年和去年的场次）
 *   npm run ingest:antaq -- --years 3                   （往回捞到前年）
 *   npm run ingest:antaq -- --years 0                   （不设窗口，ANTAQ 列什么就看什么）
 *   npm run ingest:antaq -- --limit 2                   （只读两场，试网络用）
 *   npm run ingest:antaq -- --write
 *   npm run ingest:antaq -- --documents --write         （顺便把公告 PDF 记成文档链接）
 */
import {
  fetchAntaqHearings,
  hearingDocumentLinks,
  isAntaqUnreachable,
  type AntaqHarvest,
} from "../lib/ingestion/connectors/antaq-live";
import { mapAntaqHearingToTender } from "../lib/ingestion/antaq-mapper";
import { judgeAntaqWindow, type AntaqWindowVerdict } from "../lib/ingestion/antaq-window";
import { upsertTendersBatched } from "../lib/ingestion/upsert-tenders";
import { saveDocumentLinks } from "../lib/ingestion/document-links";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";
import { ANTAQ_SOURCE_NAME } from "@/lib/relevance";
import { hasWriteFlag } from "@/lib/cli-write-flag";
import type { Tender } from "@/types/tender";

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

/** A count per bucket, so "what this source does not cover" is a number and not an impression. */
function reportCoverage(harvest: AntaqHarvest): void {
  console.log(`\nANTAQ 列出 ${harvest.listed.length} 场听证：`);
  console.log(`  ${String(harvest.hearings.length).padStart(3)} 场读到了（www.gov.br）`);
  if (harvest.failed.length > 0) console.log(`  ${String(harvest.failed.length).padStart(3)} 场取到页面但没读成`);

  const byHost = new Map<string, { count: number; why: string }>();
  for (const skip of harvest.skipped) {
    const seen = byHost.get(skip.host);
    if (seen) seen.count += 1;
    else byHost.set(skip.host, { count: 1, why: skip.why });
  }
  for (const [host, { count, why }] of [...byHost].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(count).padStart(3)} 场没去取 —— ${host}：${why}`);
  }
  for (const f of harvest.failed) console.log(`      ✗ ${f.title.slice(0, 60)} —— ${f.why}`);
}

async function main() {
  const args = process.argv.slice(2);
  const write = hasWriteFlag();

  // --months is refused rather than quietly accepted. It was this script's
  // flag until 2026-09-20 and it windowed on a date ANTAQ re-stamps; a stale
  // command line that still carried it would silently get a different window
  // than it asked for. See lib/ingestion/antaq-window.ts.
  if (args.includes("--months")) {
    console.error("--months 已经取消了。它量的是 gov.br 页面的发布日，而 ANTAQ 会给旧页面重新盖章 ——");
    console.error("AP 07/2025 的征询期 2026-01-27 就结束了，页面却写着 2026-06-08 发布。");
    console.error("现在按场次号里的年份算：--years 2 表示今年和去年，--years 0 表示不设窗口。");
    process.exit(1);
  }
  const yearsRaw = argValue(args, "--years");
  const years = yearsRaw === undefined ? 2 : Number(yearsRaw);
  if (!Number.isFinite(years) || years < 0 || !Number.isInteger(years)) {
    console.error(`--years 认不出来："${yearsRaw}"。给 0 或更大的整数，0 表示不设窗口。`);
    process.exit(1);
  }
  const limitRaw = argValue(args, "--limit");
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  if (limitRaw !== undefined && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error(`--limit 认不出来："${limitRaw}"。给 1 以上的整数。`);
    process.exit(1);
  }

  const supabase = write ? createSupabaseAdminClient() : null;
  if (write && !supabase) {
    console.error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). See .env.example.");
    process.exit(1);
  }

  console.log(`ANTAQ 港口特许经营 —— 公开听证阶段（来源 "${ANTAQ_SOURCE_NAME}"）`);

  let harvest: AntaqHarvest;
  try {
    harvest = await fetchAntaqHearings({ limit, onProgress: (m) => console.log(m) });
  } catch (err) {
    // An unreachable index is not an empty source, and the difference decides
    // what the operator does next: change where the request comes from, or
    // fix a parser. Every .gov.br host is outside the agent sandbox's egress
    // allowlist, so this is the expected failure THERE and a real one on a
    // laptop or the runner.
    if (isAntaqUnreachable(err)) {
      console.error(`\n${err instanceof Error ? err.message : String(err)}`);
      console.error("\n这是「够不着」，不是「没有听证」。ANTAQ 在 www.gov.br 上，笔记本和 GitHub 跑批机都开着；");
      console.error("如果这条命令是在受限沙箱里跑的，.gov.br 本来就不在出口白名单里，换台机器跑即可。");
      process.exit(1);
    }
    throw err;
  }

  reportCoverage(harvest);

  const now = new Date();
  const mapped: {
    tender: Tender;
    verdict: AntaqWindowVerdict;
    sections: { title: string; url: string }[];
    notices: number;
  }[] = [];
  const unmappable: string[] = [];
  for (const hearing of harvest.hearings) {
    const tender = mapAntaqHearingToTender(hearing, now);
    if (tender === null) {
      // The mapper refuses a hearing with no publication date or with nothing
      // but a reference number for a title. Both are correct refusals; naming
      // them keeps a template change from looking like a quiet source.
      unmappable.push(`${hearing.number}${hearing.projectCode ? ` ${hearing.projectCode}` : ""} —— 没有发布日期，或者只有一个编号当标题`);
      continue;
    }
    mapped.push({
      tender,
      verdict: judgeAntaqWindow(hearing, years, now),
      sections: hearing.documentSections,
      notices: hearing.notices.length,
    });
  }
  if (unmappable.length > 0) {
    console.log(`\n${unmappable.length} 场读到了但映射不出项目：`);
    for (const line of unmappable) console.log(`  ${line}`);
  }

  const kept = mapped.filter((m) => m.verdict.inWindow).map((m) => m.tender);
  const dropped = mapped.length - kept.length;

  console.log(
    `\n── ${kept.length} 条项目${years > 0 ? `（${now.getUTCFullYear() - (years - 1)} 年及以后的场次；窗口外 ${dropped} 条已丢）` : "（未设窗口）"} ──`,
  );
  for (const { tender, verdict, sections, notices } of mapped) {
    const inWindow = verdict.inWindow;
    console.log(`${inWindow ? " " : "·"} ${tender.tenderNumber.padEnd(11)} ${tender.relevance.tier.padEnd(9)} 日程到 ${verdict.lastStatedDay ?? "  没排  "}  ${(tender.title.es ?? "").slice(0, 58)}`);
    // Plone's date decides nothing here, so when it disagrees with the
    // hearing's own dates the run says so rather than letting the operator
    // read `发布 2026-07-06` on a hearing from 2024 and believe it.
    if (verdict.pageStampWarning !== undefined) console.log(`    ⚠ ${verdict.pageStampWarning}`);
    if (!inWindow) {
      console.log(`    ${verdict.why}`);
      continue;
    }
    if (verdict.rescuedBySchedule) console.log(`    ${verdict.why}`);
    console.log(`    ${tender.sourceUrl}`);
    console.log(`    公告附件 ${notices} 个${sections.length > 0 ? `；文档分栏：${sections.map((s) => s.title).join(" / ")}` : "；页面没给文档分栏"}`);
    // Printed rather than stored: these are landing PAGES, and the draft
    // edital and the EVTEA sit behind them. See hearingDocumentLinks() for
    // why they are not written into tender_document_links.
    for (const section of sections) console.log(`      ${section.title} → ${section.url}`);
  }

  if (!write) {
    console.log(`\ndry run（加 --write 才写库）—— 什么都没写入 Supabase。`);
    if (args.includes("--documents")) console.log("（--documents 只在 --write 时生效：链接要挂在已写入的项目上。）");
    return;
  }

  const { upsertedCount, skippedExcludedCount, skippedClosedCount, failed } = await upsertTendersBatched(supabase!, kept);
  if (failed && failed.length > 0) {
    console.error(`${failed.length} 条写入失败：`);
    for (const f of failed.slice(0, 20)) console.error(`  ${f.slug}: ${f.error}`);
  }
  if (skippedExcludedCount) console.log(`跳过 ${skippedExcludedCount} 条 excluded。`);
  if (skippedClosedCount) console.log(`跳过 ${skippedClosedCount} 条已过交标日期。`);
  console.log(`写入 ${upsertedCount} / ${kept.length} 条。`);

  if (!args.includes("--documents")) {
    console.log("（想把公告 PDF 一并记下来，加 --documents。）");
    return;
  }
  const entries = harvest.hearings
    .map((hearing) => {
      const tender = mapped.find((m) => m.tender.sourceUrl === hearing.sourceUrl)?.tender;
      if (tender === undefined || !kept.some((k) => k.slug === tender.slug)) return null;
      return { slug: tender.slug, links: hearingDocumentLinks(hearing) };
    })
    .filter((e): e is { slug: string; links: ReturnType<typeof hearingDocumentLinks> } => e !== null);
  const saved = await saveDocumentLinks(supabase!, entries);
  console.log(`文档链接：${saved.linkCount} 条，挂在 ${saved.tendersWithLinks} 个项目上${saved.unmatchedSlugs > 0 ? `；${saved.unmatchedSlugs} 个 slug 没对上已存项目（excluded 的行本来就不写）` : ""}。`);
  for (const f of saved.failed) console.error(`  文档链接写入失败 ${f.slug}: ${f.error}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
