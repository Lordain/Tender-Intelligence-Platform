/**
 * Uruguay — ARCE's OCDS feed (comprasestatales.gub.uy), added 2026-10-13
 * (user: 帮忙看看增加乌拉圭 → 都收，没金额的最多中型).
 *
 * The Agencia Reguladora de Compras Estatales publishes every state purchase
 * on comprasestatales.gub.uy and serves it as Open Contracting releases, no
 * key, no login:
 *
 *   GET /ocds/rss                 the latest 500 releases (about 4 days)
 *   GET /ocds/rss/YYYY/MM         every release of one month (13,700 in September 2026)
 *   GET /ocds/release/{id}        one release, e.g. llamado-1378894
 *
 * The RSS item names only the purchase id and the release kind (<category>:
 * tender, tenderUpdate, award…), so every new call ("tender") is read in
 * full to learn its procedure and buyer.
 *
 * Measured 2026-10-13 on 250 September calls (of 2,130): Compra Directa 64%,
 * Licitación Abreviada 15%, Concurso de Precios 14%, Licitación Pública 2%
 * (about 30–40 a month — among them UTE's third 500 kV corridor). None of
 * the 250 carried an amount: Uruguay does not publish the estimate.
 *
 * What is read further (user, 2026-10-13: 都收): every Licitación Pública, and
 * the Licitaciones Abreviadas of the state companies and the public-works
 * ministry — UTE, ANCAP, OSE, ANP, AFE and MTOP (isIngestedArceTender).
 */

export const ARCE_BASE = "https://www.comprasestatales.gub.uy";

const HEADERS = {
  Accept: "application/json, application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 90_000;
const RETRIES = 4;
/** Between release requests: ARCE's server is small, and a day is ~70 calls. */
const RELEASE_PACE_MS = 300;

export type ArceFeedItem = { releaseId: string; purchaseId: string; category: string; pubDate: string };

export type ArceRelease = {
  ocid: string;
  id: string;
  date: string;
  tag?: string[];
  buyer?: { name?: string; id?: string };
  parties?: { id?: string; name?: string; roles?: string[] }[];
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    procurementMethod?: string;
    procurementMethodDetails?: string;
    mainProcurementCategory?: string;
    value?: { amount?: number; currency?: string } | null;
    items?: { id?: string; description?: string; classification?: { id?: string; description?: string }; quantity?: number; unit?: { name?: string } }[];
    tenderPeriod?: { startDate?: string; endDate?: string };
    documents?: { id?: string; documentType?: string; url?: string; datePublished?: string; format?: string; title?: string }[];
  };
};

/**
 * The state companies and the public-works ministry whose Licitaciones
 * Abreviadas are read too. Matched on the buyer id's inciso (the part before
 * the dash — 61-1 is UTE) and, for ANP, on the name as well, since no ANP
 * call was in the 2026-10-13 sample to read its inciso from.
 *
 *   60 ANCAP · 61 UTE · 62 AFE · 66 OSE · 10 MTOP (e.g. 10-3 Dirección Nacional de Vialidad)
 */
const KEY_BUYER_INCISOS = new Set(["10", "60", "61", "62", "66"]);
const KEY_BUYER_NAME = /administraci[oó]n nacional de puertos|\bANP\b/i;

export function isKeyBuyer(buyer: { name?: string; id?: string } | undefined): boolean {
  const inciso = (buyer?.id ?? "").split("-")[0];
  return KEY_BUYER_INCISOS.has(inciso) || KEY_BUYER_NAME.test(buyer?.name ?? "");
}

/** Every Licitación Pública, and the key buyers' Licitaciones Abreviadas. */
export function isIngestedArceTender(release: ArceRelease): boolean {
  const method = (release.tender?.procurementMethodDetails ?? "").trim();
  if (/^licitaci[oó]n p[uú]blica\b/i.test(method)) return true;
  return /^licitaci[oó]n abreviada\b/i.test(method) && isKeyBuyer(release.buyer);
}

async function get(url: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (err) {
      last = err;
      await new Promise((resolve) => setTimeout(resolve, 5_000 * (attempt + 1)));
    }
  }
  throw new Error(`${url} 请求失败：${last instanceof Error ? last.message : String(last)}`);
}

/** RSS items as plain records. The feed's markup is regular and generated, so a small parser is enough. */
export function parseArceRss(xml: string): ArceFeedItem[] {
  const items: ArceFeedItem[] = [];
  for (const block of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const title = /<title>([^<]*)<\/title>/.exec(block)?.[1] ?? "";
    const purchaseId = /id_compra:(\d+)/.exec(title)?.[1];
    const releaseId = /release_id:([^,<\s]+)/.exec(title)?.[1] ?? /<guid>([^<]+)<\/guid>/.exec(block)?.[1];
    const category = /<category>([^<]*)<\/category>/.exec(block)?.[1]?.trim() ?? "";
    const pubDate = /<pubDate>([^<]*)<\/pubDate>/.exec(block)?.[1]?.trim() ?? "";
    if (purchaseId && releaseId) items.push({ releaseId, purchaseId, category, pubDate });
  }
  return items;
}

/**
 * "Tue, 13 Oct 2026 10:25:12" — no zone. Montevideo time (UTC-3 all year),
 * like the release dates below.
 */
export function arceFeedDate(raw: string): Date | null {
  const parsed = Date.parse(`${raw.replace(/^\w{3}, /, "")} GMT-0300`);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/** Feed items of the months covering [from, to]: the current month's feed, plus the previous one when the window reaches back into it. */
export async function fetchArceFeed(from: Date, to: Date, fetchImpl?: typeof fetch): Promise<ArceFeedItem[]> {
  const months: string[] = [];
  for (const date of [from, to]) {
    const key = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!months.includes(key)) months.push(key);
  }
  const items: ArceFeedItem[] = [];
  for (const month of months) {
    const xml = await (await get(`${ARCE_BASE}/ocds/rss/${month}`, fetchImpl)).text();
    items.push(...parseArceRss(xml));
  }
  return items.filter((item) => {
    const at = arceFeedDate(item.pubDate);
    return at !== null && at >= from && at <= to;
  });
}

export async function fetchArceRelease(releaseId: string, fetchImpl?: typeof fetch): Promise<ArceRelease | null> {
  const body = (await (await get(`${ARCE_BASE}/ocds/release/${encodeURIComponent(releaseId)}`, fetchImpl)).json()) as { releases?: ArceRelease[] };
  return body.releases?.[0] ?? null;
}

/** The new calls ("tender" releases) of the window, each read in full, one at a time. */
export async function fetchArceTenders(from: Date, to: Date, fetchImpl?: typeof fetch): Promise<{ listed: number; releases: ArceRelease[]; failed: string[] }> {
  const items = (await fetchArceFeed(from, to, fetchImpl)).filter((item) => item.category === "tender");
  const unique = [...new Map(items.map((item) => [item.releaseId, item])).values()];
  const releases: ArceRelease[] = [];
  const failed: string[] = [];
  for (const [index, item] of unique.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, RELEASE_PACE_MS));
    try {
      const release = await fetchArceRelease(item.releaseId, fetchImpl);
      if (release) releases.push(release);
    } catch {
      failed.push(item.releaseId);
    }
  }
  return { listed: unique.length, releases, failed };
}
