/**
 * Brazil's other market: concessions and transmission auctions.
 *
 * Everything the Brazil connector currently reads is PNCP — Lei 14.133
 * procurement, where the government buys works and services and pays for
 * them. The two sources this probe knocks on are a different animal entirely,
 * and the difference is not a detail:
 *
 *   **PPI** (ppi.gov.br, Programa de Parcerias de Investimentos) is the
 *   federal concession/PPP pipeline — highways, ports, airports, railways. A
 *   project appears there when the Conselho do PPI qualifies it, which is
 *   typically ONE TO THREE YEARS before any edital exists. It is a portfolio,
 *   not a tender list.
 *
 *   **ANEEL's leilões de transmissão** are auctions for the right to BUILD,
 *   own and operate a transmission line for 30 years. A single lot runs to
 *   billions of reais against the single-digit millions the municipal PNCP
 *   feed carries, and this is the arena the large Chinese utilities actually
 *   compete in.
 *
 * Neither is in PNCP, and neither is reachable from this sandbox — every
 * `.gov.br` host answers 403 at the gateway — so this is a script for the
 * user to run, and its output is what the mappers get written against. That
 * sequencing is not ceremony: the last time this repo guessed a path instead
 * of measuring one, a live host returned 404 in 1.2 seconds and the "finding"
 * was that our URL was wrong (lib/ingestion/README.md, "Brazil — the other
 * doors").
 *
 * ── What each step is actually asking ────────────────────────────────────
 *
 * P. PPI — the single question is **does a machine-readable portfolio exist
 *    at all**, because a gov.br CMS listing may be server-rendered HTML (then
 *    it is scrapeable), a JavaScript shell (then it is not, without a
 *    browser), or a Plone site with plone.restapi quietly enabled (then the
 *    same URL returns JSON just for asking with an Accept header). P1–P3 test
 *    exactly those three, in that order, and P5's sitemap is the cheap way to
 *    enumerate project pages if the answer is "scrapeable".
 *
 *    P6 knocks on the SECTOR AGENCIES instead, and may well matter more than
 *    PPI itself: PPI publishes the pipeline, but the edital for a highway is
 *    published by ANTT, a port by ANTAQ, an airport by ANAC. If one of those
 *    runs an open-data portal with the auction calendar in it, that is a
 *    better door than scraping a portfolio page.
 *
 * E. ANEEL/CCEE — the question is **which portal is CKAN, and what are the
 *    real column names**. E1 confirms the platform rather than assuming it
 *    (`status_show` prints the CKAN version, and a non-CKAN host fails here
 *    instead of producing a confusing error three calls later); E2 searches
 *    for the datasets; E3 is the one that pays, because `datastore_search`
 *    returns the COLUMN CONTRACT of a resource, and a mapper written from
 *    that is written from what the service publishes.
 *
 *    One division of labour worth stating, because it decides which host to
 *    put effort into: **transmission auctions are run by ANEEL** (the edital
 *    is ANEEL's, the auction session is held at B3), while **CCEE runs the
 *    energy/generation auctions** and settles the market. Both are worth
 *    having; only ANEEL answers the question the user asked.
 *
 * ── FIRST REAL RUN (2026-09-18, user's machine): 11 FAIL, 1 OK ───────────
 *
 * And not one of the eleven says "there is no data". Every one is an
 * ACCESS answer, in five distinct flavours, which is why they are worth
 * writing down separately rather than as a row of FAILs:
 *
 *   P1–P4  ppi.gov.br            ECONNRESET ×4, ~700ms   edge resets us after connect
 *   P5     dados.gov.br          401                     the path EXISTS and wants a credential
 *   P6     dados.antt.gov.br     200 "Request Rejected"  F5 BIG-IP ASM block page — host alive
 *   P7     portal.antaq.gov.br   403 Cloudflare          bot challenge
 *   P8     in.gov.br             socket closed mid-read
 *   E1     dadosabertos.aneel    connect timeout 10s     never completed a TCP handshake
 *   E2     www.aneel.gov.br      403 "Just a moment…"    Cloudflare JS challenge
 *   E3     dadosabertos.ccee     403 "Acesso bloqueado"  a deliberate, hand-written block page
 *   E4     b3.com.br             200                     answered, but see below
 *
 * Three things follow, and all three changed this file:
 *
 *  1. **PNCP works from that same machine**, so this is not a
 *     China-to-Brazil routing problem. What separates the hosts that answer
 *     from the ones that do not is that PNCP's is an API and these are
 *     CMS/portal hosts sitting behind Cloudflare, F5 and one hand-rolled
 *     block page. That makes the User-Agent the single live variable, so
 *     every failing step now automatically retries once with browser
 *     headers and prints both results. Same posture as the PNCP probe's A5:
 *     if the UA is what decides it, that is a finding to put in front of the
 *     user, not a header to quietly ship in a connector.
 *  2. **E1's "timeout" was not our timeout.** `--timeout 90` sets an
 *     AbortController; undici gives up on the TCP CONNECT after 10s on its
 *     own, and that is what fired. Reporting it as "network" invited exactly
 *     the wrong conclusion. There is now a TCP reachability pass before any
 *     HTTP, on a plain socket with its own timeout, because "cannot reach
 *     the host" and "the host rejects this request" need completely
 *     different next moves and only a socket can tell them apart.
 *  3. **E4's verdict was wrong, and it was my heuristic that was wrong.**
 *     11KB, 271 characters of body text and ONE link was reported as
 *     「服务端渲染，可抓」 because the page carried no framework markers.
 *     Absence of a marker is not presence of content. The verdict now reads
 *     the amount of text and the number of links first.
 *
 * ── RUN TWO (2026-09-18, same machine, after the three fixes above) ──────
 *
 * The retry answered its question, and the answer was mostly "no":
 *
 *  - **`www-authenticate: Bearer`.** dados.gov.br said, in a header, exactly
 *    what it wants — and it is not the `chave-api-dados-abertos` this file
 *    had guessed. Corrected. This one line is what printing headers was for.
 *  - **The ★ mechanism overstated its own result, and that was my bug.**
 *    ANTT's F5 serves "Request Rejected" as **HTTP 200**, so judging the
 *    retry by status code alone printed "browser headers got us in" for a
 *    block notice; three of the four ★ were that. Content is now checked
 *    before anything is called a pass, and the page's <title> and first 300
 *    characters are printed so the next reader can see it rather than trust
 *    a verdict.
 *  - **PPI answers a browser UA, and there is nothing in the page.** 16KB,
 *    266 characters of text, zero links — and the SAME body for all four
 *    URLs including `sitemap.xml`. That is either a single-page-app shell or
 *    an interstitial, and the probe could not tell which, which is the other
 *    reason the body is now printed.
 *  - **`dadosabertos.aneel.gov.br` is genuinely unreachable**, confirmed at
 *    the socket: ETIMEDOUT after 21 seconds with no handshake, while eight
 *    other hosts connected in under 400ms in the same pass. This is the one
 *    failure that is a network fact rather than a policy, and the TCP pass
 *    added after run one is what established it.
 *  - **Cloudflare's JS challenge is not a header problem.** ANEEL's and
 *    ANTAQ's 403s are unchanged by a browser UA, as they should be — those
 *    want a browser that runs the challenge, not a string that claims to be
 *    one.
 *
 * ── DNS (measured from the sandbox, where HTTP is blocked but DNS is not) ──
 *
 *   ppi.gov.br · dados.gov.br · dadosabertos.aneel.gov.br ·
 *   dados.antt.gov.br · dadosabertos.ccee.org.br · portal.antaq.gov.br    存在
 *   web3.antaq.gov.br · dados.antaq.gov.br · dados.anac.gov.br            NXDOMAIN
 *
 * The three NXDOMAINs are why ANTAQ is probed at `portal.antaq.gov.br` and
 * why ANAC is not given a guessed open-data host at all — it is searched for
 * in the national catalogue instead. A probe that spends a step on a hostname
 * that does not exist reports a FAIL that says nothing, and this repo has
 * already mistaken one of those for a finding once.
 *
 * Read-only. No Supabase, no writes, no model calls.
 *
 * Usage:
 *   npm run probe:brazil-concessions
 *   npm run probe:brazil-concessions -- --timeout 180 --rows 8
 */
import { ckanDatastoreSearch, ckanPackageSearch, ckanStatus, type CkanPackage } from "@/lib/ingestion/connectors/ckan";
import { toCsv, writeReviewCsv, type CsvValue } from "@/lib/ingestion/review-csv";
import { describeFetchFailure } from "@/lib/fetch-failure";
import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { connect } from "node:net";

const OUT_DIR = "exports";

/**
 * Found by web search 2026-09-18, not by recall, and not by discovery calls.
 *
 * Search reaches ANEEL's portal from here even though HTTP to it does not, so
 * the discovery half of this probe is already answered and the resource ids
 * below can be queried directly. That collapses three CKAN calls into one and
 * — more importantly — means the FIELD NAMES are one reachable request away
 * rather than three.
 *
 * What the dataset is, stated plainly because it decides how it is used:
 * **results, not opportunities.** `resultado-de-leiloes` holds the outcome of
 * every generation and transmission auction since 1999 — who won, at what
 * RAP, with what deságio. That is the award side of this platform
 * (awardedValue, awardedSupplier, and the Chinese-bidder reports), not the
 * feed of things still open for bidding. An upcoming auction lives in its
 * edital, which is a PDF on ANEEL's own site and, for the larger ones, in
 * English on PPI's.
 *
 * The dataset's own tag list is the column preview: leilão · RAP · preço teto
 * · deságio · energia vendida · **investimento** · empreendimento · garantia
 * física · potência instalada. `investimento` being present is the thing to
 * note — that is the CAPEX the user chose for `estimatedValue`, so it does
 * not have to be derived from RAP.
 */
const ANEEL_DATASET = "resultado-de-leiloes";
const ANEEL_TRANSMISSION_RESOURCE = "453cb742-8089-4c16-aaf2-42088b5553dc";
const ANEEL_GENERATION_RESOURCE = "a1328fc1-f06b-437d-8893-57ac2c8103df";
/** ANEEL publishes a per-dataset data dictionary as a PDF; this is the transmission one. */
const ANEEL_TRANSMISSION_DICTIONARY =
  "https://dadosabertos.aneel.gov.br/dataset/593537c6-9e0e-4ed9-817a-2c5d5de05147/resource/c8d16a2e-f738-43cc-9dbe-efa95e5056c1/download/dm-resultados-dos-leiloes-de-transmissao.pdf";

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const JSON_HEADERS = { ...HEADERS, Accept: "application/json" } as const;

/**
 * Pass two, and only ever pass two.
 *
 * Six of the eight failing hosts answered with a WAF page rather than a
 * network error, which makes "is it our User-Agent?" the one variable worth
 * isolating. Isolating it is not the same as adopting it: the standing
 * posture in this repo is to identify honestly to a public open-data service,
 * so if browser headers turn out to be what works, that is a finding to
 * discuss before any connector ships with them.
 */
const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "Upgrade-Insecure-Requests": "1",
} as const;

/**
 * The credential dados.gov.br asked for, in its own words.
 *
 * Run one returned 401 with an EMPTY body, and this file guessed the header
 * from documentation: `chave-api-dados-abertos`. Run two printed the response
 * headers instead of swallowing them, and the server settled it —
 *
 *     www-authenticate: Bearer
 *     x-cache: Error from cloudfront
 *
 * — so the guess was wrong and `Authorization: Bearer <key>` is right. The
 * documented header is kept as a fallback rather than deleted, because the
 * catalogue has more than one API generation behind the same hostname and
 * the 401 came from the CKAN-style path specifically; if Bearer is refused,
 * the probe tries the other one and reports which was accepted. That is the
 * whole point of printing headers: the next run corrects the guess instead
 * of repeating it.
 */
const DADOS_GOV_KEY = process.env.DADOS_GOV_BR_API_KEY;
const DADOS_GOV_HEADERS = DADOS_GOV_KEY ? { Authorization: `Bearer ${DADOS_GOV_KEY}` } : undefined;
const DADOS_GOV_FALLBACK_HEADERS = DADOS_GOV_KEY ? { "chave-api-dados-abertos": DADOS_GOV_KEY } : undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = { label: string; ok: boolean; status: number | string; ms: number; note: string };
const outcomes: Outcome[] = [];

function record(outcome: Outcome): Outcome {
  outcomes.push(outcome);
  console.log(`   ${outcome.ok ? "OK  " : "FAIL"}  ${String(outcome.status).padEnd(14)} ${String(outcome.ms).padStart(7)}ms  ${outcome.note}`);
  console.log();
  return outcome;
}

/**
 * Does the host accept a TCP connection at all?
 *
 * This runs before any HTTP because the first run could not tell two very
 * different situations apart. `undici` abandons a CONNECT after 10 seconds on
 * its own — our `--timeout` never reaches that phase — and the resulting
 * "network" line reads identically whether the packets are being dropped or
 * the host simply refused us. A plain socket separates them: a completed
 * handshake means everything after it is the application layer's doing (a
 * WAF, a challenge, a missing credential), and only a failure HERE is a
 * reachability problem.
 *
 * One caveat, found by running it: behind an intercepting proxy — this
 * project's sandbox, or a corporate network — the handshake is with the
 * proxy, so every host reads 通 regardless. The reading above holds on an
 * ordinary connection, which is where this script is meant to run.
 */
function tcpCheck(host: string, timeoutMs: number): Promise<{ ok: boolean; ms: number; note: string }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = connect({ host, port: 443 });
    let settled = false;
    const done = (ok: boolean, note: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, ms: Date.now() - started, note });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true, "握手完成 —— 之后再被拒就是应用层的事"));
    socket.once("timeout", () => done(false, `${Math.round(timeoutMs / 1000)}s 内连 TCP 都没握上（包被丢了，不是对方拒绝）`));
    socket.once("error", (err) => done(false, (err as NodeJS.ErrnoException).code ?? err.message));
  });
}

async function fetchText(url: string, timeoutMs: number, headers: Record<string, string> = HEADERS): Promise<{ status: number | string; ms: number; text: string; failure?: string }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    return { status: response.status, ms: Date.now() - started, text: await response.text() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: message.includes("abort") ? `超时 >${Math.round(timeoutMs / 1000)}s` : "连接失败",
      ms: Date.now() - started,
      text: "",
      failure: describeFetchFailure(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Server-rendered page or JavaScript shell?
 *
 * The distinction decides whether a scraper is possible at all, and it is not
 * visible from the status code — a React app answers 200 with a nearly empty
 * body and every link arriving later by fetch. Counting anchors in the
 * returned bytes is the whole test: a CMS listing has dozens, a shell has a
 * handful of nav links or none.
 */
function describeHtml(text: string, linkPattern: RegExp): { note: string; links: string[] } {
  const anchors = [...text.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi)];
  const matching = anchors.filter(([, href]) => linkPattern.test(href));
  const pdfs = anchors.filter(([, href]) => /\.pdf(\?|$)/i.test(href));
  const shell = /__NEXT_DATA__|window\.__NUXT__|id="root"|ng-version/.test(text);
  const text_only = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  // Content first, markers second. The first run reported a page with 271
  // characters and one link as 「服务端渲染，可抓」 purely because it carried
  // no framework marker — but the absence of a marker is not the presence of
  // content, and that verdict was the one line the user was told to read.
  const thin = text_only.length < 800 || anchors.length < 5;
  const verdict = thin
    ? "⚠ 答了，但页面上几乎没东西 —— 内容多半是 JS 后填的，或者这只是个跳转壳子。抓不到"
    : shell
      ? "⚠ 有内容，但带着前端框架的标记（__NEXT_DATA__ / #root）—— 翻页和筛选可能还是 JS 的事"
      : "服务端渲染，可抓";
  const note = [
    `${Math.round(text.length / 1024)}KB`,
    `正文 ${text_only.length} 字`,
    `${anchors.length} 个链接（命中 ${matching.length}，PDF ${pdfs.length}）`,
    verdict,
  ].join(" · ");
  return { note, links: matching.slice(0, 8).map(([, href, label]) => `${label.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 70)} → ${href.slice(0, 110)}`) };
}

/**
 * The one variable worth isolating, asked once per failed step.
 *
 * Six of the first run's eight failures were WAF pages rather than network
 * errors, and the honest User-Agent this project sends is the obvious
 * suspect. Answering it automatically beats asking the user to run a second
 * command — but note what this does NOT do: it never changes what the next
 * step sends. A pass here is a finding to bring back, not a default.
 */
async function browserRetry(url: string, timeoutMs: number, linkPattern: RegExp, already: boolean): Promise<void> {
  if (already) return;
  const { status, ms, text, failure } = await fetchText(url, timeoutMs, BROWSER_HEADERS);
  const failed = failure !== undefined || (typeof status === "number" && (status < 200 || status >= 300));
  if (failed) {
    console.log(`   ↳ 换成浏览器请求头再试：一样不行（${status}，${ms}ms）—— 所以问题不在 User-Agent\n`);
    return;
  }
  // A 200 is not a pass. F5 serves its rejection page with one, and a
  // Cloudflare challenge can too — see BLOCK_PAGE_SIGNATURES.
  const blocked = blockPageReason(text);
  const title = pageTitle(text);
  const described = describeHtml(text, linkPattern);
  if (blocked !== null) {
    console.log(`   ↳ 换成浏览器请求头：拿到 200，但正文是拦截页（「${blocked}」${title ? ` · <title> ${title}` : ""}）—— 不算通\n`);
    return;
  }
  console.log(`   ★ 换成浏览器请求头就通了（${status}，${ms}ms）：${described.note}`);
  if (title) console.log(`     <title> ${title}`);
  // Printed because the verdict alone cannot tell a single-page-app shell
  // from an interstitial, and on run two four different PPI URLs all came
  // back as the same 266-character body — which is one or the other.
  const body = visibleText(text);
  if (body) console.log(`     正文开头：${body.slice(0, 300)}`);
  console.log("     这是个要拿回来讨论的结论，不是可以悄悄写进连接器的 header —— 见本文件开头的说明。\n");
}

async function probeHtml(label: string, why: string, url: string, linkPattern: RegExp, timeoutMs: number, headers?: Record<string, string>): Promise<void> {
  console.log(label);
  console.log(`   为什么试它：${why}`);
  console.log(`   ${url}`);
  const { status, ms, text, failure } = await fetchText(url, timeoutMs, headers);
  const isBrowserPass = headers === BROWSER_HEADERS;
  if (failure !== undefined) {
    record({ label, ok: false, status, ms, note: failure.slice(0, 260) });
    await browserRetry(url, timeoutMs, linkPattern, isBrowserPass);
    return;
  }
  if (typeof status === "number" && (status < 200 || status >= 300)) {
    record({ label, ok: false, status, ms, note: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) });
    await browserRetry(url, timeoutMs, linkPattern, isBrowserPass);
    return;
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    // Asked for HTML, got JSON — that is the best possible outcome here and
    // would be hidden by an HTML-shaped report, so it is called out.
    let keys = "";
    try {
      const body = JSON.parse(trimmed) as unknown;
      keys = Array.isArray(body) ? `数组，${body.length} 项` : Object.keys(body as Record<string, unknown>).slice(0, 20).join(", ");
    } catch {
      keys = "（解析失败）";
    }
    record({ label, ok: true, status, ms, note: `★ 返回的是 JSON 不是 HTML —— 外层键：${keys}` });
    console.log(trimmed.slice(0, 1200).split("\n").map((line) => `     ${line}`).join("\n"));
    console.log();
    return;
  }
  const { note, links } = describeHtml(text, linkPattern);
  record({ label, ok: true, status, ms, note });
  for (const link of links) console.log(`     ${link}`);
  if (links.length > 0) console.log();
}

/**
 * The three-step CKAN read: is it CKAN → which datasets → what are the columns.
 *
 * Each step is reported separately on purpose. "ANEEL has no transmission
 * data" and "ANEEL is not a CKAN portal" and "the dataset exists but its rows
 * are not in the datastore" need three different next moves, and a single
 * combined FAIL would hide which one happened.
 */
async function probeCkan(
  label: string,
  why: string,
  base: string,
  queries: string[],
  timeoutMs: number,
  rows: number,
  collected: { portal: string; pkg: CkanPackage }[],
  extraHeaders?: Record<string, string>,
  /** Tried once if `extraHeaders` is refused — see DADOS_GOV_FALLBACK_HEADERS. */
  fallbackHeaders?: Record<string, string>,
): Promise<void> {
  console.log(label);
  console.log(`   为什么试它：${why}`);
  console.log(`   ${base}`);

  const started = Date.now();
  const callOptions = { timeoutMs, ...(extraHeaders ? { headers: extraHeaders } : {}) };
  try {
    const status = await ckanStatus(base, callOptions);
    record({ label: `${label} · status_show`, ok: true, status: 200, ms: Date.now() - started, note: `确认是 CKAN ${status.ckanVersion ?? "?"} —— ${status.siteTitle ?? ""}（扩展：${status.extensions.join(", ") || "无"}）` });
  } catch (err) {
    const status = (err as { ckanStatus?: number | string }).ckanStatus ?? "?";
    record({ label: `${label} · status_show`, ok: false, status, ms: Date.now() - started, note: `${(err as Error).message.slice(0, 240)}` });
    // The 401 that started all this had an empty body. These four headers are
    // where a portal actually says what it wants and who is turning us away.
    const responseHeaders = (err as { ckanHeaders?: Record<string, string> }).ckanHeaders;
    if (responseHeaders) {
      const telling = ["www-authenticate", "server", "cf-ray", "cf-mitigated", "x-cache", "location"]
        .filter((key) => responseHeaders[key])
        .map((key) => `${key}: ${responseHeaders[key]}`);
      if (telling.length > 0) console.log(`     应答头里有话说：${telling.join(" · ")}`);
    }
    if (status === 401 || status === 403) {
      console.log("     401/403 的意思是这个路径是真的、对方认得它 —— 缺的是凭证或者被当成机器人了，不是「没有这个接口」。");
      if (base.includes("dados.gov.br") && !DADOS_GOV_KEY) {
        console.log("     dados.gov.br 要免费注册一个 key（用 gov.br 账号登录后在账户里申请）。");
        console.log("     拿到后设 DADOS_GOV_BR_API_KEY 再跑一次这条 —— 上一轮它自己说了要 Bearer。");
      }
      // The credential was sent and still refused: try the other header
      // spelling once before concluding the key is wrong.
      if (fallbackHeaders !== undefined) {
        try {
          const retried = await ckanStatus(base, { timeoutMs, headers: fallbackHeaders });
          console.log(`   ★ 换成 ${Object.keys(fallbackHeaders).join("/")} 这个请求头就通了 —— CKAN ${retried.ckanVersion ?? "?"}。`);
          console.log("     也就是说 Bearer 不是它要的，文档里那个老写法才是。记下来，连接器按这个写。\n");
          return;
        } catch (second) {
          console.log(`     换成 ${Object.keys(fallbackHeaders).join("/")} 也不行：${(second as Error).message.slice(0, 160)}`);
          console.log("     两种写法都被拒 —— 那多半是 key 本身的问题（没激活 / 抄漏了 / 权限没勾），不是写法。");
        }
      }
    }
    // Same single variable as the HTML steps. status_show is a JSON endpoint,
    // so the link pattern is irrelevant here and only the status matters.
    await browserRetry(`${base.replace(/\/+$/, "")}/api/3/action/status_show`, timeoutMs, /never/, extraHeaders !== undefined);
    console.log("   → 这一步没确认它是 CKAN。后面几步跳过，省得拿同一个错误刷屏。\n");
    return;
  }

  const seen = new Set<string>();
  const hits: CkanPackage[] = [];
  for (const q of queries) {
    await sleep(800);
    const t0 = Date.now();
    try {
      const search = await ckanPackageSearch(base, { q, rows }, callOptions);
      const fresh = search.results.filter((pkg) => pkg.name !== undefined && !seen.has(pkg.name));
      for (const pkg of fresh) {
        seen.add(pkg.name as string);
        hits.push(pkg);
        collected.push({ portal: base, pkg });
      }
      record({ label: `${label} · q="${q}"`, ok: true, status: 200, ms: Date.now() - t0, note: `${search.count} 个数据集命中，本页 ${search.results.length} 个，新增 ${fresh.length}` });
      for (const pkg of search.results.slice(0, rows)) {
        const resources = pkg.resources ?? [];
        const live = resources.filter((r) => r.datastore_active === true).length;
        console.log(`     · ${pkg.title ?? pkg.name}`);
        console.log(`       name=${pkg.name}  更新=${(pkg.metadata_modified ?? "?").slice(0, 10)}  资源 ${resources.length} 个（可直接查表的 ${live} 个）  ${resources.map((r) => r.format ?? "?").join("/")}`);
      }
      console.log();
    } catch (err) {
      record({ label: `${label} · q="${q}"`, ok: false, status: (err as { ckanStatus?: number | string }).ckanStatus ?? "?", ms: Date.now() - t0, note: (err as Error).message.slice(0, 220) });
    }
  }

  // Step three, and the only one a mapper is written from: real column names.
  // Preference order is deliberate — a datastore-backed resource answers with
  // typed columns, everything else would mean downloading and guessing.
  const target = hits.find((pkg) => (pkg.resources ?? []).some((r) => r.datastore_active === true && r.id));
  if (!target) {
    console.log(`   ${hits.length === 0 ? "没有命中任何数据集" : "命中的数据集里没有一个资源开了 datastore"} —— 拿不到字段名。`);
    console.log("   → 这不是失败，是个结论：字段得从资源文件本身读（CSV/XLSX），映射器要按文件写。\n");
    return;
  }
  const resource = (target.resources ?? []).find((r) => r.datastore_active === true && r.id)!;
  console.log(`   字段实测：${target.title ?? target.name} → 资源「${resource.name ?? resource.id}」`);
  const t1 = Date.now();
  try {
    const data = await ckanDatastoreSearch(base, { resourceId: resource.id as string, limit: 3 }, callOptions);
    record({ label: `${label} · datastore_search`, ok: true, status: 200, ms: Date.now() - t1, note: `${data.total} 行，${data.fields.length} 列` });
    console.log(`     列名：${data.fields.map((f) => `${f.id}:${f.type ?? "?"}`).join(", ")}`);
    console.log("     第一行全文：");
    console.log(JSON.stringify(data.records[0] ?? null, null, 2).split("\n").map((line) => `       ${line}`).join("\n"));
    console.log();
  } catch (err) {
    record({ label: `${label} · datastore_search`, ok: false, status: (err as { ckanStatus?: number | string }).ckanStatus ?? "?", ms: Date.now() - t1, note: (err as Error).message.slice(0, 220) });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const timeoutMs = Math.max(10, Number(arg("--timeout") ?? 90) || 90) * 1000;
  const rows = Math.max(1, Number(arg("--rows") ?? 6) || 6);
  const collected: { portal: string; pkg: CkanPackage }[] = [];

  console.log(`巴西特许经营 / 输电拍卖 —— 数据入口实测，每条最多等 ${Math.round(timeoutMs / 1000)}s\n`);
  console.log("这一轮要回答的就两个问题：");
  console.log("  1. PPI 的项目清单有没有机器可读的形式？没有的话，抓 HTML 行不行？");
  console.log("  2. ANEEL（和 CCEE）的开放数据是不是 CKAN？输电拍卖的表，列名到底叫什么？\n");
  // Reachability before anything else. On the first run, "network" after 10
  // seconds and "403 from Cloudflare" printed as the same kind of line, and
  // they are not the same problem — one is the packets, the other is a
  // policy. A socket is the only thing that can say which.
  console.log("─".repeat(72));
  console.log("\n0. 先分清是网络层还是应用层（只连 TCP 443，不发 HTTP）\n");
  const hosts = [
    "www.ppi.gov.br",
    "dados.gov.br",
    "dados.antt.gov.br",
    "portal.antaq.gov.br",
    "www.in.gov.br",
    "dadosabertos.aneel.gov.br",
    "leilao.aneel.gov.br",
    "antigo.aneel.gov.br",
    "www.gov.br",
    // Not a .gov.br host: ANEEL's open data is mirrored on Esri's ArcGIS Hub,
    // which is a commercial CDN on AWS. If the refusals are geographic, this
    // is the one with the best odds.
    "dadosabertos-aneel.opendata.arcgis.com",
    "hubdeprojetos.bndes.gov.br",
    "dadosabertos.ccee.org.br",
    "www.b3.com.br",
  ];
  const reach = await Promise.all(hosts.map(async (host) => ({ host, ...(await tcpCheck(host, Math.min(timeoutMs, 30_000))) })));
  for (const r of reach) {
    console.log(`  ${(r.ok ? "通  " : "不通").padEnd(4)} ${r.host.padEnd(28)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
  }
  console.log("\n  读法：这一栏「通」而下面还是失败 —— 那是对方在应用层拒绝我们（WAF、验证码、缺凭证），");
  console.log("  网络本身没问题；这一栏「不通」才是真的够不着，两种要改的东西完全不一样。\n");

  console.log("─".repeat(72));
  console.log("\nP. PPI —— 联邦特许经营总盘子（公路/港口/机场/铁路）\n");

  await probeHtml(
    "P1. ppi.gov.br 项目清单（HTML 原样）",
    "先分清是「服务端渲染的 CMS 列表」还是「前端框架壳子」—— 这一条决定了抓取到底可不可行，状态码看不出来",
    "https://www.ppi.gov.br/projetos",
    /projeto|\/projetos\//i,
    timeoutMs,
  );
  await sleep(1500);

  await probeHtml(
    "P2. 同一个网址，但要求返回 JSON",
    "gov.br 的门户很多是 Plone，而 Plone 只要装了 plone.restapi，同一个 URL 加个 Accept: application/json 就直接给结构化数据 —— 值一次请求去试",
    "https://www.ppi.gov.br/projetos",
    /projeto/i,
    timeoutMs,
    JSON_HEADERS,
  );
  await sleep(1500);

  // Corrected 2026-09-18: PPI is WordPress, not Plone. The proof is a URL
  // search turned up on PPI's own site —
  // ppi.gov.br/wp-content/uploads/2025/02/Edital_LT_4-2025_ingles.pdf — and
  // `/wp-content/uploads/` is WordPress's upload path, nothing else's. So the
  // previous Plone `@@search` step was asking the wrong CMS entirely, which
  // is worth more than the step it replaces: WordPress ships a REST API at
  // /wp-json that is enabled by default.
  await probeHtml(
    "P3. WordPress 的 REST 接口（PPI 其实是 WordPress，不是 Plone）",
    "上一轮我按 Plone 试的，方向错了 —— PPI 自己的 edital 挂在 /wp-content/uploads/ 下面，那只能是 WordPress。WordPress 默认就开 /wp-json，通了就直接有结构化数据",
    "https://www.ppi.gov.br/wp-json/wp/v2/pages?search=projeto&per_page=5",
    /projeto/i,
    timeoutMs,
    JSON_HEADERS,
  );
  await sleep(1500);

  // The second WordPress question, and the one that decides whether the
  // portfolio is enumerable: search also turned up `ppi.gov.br/?acao=exibeficha`
  // — a query-string "show the fact sheet" action, which is a custom plugin
  // rather than WordPress routing. If the plugin registered a REST route, it
  // is listed here; if it did not, the portfolio has no API and the answer is
  // a manual export.
  await probeHtml(
    "P3b. WordPress 有哪些 REST 路由（含 PPI 自己插件注册的）",
    "PPI 的项目页是 ?acao=exibeficha 这种老式写法 —— 那是个自定义插件。它有没有顺手注册 REST 路由，这一条就能看出来",
    "https://www.ppi.gov.br/wp-json/",
    /projeto|ficha/i,
    timeoutMs,
    JSON_HEADERS,
  );
  await sleep(1500);

  await probeHtml(
    "P4. 站点地图",
    "如果结论是「只能抓 HTML」，那清单页的翻页就是下一个坑；sitemap 能一次把所有项目页的网址列出来，绕开翻页",
    "https://www.ppi.gov.br/sitemap.xml",
    /projeto/i,
    timeoutMs,
  );
  await sleep(1500);

  // dados.gov.br — the national catalogue. Worth one call because if the PPI
  // portfolio is published there as a dataset, the whole scraping question
  // disappears.
  await probeCkan(
    "P5. dados.gov.br（国家开放数据门户）",
    "PPI 的项目库有没有以数据集形式发布在国家门户上 —— 如果有，上面的抓取问题整个不存在了",
    "https://dados.gov.br",
    // All four sectors in one place: the national catalogue is where every
    // federal body is required to register its datasets, which makes it a
    // better bet than guessing four agency hostnames.
    ["PPI parcerias investimentos", "concessão rodoviária ANTT", "arrendamento portuário ANTAQ", "concessão aeroportuária ANAC"],
    timeoutMs,
    rows,
    collected,
    DADOS_GOV_HEADERS,
    DADOS_GOV_FALLBACK_HEADERS,
  );

  console.log("─".repeat(72));
  console.log("\nP6–P8. 行业监管机构和公报 —— 招标文件其实是它们发的，不是 PPI 发的\n");
  console.log("   PPI 公布的是「盘子」，真正的 edital：公路铁路看 ANTT，港口看 ANTAQ，机场看 ANAC。");
  console.log("   谁家有开放数据门户，谁就是比抓 PPI 页面更靠谱的入口。\n");

  await probeCkan(
    "P6. ANTT（公路 + 铁路）",
    "公路和铁路特许经营的主管机构 —— PPI 盘子里最大的一块，而且它确实有一个独立的开放数据域名",
    "https://dados.antt.gov.br",
    ["leilão concessão", "outorga rodoviária"],
    timeoutMs,
    rows,
    collected,
  );

  // ANTAQ gets an HTML probe rather than a CKAN one: its open-data host does
  // not resolve (see the DNS note at the top), so the portal page is the only
  // address there is evidence for.
  await probeHtml(
    "P7. ANTAQ 门户（港口租赁 / 特许）",
    "港口的主管机构。它没有独立的开放数据域名（我猜的那两个 DNS 都不存在），所以这里问的是另一个问题：门户页上的 leilão / edital 链接抓不抓得到",
    "https://portal.antaq.gov.br",
    /leil|edital|arrendamento|concess/i,
    timeoutMs,
  );
  await sleep(1500);

  // ANAC is deliberately absent here. The open-data hostname I would have
  // written does not exist, and a guessed one produces a FAIL that says
  // nothing — P5's catalogue query is where ANAC is looked for instead.

  // The DOU is the one door that does not depend on any agency's website
  // being good: an aviso de licitação for a federal concession must be
  // published there. It is also the exact shape of a connector this repo
  // already has — the Mexican DOF — which is why it is worth one step even
  // though it was not asked for.
  await probeHtml(
    "P8. DOU（联邦公报）检索页",
    "所有联邦特许的招标公告依法都要登公报 —— 这条路不依赖哪个机构的网站做得好不好，而且墨西哥的 DOF 连接器已经是同一个形状了",
    "https://www.in.gov.br/consulta/-/buscar/dou?q=leil%C3%A3o+de+transmiss%C3%A3o&s=todos&exactDate=all&sortType=0",
    /leil|edital|aviso/i,
    timeoutMs,
  );
  await sleep(1500);

  console.log("─".repeat(72));
  console.log("\nE. ANEEL / CCEE —— 输电拍卖\n");
  console.log("   分工先说清楚，免得两边都白花力气：**输电拍卖是 ANEEL 办的**（edital 是 ANEEL 的，");
  console.log("   拍卖当天在 B3 交易所开），**CCEE 办的是发电侧的能源拍卖**并负责市场结算。");
  console.log("   用户问的那个（国网、三峡在巴西的主战场）是前者。\n");

  // E1 no longer searches. Web search already named the dataset and both
  // resource ids, so the only question left is the column contract — and
  // datastore_search answers it in one call.
  console.log("E1. ANEEL 输电拍卖结果表 —— 直接按已知 resource id 取字段");
  console.log(`   为什么这么问：数据集和两个 resource id 是搜出来的，不是猜的（dataset ${ANEEL_DATASET}）。`);
  console.log("   注意这张表是【结果】不是【在招】：1999 年以来每场拍卖谁中的标、RAP 多少、折价多少。");
  console.log("   它对应的是本平台的中标方/中标金额那一侧，以及「中资企业在巴西中过哪些标」的报表。");
  console.log(`   ${"https://dadosabertos.aneel.gov.br/api/3/action/datastore_search"}?resource_id=${ANEEL_TRANSMISSION_RESOURCE}&limit=3`);
  // Generation goes in the same pass: the same Chinese firms bid solar, wind
  // and storage, and it is one more request against a host that either
  // answers or does not.
  for (const [what, resourceId] of [
    ["输电", ANEEL_TRANSMISSION_RESOURCE],
    ["发电", ANEEL_GENERATION_RESOURCE],
  ] as const) {
    const started = Date.now();
    const label = `E1. ANEEL ${what}拍卖结果表`;
    try {
      const data = await ckanDatastoreSearch("https://dadosabertos.aneel.gov.br", { resourceId, limit: 3 }, { timeoutMs });
      record({ label, ok: true, status: 200, ms: Date.now() - started, note: `${data.total} 行，${data.fields.length} 列 —— 这就是映射器要照抄的字段表` });
      console.log(`     列名：${data.fields.map((f) => `${f.id}:${f.type ?? "?"}`).join(", ")}`);
      console.log("     第一行全文：");
      console.log(JSON.stringify(data.records[0] ?? null, null, 2).split("\n").map((line) => `       ${line}`).join("\n"));
      console.log();
    } catch (err) {
      record({ label, ok: false, status: (err as { ckanStatus?: number | string }).ckanStatus ?? "?", ms: Date.now() - started, note: (err as Error).message.slice(0, 220) });
      if (what === "输电") {
        console.log("     取不到的话，字段还有一条路：ANEEL 自己发的数据字典 PDF");
        console.log(`     ${ANEEL_TRANSMISSION_DICTIONARY}`);
        console.log("     用浏览器下下来发我也行 —— 映射器照着它写，跟照着真实行写是一个效果。\n");
      }
    }
    await sleep(1500);
  }

  await probeHtml(
    "E1b. ANEEL 开放数据的 ArcGIS 镜像（不是 .gov.br 主机）",
    "同一批数据还有一份挂在 Esri 的 ArcGIS Hub 上 —— 那是 AWS 上的商业 CDN，跟 .gov.br 完全两条网络。前面那些拒绝如果是地域性的，这个门最有可能是开的",
    "https://dadosabertos-aneel.opendata.arcgis.com/api/feed/dcat-us/1.1.json",
    /leil|transmiss/i,
    timeoutMs,
    JSON_HEADERS,
  );
  await sleep(1500);

  await probeHtml(
    "E1c. ANEEL 的拍卖系统（在招的场次在这儿，不在开放数据里）",
    "开放数据那张表是历史结果。真正「下一场拍什么」在这个子域名上 —— 上一轮压根没试过它",
    "https://leilao.aneel.gov.br/listaLeiloesFinalizados",
    /leil|edital|lote/i,
    timeoutMs,
  );
  await sleep(1500);

  // ANEEL's site moved onto the gov.br platform; www.aneel.gov.br is the old
  // address and is what Cloudflare was challenging. Both are tried, because
  // "the page moved" and "the page is defended" look identical from one 403.
  await probeHtml(
    "E2. ANEEL 拍卖专页（gov.br 上的现址）",
    "招标文件本身是 PDF。ANEEL 的网站已经搬到 gov.br 平台上了 —— 上一轮我敲的 www.aneel.gov.br 是旧地址，被 Cloudflare 挡住时看不出「搬走了」和「被防住了」的区别",
    "https://www.gov.br/aneel/pt-br/centrais-de-conteudos/relatorios-e-indicadores/leiloes",
    /\.pdf|edital|leil/i,
    timeoutMs,
  );
  await sleep(1500);

  await probeHtml(
    "E2b. ANEEL 旧站（对照组）",
    "旧站还在，而且历史 edital 大多挂在这边 —— 同时也是上一轮那个 403 的对照",
    "https://antigo.aneel.gov.br/leiloes",
    /\.pdf|edital|leil/i,
    timeoutMs,
  );
  await sleep(1500);

  await probeCkan(
    "E3. CCEE 开放数据",
    "发电侧拍卖（新能源、储能）和市场结算数据。不是用户问的那一块，但同一批中资企业也在投，顺手确认一下门在哪",
    "https://dadosabertos.ccee.org.br",
    ["leilão", "energia nova"],
    timeoutMs,
    rows,
    collected,
  );

  // Three doors found by web search that nothing had knocked on. The first is
  // the most useful single fact of the round: PPI republishes the larger
  // ANEEL transmission editais **in English**, as static PDFs under
  // /wp-content/uploads/ — no challenge, no session, and no translation step.
  await probeHtml(
    "E3b. PPI 上的英文版 ANEEL 输电拍卖 edital",
    "搜索时撞到的：PPI 把大场次的 edital 出了英文版，而且就是 /wp-content/uploads/ 下的静态 PDF —— 没有验证、没有会话，还省掉一道翻译",
    "https://ppi.gov.br/wp-content/uploads/2025/02/Edital_LT_4-2025_ingles.pdf",
    /\.pdf/i,
    timeoutMs,
  );
  await sleep(1500);

  await probeHtml(
    "E3c. BNDES 项目中心",
    "BNDES 是这些特许项目的结构化方和出资方，它自己有个项目库（还有英文版）—— 又一个不依赖 PPI 页面的入口",
    "https://hubdeprojetos.bndes.gov.br/en/setores/Rodovias",
    /projet|concess|rodovi/i,
    timeoutMs,
  );
  await sleep(1500);

  await probeHtml(
    "E4. B3 拍卖页",
    "拍卖当天的会场在 B3，中标结果最先出现在这里。多半是个 JS 壳子 —— 那也是结论，说明结果得回 ANEEL 取",
    "https://www.b3.com.br/pt_br/b3/qualificacao-e-governanca/leiloes/",
    /leil|edital/i,
    timeoutMs,
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("─".repeat(72));
  console.log("小结\n");
  for (const outcome of outcomes) {
    console.log(`  ${(outcome.ok ? "OK  " : "FAIL").padEnd(5)} ${String(outcome.status).padEnd(14)} ${String(outcome.ms).padStart(7)}ms  ${outcome.label}`);
  }
  console.log();

  if (collected.length > 0) {
    const csv = toCsv(
      ["portal", "dataset_name", "title", "organization", "metadata_modified", "resources", "datastore_resources", "formats", "notes"],
      collected.map(({ portal, pkg }): CsvValue[] => {
        const resources = pkg.resources ?? [];
        return [
          portal,
          pkg.name ?? "",
          pkg.title ?? "",
          pkg.organization?.title ?? pkg.organization?.name ?? "",
          pkg.metadata_modified ?? "",
          resources.length,
          resources.filter((r) => r.datastore_active === true).length,
          [...new Set(resources.map((r) => (r.format ?? "?").toUpperCase()))].join("/"),
          (pkg.notes ?? "").replace(/\s+/g, " ").slice(0, 300),
        ];
      }),
    );
    writeReviewCsv({
      dir: OUT_DIR,
      baseName: `brazil-concessions-datasets-${new Date().toISOString().slice(0, 10)}`,
      csv,
      label: "probe:brazil-concessions",
      failureNote: "上面终端里的数据集清单没有丢，CSV 只是没写成。",
    });
    console.log();
  }

  const ckanOk = outcomes.some((o) => o.ok && /status_show/.test(o.label));
  console.log("要发我的东西，按重要性排：\n");
  console.log("  1. 【列名】那几行 —— datastore_search 打出来的 `列名：…` 和 `第一行全文`。");
  console.log("     映射器是照着它写的，不是照着我记忆里的字段名写的。");
  console.log("  2. 任何一行以 ★ 开头的，连同它下面的 <title> 和正文开头。");
  console.log("     ★ 现在只在正文不是拦截页时才打 —— 上一轮它判过三个假阳性（F5 的拒绝页是 200）。");
  console.log("  3. 最上面那张 TCP 表 —— 「通」而底下还是失败的是应用层拒绝；「不通」才是真够不着。");
  if (!ckanOk) {
    console.log("\n  仍然没有任何门户确认是 CKAN。上一轮站到哪儿了，可以对照：");
    console.log("    dados.gov.br     401，且应答头写明要 Bearer —— 唯一差一个免费 key 就能进的门");
    console.log("    ANTT             F5 把拒绝页当 200 发，换 UA 没用");
    console.log("    ANTAQ / ANEEL    Cloudflare 的 JS 验证 —— 换 UA 没用，它要的是真能跑 JS 的浏览器");
    console.log("    dadosabertos.aneel.gov.br  socket 层 ETIMEDOUT，这条是网络真的不通，不是策略");
    console.log("    PPI              换 UA 能拿到 200，但四个不同网址返回同一个 266 字的空壳");
  }
  if (DADOS_GOV_KEY === undefined) {
    console.log("\n  下一步就一件事：dados.gov.br 的 key。它是唯一一个「路径是真的、只差凭证」的门，");
    console.log("  而且一个 key 覆盖 ANTT / ANTAQ / ANAC / ANEEL 四家的数据集。");
    console.log("  设好 DADOS_GOV_BR_API_KEY 再跑这条即可，Bearer 和文档里的老写法都会试。");
  }
  console.log("\n输电标段的金额按【预估总投资 CAPEX】走（2026-09-18 已确认），RAP 放摘要正文点名。");
  console.log("见 lib/ingestion/README.md 的「Three traps that are new…」。");
}

main().catch((err) => {
  console.error(describeFetchFailure(err));
  process.exit(1);
});
