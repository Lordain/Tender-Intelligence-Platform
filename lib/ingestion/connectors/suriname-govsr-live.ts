/**
 * Suriname's tender notices on the government site gov.sr, category
 * 「Aanbestedingen」 (user, 2026-10-16: 苏里南做，先只在后台可见).
 *
 * ── Why this page ────────────────────────────────────────────────────────
 *
 * Suriname has no central e-procurement system. Ministries post small
 * purchases (a used car, a drinking-water fitting) in Dutch on their own
 * 「Bekendmakingen」 pages; the calls worth reading — the Ministry of Finance
 * and Planning's priority social projects financed by the February 2026
 * Social Bond, and IDB or EU-financed ones — are posted in English in this
 * one category: 15 posts from 3 June to 24 September 2026, about three a
 * month. No post states an amount.
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 * gov.sr is WordPress, and its public REST API lists a category's posts:
 *
 *   GET /wp-json/wp/v2/posts?categories=5829&per_page=50&_fields=…
 *
 * 5829 is 「Aanbestedingen」 (GET /wp-json/wp/v2/categories?slug=aanbestedingen,
 * 2026-10-16). robots.txt asks for 60 seconds between requests, so a run makes
 * exactly one: the 50 newest posts reach back months at this pace.
 */

export const SURINAME_GOVSR_ORIGIN = "https://gov.sr";
export const SURINAME_TENDERS_PAGE = `${SURINAME_GOVSR_ORIGIN}/aanbestedingen/`;
/** The 「Aanbestedingen」 category's id on gov.sr. */
export const SURINAME_TENDER_CATEGORY = 5829;
const API_URL = `${SURINAME_GOVSR_ORIGIN}/wp-json/wp/v2/posts`;

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;
const PER_PAGE = 50;

/** One post as the API returns it, the fields asked for only. */
export type SurinamePost = {
  id: number;
  /** Paramaribo wall-clock time, no offset: "2026-09-24T08:24:40". */
  date: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
};

export async function fetchSurinamePosts(): Promise<SurinamePost[]> {
  const params = new URLSearchParams({
    categories: String(SURINAME_TENDER_CATEGORY),
    per_page: String(PER_PAGE),
    orderby: "date",
    order: "desc",
    _fields: "id,date,link,title,content",
  });
  const response = await fetch(`${API_URL}?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`gov.sr 招标栏目读取失败：HTTP ${response.status}`);
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("gov.sr 招标栏目返回的不是文章列表");
  return data as SurinamePost[];
}
