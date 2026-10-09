/**
 * The World Bank's procurement notices for the projects it finances — every
 * country, one open API, no key (user, 2026-10-09: 要不要做世界银行接口？我建议
 * 做成所有国家通用，先在玻利维亚试运行 OK). Read-only for now: the dry run
 * (scripts/dry-run-worldbank.ts) prints what would be kept and writes nothing.
 *
 *   GET https://search.worldbank.org/api/v2/procnotices
 *       ?format=json&project_ctry_name=Bolivia&srt=submission_date&order=desc
 *       &rows=100&os=<offset>&fl=<fields>
 *
 * `fl` names the fields to send, and the contact person's name, e-mail and
 * phone are never asked for: they are personal data. The notice text is
 * asked for, because the reference price and whether the call is open to
 * foreign bidders are written only there; it is read for those two things and
 * never stored (it names the contact person too).
 *
 * Why it matters: SICOES (Bolivia) and SOCE (Ecuador) cannot be read
 * automatically, but their externally financed calls — usually the largest,
 * and run under the lender's rules, which admit foreign bidders — are also
 * published here (ENDE's BO-ENDE-568419-CW-RFB, 2026-10-08, is both).
 */

export const WORLDBANK_API = "https://search.worldbank.org/api/v2/procnotices";

/** Everything the mapper reads. Not contact_name, contact_email, contact_phone_no, contact_address. */
const FIELDS = [
  "id",
  "notice_type",
  "notice_status",
  "notice_lang_name",
  "noticedate",
  "submission_date",
  "submission_deadline_date",
  "submission_deadline_time",
  "project_ctry_name",
  "project_id",
  "project_name",
  "bid_reference_no",
  "bid_description",
  "procurement_group",
  "procurement_method_code",
  "procurement_method_name",
  "contact_organization",
  "notice_text",
].join(",");

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; public-data ingestion)",
} as const;

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const TIMEOUT_MS = 60_000;
const RETRIES = 3;
const PAUSE_MS = 500;

export type WorldBankNotice = {
  id: string;
  notice_type?: string;
  notice_status?: string;
  notice_lang_name?: string;
  noticedate?: string;
  /** When the notice was published (despite the name), "2026-09-28T00:00:00Z". */
  submission_date?: string;
  /** The bid deadline's day, "2026-10-23T00:00:00Z" — the day only; the time is submission_deadline_time, local. */
  submission_deadline_date?: string;
  submission_deadline_time?: string;
  project_ctry_name?: string;
  project_id?: string;
  project_name?: string;
  bid_reference_no?: string;
  bid_description?: string;
  /** GO goods, CW works, NC non-consulting services, CS consulting services. */
  procurement_group?: string;
  procurement_method_code?: string;
  procurement_method_name?: string;
  contact_organization?: string;
  /** HTML. Read for the reference price and market approach only; never stored. */
  notice_text?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url: string): Promise<unknown> {
  const errors: string[] = [];
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (attempt < RETRIES - 1) await sleep(2_000 * (attempt + 1));
    }
  }
  throw new Error(`世界银行接口 ${RETRIES} 次都没读到：${errors.join("；")}`);
}

/**
 * One country's notices, newest first, back to `since` (by publication). The
 * API sorts by submission_date, the publication day, so paging stops at the
 * first notice older than that.
 */
export async function fetchWorldBankNotices(country: string, since: Date): Promise<{ notices: WorldBankNotice[]; truncated: boolean }> {
  const notices: WorldBankNotice[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      format: "json",
      project_ctry_name: country,
      srt: "submission_date",
      order: "desc",
      rows: String(PAGE_SIZE),
      os: String(page * PAGE_SIZE),
      fl: FIELDS,
    });
    const data = (await getJson(`${WORLDBANK_API}?${params}`)) as { procnotices?: Record<string, WorldBankNotice> | WorldBankNotice[] };
    const batch = Array.isArray(data.procnotices) ? data.procnotices : Object.values(data.procnotices ?? {});
    if (batch.length === 0) return { notices, truncated: false };
    for (const notice of batch) {
      const published = Date.parse(notice.submission_date ?? notice.noticedate ?? "");
      if (Number.isFinite(published) && published < since.getTime()) return { notices, truncated: false };
      // The country filter matches loosely; keep the country asked for only.
      if (notice.project_ctry_name === country) notices.push(notice);
    }
    if (batch.length < PAGE_SIZE) return { notices, truncated: false };
    await sleep(PAUSE_MS);
  }
  return { notices, truncated: true };
}
