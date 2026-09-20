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
 * ── Why it can also SAVE the pages ───────────────────────────────────────
 *
 * The first run (runner, 2026-09-20) answered 5 of 5 at 200, with readable
 * lengths of 1044, 1054 and 1105 characters against a 403-character snippet.
 * That settles the URL shape. It does NOT settle what is on the page: the
 * length was measured inside a content region this script GUESSES at
 * (`texto-dou`, then `<article>`, then `<main>`, then the whole document), and
 * a number produced by a guessed selector is not a reading of the notice. The
 * three lengths also came back suspiciously close together, which is what page
 * chrome looks like.
 *
 * So `--save` writes the pages into `__fixtures__/dou/detail/` and the
 * workflow commits them, and the parser gets written against those bytes. This
 * repo's rule, paid for three times (Compras MX, Ecopetrol, Proyectos México):
 * a mapper is written against a real capture, never against an expectation of
 * one — and "the detail page has the full text" is, until those bytes are
 * read, exactly an expectation.
 *
 * Without `--save` it writes nothing, anywhere.
 *
 * Usage:
 *   Actions → Probe Brazil doors → what=dou-link            （只报告）
 *   Actions → Probe Brazil doors → what=dou-link，args=--save （顺便把页面存回分支）
 *   npm run probe:dou-link -- --count 5 --section do3 --save
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchDouEdition, lastWeekday, isDouUnreachable } from "../lib/ingestion/connectors/dou-live";
import { douNoticeUrl, DOU_SECTIONS, type DouSection } from "../lib/ingestion/dou-edition";

const TIMEOUT_MS = 45_000;
const FIXTURE_DIR = "lib/ingestion/__fixtures__/dou/detail";
const HEADERS = {
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/**
 * Scripts and styles out, everything else kept.
 *
 * Deliberately NOT cut to a content region, unlike the ANTAQ capture. That one
 * could name `<main>` because five real pages had been seen first. These have
 * not been seen by anyone here — the whole reason to save them — and trimming
 * to a guessed container risks removing the notice and leaving no trace that
 * it happened, which is the same mistake as trusting the guessed length above.
 */
function trimForFixture(html: string, url: string, snippetLength: number): string {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const note = [
    "<!--",
    "  DOU 单条公告详情页。已删除 <script> 和 <style>，正文和结构一律没动 ——",
    "  这种页面这边谁都没解析过，按猜出来的容器裁反而可能把公告正文裁掉。",
    `  版面摘要 ${snippetLength} 字（leiturajornal 的 JSON 里被砍到 403 字上限）。`,
    `  原页 ${Math.round(html.length / 1024)}KB，这里 ${Math.round(stripped.length / 1024)}KB。`,
    `  来源：${url}`,
    `  抓取：${new Date().toISOString().slice(0, 10)}（npm run probe:dou-link -- --save，在 GitHub Actions 跑批机上）`,
    "  重抓：Actions → Probe Brazil doors → what=dou-link，args=--save",
    "-->",
  ].join("\n");
  return `${note}\n${stripped}\n`;
}

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

  const save = args.includes("--save");
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

  if (save) await mkdir(FIXTURE_DIR, { recursive: true });

  let resolved = 0;
  let longer = 0;
  let saved = 0;
  for (const [index, notice] of sample.entries()) {
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
        // characters is a page that exists and does not help. It is still a
        // guessed region — see trimForFixture on why --save exists.
        if (full > stub * 1.5) longer += 1;
        line = `200 · 正文 ${full} 字（摘要 ${stub} 字）${full > stub * 1.5 ? "  ← 比摘要长，值得再抓一层" : "  ← 没比摘要长多少"}`;
        if (save) {
          const name = `${String(index + 1).padStart(2, "0")}-${notice.urlTitle.replace(/[^a-z0-9._-]/gi, "_").slice(0, 70)}.html`;
          await writeFile(`${FIXTURE_DIR}/${name}`, trimForFixture(html, url, stub));
          saved += 1;
          line += `  → ${name}`;
        }
      }
    } catch (err) {
      line = `连不上：${err instanceof Error ? err.message : String(err)}`;
    }
    console.log(`  ${notice.title.slice(0, 50).padEnd(50)} ${line}`);
    console.log(`    ${url}`);
  }

  console.log(`\n── ${resolved} / ${sample.length} 条详情页打得开，其中 ${longer} 条正文明显比摘要长 ──`);
  if (save) console.log(`样本 ${saved} 份写在 ${FIXTURE_DIR}/，workflow 会提交回分支。`);
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
  console.log("详情页比摘要长得多 —— 值得再抓一层。");
  if (!save) {
    // The length came from a guessed selector. Writing a parser on that number
    // alone is exactly the mistake this repo has paid for three times.
    console.log("但上面那个字数是从「猜出来的正文区域」量的，不等于看过这些页面。");
    console.log("加 --save 把页面存回分支，解析器照真实页面写。");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
