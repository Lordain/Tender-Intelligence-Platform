import { egressDenial, describeEgressDenial } from "@/lib/ingestion/egress-denial";
import type { OcdsReleasePackage } from "@/lib/ingestion/types";

/**
 * Chile — ChileCompra / Mercado Público, via their OCDS export.
 *
 * ── What this door is, measured 2026-09-24 ────────────────────────────────
 *
 * Two hosts, two jobs, and they are different hosts despite the near-identical
 * names — a typo between them is a 404, not a redirect:
 *
 *   apis.mercadopublico.cl/OCDS/data/listaAñoMes/{año}/{mes}/{offset}/{limit}
 *       The monthly INDEX. Returns ocids plus per-record URLs. Paginated,
 *       limit caps at 1000, `total` is honest (offset 8000 of 8004 returned 4).
 *
 *   api.mercadopublico.cl/APISOCDS/OCDS/tender/{code}
 *       One record, as an OCDS 1.1 release package. ~3.5KB to ~56KB.
 *
 * NO CREDENTIAL. Both answered every call here with no ticket, no key and no
 * browser impersonation. That is worth stating loudly because the OTHER
 * Mercado Público API — `api.mercadopublico.cl/servicios/v1/publico/…`, the
 * one this repo's round-1 notes assumed was the only door — does require a
 * ticket, and that ticket needs Clave Única (a Chilean national identity).
 * See the README's 2026-09-24 section. This path sidesteps that question
 * entirely rather than working around it.
 *
 * ── Three responses here that are NOT what their status code says ─────────
 *
 * 1. HTTP 200 + `{"status":404,"detail":"No se encontraron resultados."}`
 *    The index says "this month has nothing" IN THE BODY, at 200. Compare
 *    `{"statusCode":404,"message":"Resource not found"}` at a real HTTP 404,
 *    which means the ROUTE does not exist — a spelling error on our side.
 *    Those two are opposite diagnoses and they differ only by a key name.
 *    readIndexPage() keeps them apart; see EmptyMonth below.
 *
 * 2. HTTP 203 + `{"Codigo":203,"Mensaje":"Ticket no válido."}`
 *    203 is a SUCCESS status, so `response.ok` is true and a connector that
 *    trusts `.ok` parses a refusal as data. Only the `/servicios/` API does
 *    this, but assertNotTicketEnvelope() runs on every body here anyway: it
 *    costs one property check and it is the failure that would be silent.
 *
 * 3. HTTP 403 with `x-deny-reason` — our own container's egress gateway, not
 *    Chile. Round 1 spent a whole round on this and the discriminator it left
 *    behind (lib/ingestion/egress-denial.ts) is wired in here at the front,
 *    before any status is read as meaning anything. Unreachable ≠ empty ≠
 *    not-yet-published ≠ never-asked.
 *
 * ── The freshness problem, which is the source's, not ours ────────────────
 *
 * Measured 2026-09-24: the newest month the index serves is 2026-07, and the
 * newest `publishedDate` on any record in it is 2026-07-29T18:48Z. Records
 * published on 2026-07-29 carry a publish lag of MINUTES (17:13 → 17:17), so
 * this was a near-real-time feed that stopped, not a feed with a designed
 * two-month delay. 2026-08 and 2026-09 both answer "No se encontraron
 * resultados".
 *
 * That is why assertIndexFreshness() exists and why nothing here silently
 * treats an empty month as "nothing published". An importer that reads a
 * stalled feed as an empty one reports a successful run of zero rows forever.
 */

/** The index host. Note the `s` — `api.` without it does not serve this path. */
const CHILE_OCDS_INDEX_BASE = "https://apis.mercadopublico.cl/OCDS/data";

/** The per-record host. Note NO `s`. The index's own urlTender fields point here. */
const CHILE_OCDS_RECORD_BASE = "https://api.mercadopublico.cl/APISOCDS/OCDS";

/**
 * Same posture as every other connector in this repo: a real product name and
 * a contact URL, so a public open-data operator can see who is calling and
 * throttle this caller specifically. Nothing here claims to be a browser.
 *
 * On `.gob.pe` being honest is what actually fixed a 403 (see
 * peru-oece-live.ts). Chile never refused this caller at all.
 */
export const CHILE_OCDS_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "es-CL,es;q=0.9",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** Their own cap. Asking for more is not refused — it is silently served as 1000. */
export const CHILE_OCDS_MAX_PAGE_SIZE = 1000;

/** 429 and 5xx are routinely transient here; a 404 is a route that does not exist and retrying it only wastes the operator's bandwidth. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

/**
 * The newest month the index carried when this was written.
 *
 * Not a config knob and not a cutoff — it is a MEASUREMENT with a date on it,
 * used by assertIndexFreshness() to tell "Chile has published nothing since"
 * from "our window is wrong". When the feed resumes this number is stale in
 * the harmless direction: the check only ever fires on months at or after it.
 */
export const CHILE_OCDS_LAST_MEASURED_MONTH = "2026-07";

/** `listaAñoMes`, with the ñ. The ASCII spelling `listaAnoMes` is a real 404 — measured, not assumed. */
const INDEX_ROUTE = encodeURIComponent("listaAñoMes");

export function chileOcdsIndexUrl(year: number, month: number, offset: number, limit: number): string {
  // Month is zero-padded because `.../2026/9/0/10` and `.../2026/09/0/10` both
  // answer 200 and both were tried — but every URL the source's own docs and
  // its urlTender fields use is padded, so padded is what gets sent.
  return `${CHILE_OCDS_INDEX_BASE}/${INDEX_ROUTE}/${year}/${String(month).padStart(2, "0")}/${offset}/${limit}`;
}

export function chileOcdsTenderUrl(code: string): string {
  return `${CHILE_OCDS_RECORD_BASE}/tender/${encodeURIComponent(code)}`;
}

/**
 * The ticket-gated API, asked WITHOUT a ticket — captured as a fixture so the
 * HTTP-203 trap is pinned by real bytes rather than by this comment.
 *
 * This repo does not hold a ticket and does not acquire one: see the README.
 */
export const MERCADO_PUBLICO_TICKET_PROBE_URL =
  "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json?estado=activas";

/**
 * The public ficha URL that LOOKS right and is empty. Captured, not used.
 *
 * See chileOcdsPublicUrl() for the form that works.
 */
export const CHILE_FICHA_TRAP_URL =
  "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?qs=1211839-44-LE26";

/** One entry of the monthly index. Only `ocid` is guaranteed; the url fields appear per lifecycle stage. */
export type ChileOcdsIndexEntry = {
  ocid: string;
  urlTender?: string;
  urlAward?: string;
  urlPlanning?: string;
  urlContract?: string;
};

export type ChileOcdsIndexPage = {
  /** Total records the source says exist for this month, not the page size. */
  total: number;
  entries: ChileOcdsIndexEntry[];
  /**
   * True when the source answered "No se encontraron resultados" for this
   * month — a real answer about the month, NOT a failure and NOT a 404 route.
   */
  empty: boolean;
};

export class ChileOcdsError extends Error {}

/**
 * Thrown when the egress gateway of the machine we are running on refused the
 * request. Carries its own type so a caller can say "this container cannot
 * reach Chile" instead of "Chile is down" — the distinction round 1 was built
 * around.
 */
export class ChileEgressBlockedError extends ChileOcdsError {}

/** Thrown when a `/servicios/` style ticket envelope comes back on ANY path. */
export class ChileTicketRequiredError extends ChileOcdsError {}

async function fetchChile(url: string): Promise<Response> {
  // `cache: "no-store"` because Next patches global fetch: a response held
  // from an earlier call — a refusal included — would be replayed as if it
  // were this call's answer, which is the shape of bug that makes a fix look
  // like it did not work.
  const init: RequestInit = { headers: CHILE_OCDS_HEADERS, cache: "no-store" };
  let response = await fetch(url, init);
  for (let attempt = 1; attempt < MAX_ATTEMPTS && RETRYABLE_STATUSES.has(response.status); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    response = await fetch(url, init);
  }
  return response;
}

/**
 * One GET, with every one of this source's disguises unwrapped.
 *
 * @param what names the thing being fetched, in Chinese, and ends up verbatim
 *   in the failure message. A multi-month run that fails on one month has to
 *   say WHICH month — the same reason oeceError() takes a prefix.
 */
async function getChileJson(url: string, what: string): Promise<unknown> {
  const response = await fetchChile(url);
  const text = await response.text();

  // FIRST, before the status means anything. Our own gateway answers 403 for
  // a host that is not on its allowlist — the same status a WAF uses and the
  // opposite diagnosis.
  const denial = egressDenial(response.headers, text);
  if (denial) {
    throw new ChileEgressBlockedError(`抓取${what}失败：${describeEgressDenial(denial)}\n  URL：${url}`);
  }

  if (!response.ok) {
    const snippet = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    throw new ChileOcdsError(
      `抓取${what}失败：${response.status} ${response.statusText}${snippet ? ` —— 服务端返回：${snippet}` : "（空正文）"}\n  URL：${url}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ChileOcdsError(
      `抓取${what}：HTTP ${response.status}，但正文不是 JSON（前 200 字：${text.replace(/\s+/g, " ").slice(0, 200)}）\n  URL：${url}`,
    );
  }

  assertNotTicketEnvelope(parsed, what, url);
  return parsed;
}

/**
 * Refuses a `{Codigo, Mensaje}` envelope however it arrived.
 *
 * Mercado Público's `/servicios/` API answers an auth failure with HTTP 203 —
 * a 2xx — so `response.ok` is true and the check above lets it through. The
 * OCDS paths have never produced one of these, and this still runs on every
 * body: if ChileCompra ever puts the OCDS export behind the same gate, the
 * alternative is an importer that writes `{Codigo: 203}` into the tender
 * table and reports success.
 */
function assertNotTicketEnvelope(body: unknown, what: string, url: string): void {
  if (body === null || typeof body !== "object") return;
  const envelope = body as { Codigo?: unknown; Mensaje?: unknown };
  if (envelope.Codigo === undefined || envelope.Mensaje === undefined) return;
  throw new ChileTicketRequiredError(
    `抓取${what}：对方返回的是凭证错误信封，不是数据 —— Codigo=${String(envelope.Codigo)}，` +
      `Mensaje=「${String(envelope.Mensaje)}」。\n` +
      "  注意这个接口用 HTTP 203（2xx）回这种错误，按状态码判断会当成成功。\n" +
      "  ticket 在 https://api.mercadopublico.cl/modules/IniciarSesion.aspx 申请，需要智利的 Clave Única。\n" +
      `  URL：${url}`,
  );
}

/**
 * One page of the monthly index.
 *
 * The 200-carrying-404 case returns `empty: true` rather than throwing,
 * because it is a true statement about that month and the caller has to be
 * able to tell it from a fetch failure. It is NOT scored as success by
 * assertIndexFreshness() either — see there.
 */
export async function fetchChileOcdsIndexPage(
  year: number,
  month: number,
  offset = 0,
  limit = CHILE_OCDS_MAX_PAGE_SIZE,
): Promise<ChileOcdsIndexPage> {
  const capped = Math.min(Math.max(1, limit), CHILE_OCDS_MAX_PAGE_SIZE);
  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;
  const url = chileOcdsIndexUrl(year, month, offset, capped);
  return readIndexPage(await getChileJson(url, `智利 OCDS 月度索引 ${monthLabel}`), monthLabel, url);
}

/**
 * Separated from the fetch so the traps can be tested against the captured
 * bytes without a network call — which is the only way to test a trap that
 * only appears when the source is having a bad day.
 */
export function readIndexPage(body: unknown, monthLabel: string, url: string): ChileOcdsIndexPage {
  if (body === null || typeof body !== "object") {
    throw new ChileOcdsError(`智利 OCDS 月度索引 ${monthLabel}：应答不是对象\n  URL：${url}`);
  }
  const envelope = body as {
    status?: unknown;
    detail?: unknown;
    statusCode?: unknown;
    message?: unknown;
    pagination?: { total?: unknown };
    data?: unknown;
  };

  // The in-body 404. Means: this month exists as a question, and the answer
  // is nothing. A fact about the month.
  if (envelope.status === 404) {
    return { total: 0, entries: [], empty: true };
  }
  // The route-level 404, which can also arrive at HTTP 200 on this host.
  // Means: we spelled the URL wrong. A fact about US. Never silently empty.
  if (envelope.statusCode === 404) {
    throw new ChileOcdsError(
      `智利 OCDS 月度索引 ${monthLabel}：这个路由不存在（「${String(envelope.message ?? "Resource not found")}」）。\n` +
        "  这是拼法问题，不是「智利这个月没数据」—— 后者的正文写的是 status 404 + No se encontraron resultados。\n" +
        `  URL：${url}`,
    );
  }

  if (!Array.isArray(envelope.data)) {
    throw new ChileOcdsError(
      `智利 OCDS 月度索引 ${monthLabel}：应答里没有 data 数组，外层字段是 ${Object.keys(envelope).join(" / ") || "（无）"}\n  URL：${url}`,
    );
  }
  const entries = (envelope.data as ChileOcdsIndexEntry[]).filter((entry) => typeof entry?.ocid === "string");
  const total = typeof envelope.pagination?.total === "number" ? envelope.pagination.total : entries.length;
  return { total, entries, empty: entries.length === 0 };
}

/** The tender code as the source's own ficha URLs use it — the ocid minus ChileCompra's OCDS prefix. */
export function tenderCodeFromOcid(ocid: string): string {
  return ocid.replace(/^ocds-70d2nz-/, "");
}

/** One record, as an OCDS release package. */
export async function fetchChileOcdsTender(code: string): Promise<OcdsReleasePackage> {
  const url = chileOcdsTenderUrl(code);
  const body = await getChileJson(url, `智利招标记录 ${code}`);
  const pkg = body as OcdsReleasePackage;
  if (!Array.isArray(pkg?.releases)) {
    throw new ChileOcdsError(`智利招标记录 ${code}：应答里没有 releases 数组\n  URL：${url}`);
  }
  return pkg;
}

/**
 * Every record of one month, index followed by per-record fetches.
 *
 * Two deliberate shapes:
 *
 * - The index is walked to `total`, not to "until a page comes back short".
 *   `total` was verified honest (offset 8000 of 8004 returned exactly 4).
 * - A single record that fails does NOT fail the month. At ~8,000–10,000
 *   records a month, one 500 on record 4,213 throwing away the other 9,999 is
 *   not a trade anyone would choose. Failures are COUNTED and returned, so a
 *   run that quietly lost half its rows is visible as a number rather than
 *   invisible as an absence.
 */
export async function fetchChileOcdsMonth(
  year: number,
  month: number,
  options: { maxRecords?: number } = {},
  onProgress?: (message: string) => void,
): Promise<{ total: number; packages: OcdsReleasePackage[]; empty: boolean; failed: { code: string; error: string }[] }> {
  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;
  const first = await fetchChileOcdsIndexPage(year, month, 0, CHILE_OCDS_MAX_PAGE_SIZE);
  if (first.empty) {
    onProgress?.(`${monthLabel}：索引说这个月没有记录（正文 status 404 / No se encontraron resultados）`);
    return { total: 0, packages: [], empty: true, failed: [] };
  }

  const wanted = options.maxRecords && options.maxRecords > 0 ? Math.min(options.maxRecords, first.total) : first.total;
  const entries = [...first.entries];
  for (let offset = entries.length; offset < wanted; offset += CHILE_OCDS_MAX_PAGE_SIZE) {
    const page = await fetchChileOcdsIndexPage(year, month, offset, CHILE_OCDS_MAX_PAGE_SIZE);
    if (page.entries.length === 0) break;
    entries.push(...page.entries);
    onProgress?.(`${monthLabel}：索引 ${entries.length} / ${first.total}`);
  }

  const packages: OcdsReleasePackage[] = [];
  const failed: { code: string; error: string }[] = [];
  const codes = entries.slice(0, wanted).map((entry) => tenderCodeFromOcid(entry.ocid));
  for (const [index, code] of codes.entries()) {
    try {
      packages.push(await fetchChileOcdsTender(code));
    } catch (err) {
      // An egress block is not one bad record — it means nothing will work,
      // and grinding through 8,000 more of them to say so is worse than
      // stopping. Every other failure is per-record and survivable.
      if (err instanceof ChileEgressBlockedError || err instanceof ChileTicketRequiredError) throw err;
      failed.push({ code, error: err instanceof Error ? err.message : String(err) });
    }
    if ((index + 1) % 100 === 0) onProgress?.(`${monthLabel}：记录 ${index + 1} / ${codes.length}，失败 ${failed.length}`);
  }
  return { total: first.total, packages, empty: false, failed };
}

/**
 * Says, in one line, whether the months we asked for actually carry anything —
 * and refuses to let "all empty" read as "nothing new was published".
 *
 * The distinction is the whole point. As of 2026-09-24 the index has served
 * nothing since 2026-07-29, so a nightly Chile import asking for the current
 * month gets zero rows, forever, and every one of those runs is a "success".
 * That is precisely the collapse the README's house rule forbids, one step
 * further along: unreachable ≠ empty ≠ not-yet-published ≠ never-asked, and
 * this is the fifth — *the source stopped publishing and nobody noticed*.
 *
 * Returns a message rather than throwing: an empty month is not an error, it
 * is news, and news belongs in the report where a person reads it.
 */
export function describeIndexFreshness(
  months: { label: string; empty: boolean; total: number }[],
): string | null {
  const withRows = months.filter((month) => !month.empty);
  if (withRows.length > 0) return null;
  return (
    `⚠ 要的 ${months.length} 个月（${months.map((m) => m.label).join("、")}）索引全是空的。\n` +
    `  这不等于「智利最近没发标」。2026-09-24 实测：索引最新的一个月是 ${CHILE_OCDS_LAST_MEASURED_MONTH}，\n` +
    "  里面最新一条记录的 publishedDate 是 2026-07-29T18:48Z；而 07-29 当天发的记录发布延迟只有几分钟。\n" +
    "  也就是说这是一个近实时的源在 2026-07-29 停了，不是一个有两个月延迟的源。\n" +
    "  在它恢复之前，智利这条线导不进任何东西 —— 请不要把这种空跑读成「跑通了，今天没有新项目」。"
  );
}
