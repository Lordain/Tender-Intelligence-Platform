/**
 * Asks whether a DOU notice has a followable page, and whether that page
 * carries more than the 403 characters the edition payload gives.
 *
 * ── Why this is the question that decides what the DOU can be ─────────────
 *
 * `leiturajornal?data=…&secao=do3` returns the whole day as JSON, and its
 * `content` field is hard-truncated: 211 of 216 sampled rows end in an
 * ellipsis, and a measured Concorrência row is exactly 403 characters ending
 * mid-word ("…ComprasGov 7"). At that length a notice has no reliable
 * deadline, often no value, and half an object description. That is why
 * lib/ingestion/dou-watch.ts reports and writes nothing: a DOU notice is a
 * lead, not a tender.
 *
 * If each notice has a detail page carrying the FULL text, that changes —
 * the watch narrows a day to a handful of hits, and a handful of extra fetches
 * is cheap enough to turn them into real rows. If it does not, the DOU stays
 * a radar and the edital has to be found elsewhere.
 *
 * The permalink shape `https://www.in.gov.br/web/dou/-/<urlTitle>` was STATED
 * when dou-edition.ts was written and never verified from a machine that can
 * reach in.gov.br. A browser test from the laptop on 2026-09-20 returned
 * ERR_HTTP2_PROTOCOL_ERROR, which is in.gov.br's known behaviour toward that
 * network (it closes the socket mid-read there) and therefore says nothing
 * about the URL. So this has to run where in.gov.br actually answers: the
 * GitHub runner, or Vercel.
 *
 * Reports only. Writes nothing, anywhere.
 *
 * Usage:
 *   Actions → Probe Brazil doors → what=dou-link
 *   npm run probe:dou-link -- --count 5 --section do3
 */
import { fetchDouEdition, lastWeekday, isDouUnreachable } from "../lib/ingestion/connectors/dou-live";
import { douNoticeUrl, DOU_SECTIONS, type DouSection } from "../lib/ingestion/dou-edition";

const TIMEOUT_MS = 45_000;
const HEADERS = {
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

function argValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

/** The article body, without the in.gov.br chrome, so the length compared is text and not navigation. */
function readableLength(html: string): number {
  const article =
    /<div[^>]*class="[^"]*texto-dou[^"]*"[\s\S]*?<\/div>/i.exec(html)?.[0] ??
    /<article\b[\s\S]*?<\/article>/i.exec(html)?.[0] ??
    /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0] ??
    html;
  return article
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

async function main() {
  const args = process.argv.slice(2);
  const count = Number(argValue(args, "--count") ?? 5);
  const section = (argValue(args, "--section") ?? "do3") as DouSection;
  if (!DOU_SECTIONS.includes(section)) {
    console.error(`--section 只能是 ${DOU_SECTIONS.join(" / ")}`);
    process.exit(1);
  }
  if (!Number.isFinite(count) || count < 1) {
    console.error("--count 给 1 以上的整数。");
    process.exit(1);
  }

  const day = lastWeekday(new Date()).toISOString().slice(0, 10);
  console.log(`DOU 详情页探测 —— ${section} ${day}，取前 ${count} 条\n`);

  let result;
  try {
    result = await fetchDouEdition(section, day);
  } catch (err) {
    if (isDouUnreachable(err)) {
      console.error(`${err instanceof Error ? err.message : String(err)}`);
      console.error("\n这是「够不着」，不是「当天没有公告」。in.gov.br 只对 GitHub 跑批机和 Vercel 开；");
      console.error("笔记本上它会读到一半断连（浏览器里表现为 ERR_HTTP2_PROTOCOL_ERROR）。");
      process.exit(1);
    }
    throw err;
  }

  const sample = result.edition.notices.slice(0, count);
  console.log(`当天 ${result.edition.notices.length} 条公告（${result.url}）。\n`);

  let resolved = 0;
  let longer = 0;
  for (const notice of sample) {
    const url = douNoticeUrl(notice);
    const stub = notice.snippet.length;
    let line: string;
    try {
      const response = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) {
        line = `HTTP ${response.status} ${response.statusText}`;
      } else {
        const html = await response.text();
        const full = readableLength(html);
        resolved += 1;
        // The only comparison that matters. A 200 that returns the same 403
        // characters is a page that exists and does not help.
        if (full > stub * 1.5) longer += 1;
        line = `200 · 正文 ${full} 字（摘要 ${stub} 字）${full > stub * 1.5 ? "  ← 比摘要长，值得再抓一层" : "  ← 没比摘要长多少"}`;
      }
    } catch (err) {
      line = `连不上：${err instanceof Error ? err.message : String(err)}`;
    }
    console.log(`  ${notice.title.slice(0, 50).padEnd(50)} ${line}`);
    console.log(`    ${url}`);
  }

  console.log(`\n── ${resolved} / ${sample.length} 条详情页打得开，其中 ${longer} 条正文明显比摘要长 ──`);
  if (resolved === 0) {
    console.log("链接形状不对。`https://www.in.gov.br/web/dou/-/<urlTitle>` 是当初推断的，不是量出来的 ——");
    console.log("换别的路子找详情页，或者 DOU 就只能停在「每天给几条线索」。");
    process.exitCode = 1;
    return;
  }
  if (longer === 0) {
    console.log("详情页打得开，但正文没比那 403 字的摘要多多少 —— 再抓一层不划算，DOU 维持「线索雷达」。");
    return;
  }
  console.log("详情页有完整正文 —— 可以对 watch 命中的那几条各补一次抓取，把 DOU 升级成能进库的来源。");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
