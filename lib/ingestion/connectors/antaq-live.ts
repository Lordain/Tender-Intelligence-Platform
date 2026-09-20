import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";
import { collectLinks } from "@/lib/ingestion/brazil-behind-doors";
import { runPool } from "@/lib/ingestion/run-pool";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import {
  parseAntaqHearing,
  parseAntaqHearingIndex,
  type AntaqHearing,
  type AntaqLink,
} from "@/lib/ingestion/antaq-audiencia-parser";

/**
 * Fetches ANTAQ's public hearings live, so the parser and the mapper next to
 * it have something to read.
 *
 * Both of those were written on 2026-09-19 against five real pages and then
 * referenced by nothing runnable — the same gap `scripts/ingest-aneel.ts` was
 * written to close for ANEEL. This is the fetch half.
 *
 * ── The route, and why it is followed rather than guessed ─────────────────
 *
 *   index  →  the "Audiências Públicas em andamento" link  →  hearing pages
 *
 * The middle step is a link this code FINDS, not a slug it composes. Its real
 * address is `…/audiencias-publicas-em-andamento`; a plausible guess is
 * `…/audiencias-em-andamento`, which 404s. brazil-pipeline-dig.ts records what
 * that costs: a guessed slug that 404s reads as "there are no live hearings",
 * which is a wrong answer that looks like a right one.
 *
 * ── Three hosts, three different problems ─────────────────────────────────
 *
 * The 20 hearings listed on that page are spread over three hosts, and only
 * one of them can be read (counted from the captured index, 2026-09-19):
 *
 *   www.gov.br                   6   Plone. What the parser was written for.
 *   sisapinternet.antaq.gov.br  11   A different application, and shut too.
 *   leilao.antaq.gov.br          3   Cloudflare challenge, measured shut.
 *
 * So this connector covers under a third of what ANTAQ lists, and the only
 * defensible thing to do about that is to SAY so per host on every run.
 * Silently keeping the six would make a two-thirds gap look like the whole
 * source; fetching the other fourteen and reporting "unparseable" would blame
 * the pages for a parser that was never written for them.
 *
 * `sisapinternet` is not fetched for two reasons now, and each is sufficient.
 * It has never been captured, so no parser exists for it, and this repo's rule
 * — lib/ingestion/README.md, paid for three times — is that a mapper is
 * written against a real capture and not against an expectation of one. And on
 * 2026-09-20 the capture was attempted from the runner and got nothing: the
 * three in-window hearings returned one Cloudflare challenge and two 502s, the
 * 502s meaning the edge reached ANTAQ's own server and it did not answer. So
 * this is not a parser that is merely unwritten; it is a door that has not
 * opened yet. scripts/capture-antaq-sisap.ts is standing by for the day it
 * does, and the laptop — the one network never asked about this host — is the
 * remaining vote.
 *
 * ── What "em andamento" turns out to mean ─────────────────────────────────
 *
 * Not "open". The page is ANTAQ's archive: it lists hearings back to 2022,
 * and one of its entries points at a URL with `audiencias-encerradas` in the
 * path. Every one of the five captured hearings had a comment period that had
 * already closed. That is not a defect of the page and not a reason to drop
 * them — a closed consultation is the one nearest to becoming an auction,
 * which antaq-mapper.ts's header argues at length — but it does mean the
 * caller has to apply its own window, because this list will not do it.
 *
 * Read-only. No Supabase, no model calls, no writes.
 */

export const ANTAQ_INDEX_URL =
  "https://www.gov.br/antaq/pt-br/acesso-a-informacao/participacao-social/audiencias-e-consultas-publicas";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent":
    "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 30_000;
/** 403/429 from a WAF and 5xx from an overloaded origin are routinely transient; a 404 is not, and retrying it only wastes the run's time. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 3_000];

/** gov.br is a shared federal host serving several agencies; three at a time is polite and still finishes six pages in one round. */
const CONCURRENCY = 3;

export type AntaqHostVerdict =
  /** Plone, on a host both the runner and Vercel opened. The parser was written for exactly these pages. */
  | "readable"
  /** Measured shut on 2026-09-19 from the laptop, from Vercel and from the GitHub runner alike. */
  | "refuses-us"
  /** Reachable or not, it is a different application and no parser exists for it. */
  | "other-system";

/**
 * Which of the three problems a hearing's host has.
 *
 * Kept as a pure function so the triage is testable without a network: the
 * counts it produces are what every run reports, and a host quietly changing
 * bucket would change those counts with nothing failing.
 */
export function classifyAntaqHost(host: string): { verdict: AntaqHostVerdict; why: string } {
  if (host === "www.gov.br") return { verdict: "readable", why: "gov.br（Plone），解析器就是照着这个写的" };
  if (host === "leilao.antaq.gov.br" || host === "portal.antaq.gov.br") {
    return { verdict: "refuses-us", why: "Cloudflare 验证页 —— 笔记本、Vercel、GitHub 跑批机三边都过不去（2026-09-19 实测）" };
  }
  if (host === "sisapinternet.antaq.gov.br") {
    // Still `other-system` rather than `refuses-us`: only one of the three
    // failures measured was an actual block, the other two were ANTAQ's own
    // server not answering, and only one machine has voted. The type stays
    // honest; the sentence carries what was measured.
    return {
      verdict: "other-system",
      why: "SisapInternet（另一套 ASP.NET 系统），没有解析器；2026-09-20 从跑批机抓过一次，3 场里 1 场验证页、2 场 502，一场没拿到",
    };
  }
  return { verdict: "other-system", why: "没见过的域名，没有解析器" };
}

/** A hearing that was listed but never fetched, and the reason it was not. */
export type AntaqSkipped = { title: string; url: string; host: string; verdict: AntaqHostVerdict; why: string };

/** A hearing that WAS fetched and still did not yield a reading. */
export type AntaqFailure = { title: string; url: string; why: string };

export type AntaqHarvest = {
  indexUrl: string;
  /** The "em andamento" page, as found on the index — undefined when that link is gone, which is a page-structure change and not an empty source. */
  liveIndexUrl?: string;
  /** Every hearing the page listed, before any triage. */
  listed: AntaqLink[];
  hearings: AntaqHearing[];
  skipped: AntaqSkipped[];
  failed: AntaqFailure[];
};

/** A thrown error carrying this flag means the run never got as far as a hearing list. Callers print the egress note rather than "0 hearings". */
export type AntaqError = Error & { antaqUnreachable?: true };

function unreachable(message: string): AntaqError {
  const error = new Error(message) as AntaqError;
  error.antaqUnreachable = true;
  return error;
}

/**
 * One GET, with a timeout and bounded backoff.
 *
 * A 200 carrying a challenge page is treated as a failure, not as content —
 * `blockPageReason` exists because Cloudflare and Imprensa Nacional both
 * answer 200 with an interstitial, and a parser handed one returns null,
 * which reads as "this hearing has nothing in it".
 */
async function getHtml(url: string): Promise<{ html: string } | { error: string }> {
  let last = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 3_000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // `cache: "no-store"` because Next patches global fetch and these are
      // live index pages: a held response — a challenge page included — would
      // be replayed as if it were this call's answer.
      const response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: "follow", cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        last = `${response.status} ${response.statusText}${pageTitle(text) ? ` — ${pageTitle(text)}` : ""}`;
        if (!RETRYABLE_STATUSES.has(response.status)) return { error: last };
        continue;
      }
      const blocked = blockPageReason(text);
      if (blocked !== null) return { error: `200 但是拦截页：「${blocked}」` };
      if (visibleText(text).length < 200) {
        last = `200 但正文只有 ${visibleText(text).length} 字，不像一张真页面`;
        continue;
      }
      return { html: text };
    } catch (err) {
      last = describeFetchFailure(err).slice(0, 200);
    } finally {
      clearTimeout(timer);
    }
  }
  return { error: last || "取不到" };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * Reads the hearing list out of already-fetched HTML.
 *
 * Split from the fetching so the triage — which is the part that decides what
 * this source covers — can be exercised against the committed fixtures.
 */
export function triageHearingLinks(liveIndexHtml: string, liveIndexUrl: string): {
  listed: AntaqLink[];
  readable: AntaqLink[];
  skipped: AntaqSkipped[];
} {
  const listed = parseAntaqHearingIndex(liveIndexHtml, liveIndexUrl);
  const readable: AntaqLink[] = [];
  const skipped: AntaqSkipped[] = [];
  for (const link of listed) {
    const host = hostOf(link.url);
    const { verdict, why } = classifyAntaqHost(host);
    if (verdict === "readable") readable.push(link);
    else skipped.push({ title: link.title, url: link.url, host, verdict, why });
  }
  return { listed, readable, skipped };
}

/**
 * The hearing's own PDFs, as document links.
 *
 * Only the `Comunicados` attachments — the notice, the deliberations, the
 * contribution report. Those are direct file URLs, present on all five
 * captured pages (6, 6, 9, 5 and 6 of them) and measured fetchable 21 of 21.
 *
 * The `Documentação` buttons are NOT included, and they are the ones holding
 * the draft edital and the EVTEA. They are landing PAGES, not files, so
 * writing them into `tender_document_links` would put HTML behind a download
 * button. Harvesting the files behind them needs one more fetch layer written
 * against a real capture of such a page, and no such capture exists yet — so
 * the ingest script prints those URLs instead, where a person can follow them.
 */
export function hearingDocumentLinks(hearing: AntaqHearing): TenderDocumentLink[] {
  const links: TenderDocumentLink[] = [];
  for (const notice of hearing.notices) {
    // The extension comes from the URL, not from the title: ANTAQ titles its
    // attachments in prose ("Aviso de Audiência Pública nº 07.2026-Antaq")
    // and the file type is only ever in the path. Reading it off the title
    // would leave `format` empty on every row.
    const path = (() => {
      try {
        return new URL(notice.url).pathname;
      } catch {
        return notice.url;
      }
    })();
    links.push({
      sourceUrl: notice.url,
      fileName: safeFileName(notice.title),
      format: /\.([a-z0-9]{2,5})(?:[/?#]|$)/i.exec(path)?.[1]?.toLowerCase(),
    });
  }
  return links;
}

export type FetchAntaqOptions = {
  /** How many readable hearings to read. Undefined means all of them. */
  limit?: number;
  /** Called per page as it lands, so a slow run says what it is doing. */
  onProgress?: (message: string) => void;
};

export async function fetchAntaqHearings(options: FetchAntaqOptions = {}): Promise<AntaqHarvest> {
  const say = options.onProgress ?? (() => {});

  const index = await getHtml(ANTAQ_INDEX_URL);
  if ("error" in index) {
    throw unreachable(`ANTAQ 索引页取不到：${index.error}\n  ${ANTAQ_INDEX_URL}`);
  }

  const liveLink = collectLinks(index.html, ANTAQ_INDEX_URL).find((l) => /em\s+andamento/i.test(l.text));
  if (liveLink === undefined) {
    // Not "no hearings". The index page's own structure changed, and saying
    // so is the difference between a fix and a shrug.
    throw unreachable(
      `索引页上没有「em andamento」那条链接 —— ANTAQ 改了页面结构，先看 ${ANTAQ_INDEX_URL}`,
    );
  }
  say(`进行中列表：${liveLink.href}`);

  const live = await getHtml(liveLink.href);
  if ("error" in live) throw unreachable(`进行中列表取不到：${live.error}\n  ${liveLink.href}`);

  const { listed, readable, skipped } = triageHearingLinks(live.html, liveLink.href);
  say(`列出 ${listed.length} 场，其中 ${readable.length} 场在 www.gov.br 上，能读`);

  const wanted = options.limit === undefined ? readable : readable.slice(0, options.limit);
  const hearings: AntaqHearing[] = [];
  const failed: AntaqFailure[] = [];

  await runPool(wanted, CONCURRENCY, async (link) => {
    const page = await getHtml(link.url);
    if ("error" in page) {
      failed.push({ title: link.title, url: link.url, why: page.error });
      say(`  ✗ ${link.title.slice(0, 60)} —— ${page.error}`);
      return;
    }
    const hearing = parseAntaqHearing(page.html, link.url);
    if (hearing === null) {
      // The page came back whole and the parser still found no heading or no
      // number. That is a template change on a readable host, which is the
      // one failure worth being loud about: it is fixable.
      failed.push({ title: link.title, url: link.url, why: "页面取到了，但解析不出场次号 —— ANTAQ 多半改了模板" });
      say(`  ✗ ${link.title.slice(0, 60)} —— 解析不出来`);
      return;
    }
    hearings.push(hearing);
    say(`  ✓ ${hearing.number}${hearing.projectCode ? ` ${hearing.projectCode}` : ""}  ${(hearing.subject ?? hearing.heading).slice(0, 60)}`);
  });

  // The pool finishes out of order; a stable order makes two runs comparable.
  hearings.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "") || a.number.localeCompare(b.number));

  return { indexUrl: ANTAQ_INDEX_URL, liveIndexUrl: liveLink.href, listed, hearings, skipped, failed };
}

export function isAntaqUnreachable(err: unknown): boolean {
  return err instanceof Error && (err as AntaqError).antaqUnreachable === true;
}
