/**
 * World Bank procurement notices for every platform country, for the daily
 * job (scripts/cron-worldbank.ts). User, 2026-10-09: 每天自动读取 9 国加玻利维亚
 * 的世界银行招标，经过比对后 OK.
 *
 * Per country:
 *   - the calls published in the window (worldbank-mapper.ts decides which
 *     notices are calls), mapped and classified by the general rules;
 *   - each compared (cross-source-match.ts) with the country's stored rows
 *     from other sources: a call already there by its World Bank reference,
 *     or by deadline and title, is not written — the country's own record
 *     has the documents; a weak match is held back for an admin to look at
 *     (the 世界银行 tab), never written by the job;
 *   - the rest written through upsertTendersBatched(), every filter included.
 *
 * Guyana is staged (lib/staged-countries.ts), so its rows stay in the admin
 * pages; the other countries' rows, Bolivia's since 2026-10-10, are public
 * like any import's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { fetchWorldBankNotices, type WorldBankNotice } from "@/lib/ingestion/connectors/worldbank-procnotices-live";
import { WORLDBANK_COUNTRIES, WORLDBANK_SOURCE_NAME, mapWorldBankNotice, worldBankSkipReason } from "@/lib/ingestion/worldbank-mapper";
import { lenderReference } from "@/lib/ingestion/lender-reference";
import { findCrossSourceMatch, type CrossSourceMatch, type MatchCandidate } from "@/lib/ingestion/cross-source-match";
import { upsertTendersBatched } from "@/lib/ingestion/upsert-tenders";

export { WORLDBANK_SOURCE_NAME };

const PAGE = 1000;

export type WorldBankRow = {
  notice: WorldBankNotice;
  tender: Tender;
  match?: CrossSourceMatch;
  /** What the run does with it. */
  outcome: "write" | "duplicate" | "review" | "excluded" | "closed";
};

export type WorldBankCountryResult = {
  country: string;
  notices: number;
  calls: number;
  truncated: boolean;
  rows: WorldBankRow[];
};

export type WorldBankIngestResult = {
  countries: WorldBankCountryResult[];
  write: boolean;
  upsertedCount?: number;
  failed?: { slug: string; error: string }[];
};

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "es" in value) return String((value as { es: unknown }).es ?? "");
  return "";
}

/** The country's stored rows from every OTHER source, published or closing since `from`. */
export async function storedCandidates(supabase: SupabaseClient, country: string, from: string): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("tenders")
      .select("slug,tender_number,title,summary,buyer,submission_deadline,source_name")
      .eq("country", country)
      .neq("source_name", WORLDBANK_SOURCE_NAME)
      .or(`publication_date.gte.${from},submission_deadline.gte.${from}`)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`读取${country}已入库项目失败：${error.message}`);
    for (const row of data ?? []) {
      candidates.push({
        slug: row.slug,
        tenderNumber: row.tender_number,
        title: textOf(row.title),
        summary: textOf(row.summary),
        buyer: row.buyer ?? "",
        submissionDeadline: row.submission_deadline,
        sourceName: row.source_name,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return candidates;
}

/** One country's calls, each with its match and what a run does with it. Reads only. */
export async function worldBankCountryRows(
  supabase: SupabaseClient | null,
  country: string,
  options: { days: number; now: Date },
): Promise<WorldBankCountryResult> {
  const since = new Date(options.now.getTime() - options.days * 86_400_000);
  const { notices, truncated } = await fetchWorldBankNotices(country, since);
  const calls = notices.filter((notice) => !worldBankSkipReason(notice));
  // Stored rows a month either side of the window: a call published here
  // may have reached the national system weeks earlier.
  const candidates = supabase && calls.length > 0 ? await storedCandidates(supabase, country, new Date(since.getTime() - 30 * 86_400_000).toISOString()) : [];

  const rows: WorldBankRow[] = calls.map((notice) => {
    const tender = mapWorldBankNotice(notice, options.now);
    const match = findCrossSourceMatch(
      { reference: lenderReference(notice.bid_reference_no), title: tender.title.es, buyer: tender.buyer, submissionDeadline: tender.submissionDeadline },
      candidates,
    );
    const outcome: WorldBankRow["outcome"] =
      tender.status !== "open"
        ? "closed"
        : match && match.kind !== "weak"
          ? "duplicate"
          : tender.relevance.tier === "excluded"
            ? "excluded"
            : match
              ? "review"
              : "write";
    return { notice, tender, ...(match ? { match } : {}), outcome };
  });
  return { country, notices: notices.length, calls: calls.length, truncated, rows };
}

export async function ingestWorldBank(
  supabase: SupabaseClient | null,
  options: { write: boolean; days: number; now?: Date; countries?: string[]; log?: (line: string) => void },
): Promise<WorldBankIngestResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const countries: WorldBankCountryResult[] = [];
  for (const country of options.countries ?? Object.keys(WORLDBANK_COUNTRIES)) {
    const result = await worldBankCountryRows(supabase, country, { days: options.days, now });
    countries.push(result);
    log(`  ${country}：公告 ${result.notices} 条，招标 ${result.calls} 条${result.truncated ? "（翻页上限）" : ""}`);
  }
  if (!options.write) return { countries, write: false };
  if (!supabase) throw new Error("Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const toWrite = countries.flatMap((country) => country.rows.filter((row) => row.outcome === "write").map((row) => row.tender));
  const result = await upsertTendersBatched(supabase, toWrite);
  return { countries, write: true, upsertedCount: result.upsertedCount, failed: result.failed };
}
