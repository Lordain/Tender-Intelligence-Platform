/**
 * "Which rule kept this?" over the tenders actually stored in Supabase —
 * the same diagnostic as `npm run explain:kept`, without the CSV.
 *
 * The CLI answers the question from a reclassify export, which means the
 * answer is only as fresh as the last `npm run reclassify:tenders`, and only
 * reachable from a terminal. Everything stored in `tenders` IS the kept set
 * (an "excluded" row is never written — see upsert-tenders.ts), so the same
 * bucketing can run straight off the database and back the 保留原因分析 panel
 * in /admin/import-tenders. Read-only: this never writes anything.
 *
 * The bucketing logic is deliberately identical to scripts/explain-kept.ts,
 * including the manually-protected carve-out — a hand-set tier is not the
 * rules' doing, and reporting it under whichever rule would have fired
 * misattributes it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { explainKeptSignal, NATIONAL_PRIORITY_SOURCE_NAME } from "@/lib/relevance";
import type { LocalizedText, Tender, TenderRelevanceTier, TenderScopeType } from "@/types/tender";

export const MANUALLY_PROTECTED_BUCKET = "管理员手动设置（分类规则未参与）";

export type ExplainKeptExample = {
  slug: string;
  title: string;
  country: string;
  estimatedValue?: number;
  currency?: string;
};

export type ExplainKeptBucket = {
  signal: string;
  count: number;
  byCountry: { country: string; count: number }[];
  examples: ExplainKeptExample[];
};

export type ExplainKeptResult = {
  /** Rows considered after the country filter. */
  totalCount: number;
  /** Rows in the whole table, before the country filter — so the panel can say "2140 条里的 654 条". */
  grandTotalCount: number;
  countryCounts: { country: string; count: number }[];
  buckets: ExplainKeptBucket[];
  country?: string;
  tierCounts: Record<TenderRelevanceTier, number>;
};

type Row = {
  slug: string;
  title: LocalizedText;
  summary: LocalizedText | null;
  buyer: string;
  country: string;
  government_level: Tender["governmentLevel"];
  industries: string[] | null;
  scope_type: TenderScopeType;
  estimated_value: number | null;
  currency: string | null;
  relevance_tier: TenderRelevanceTier | null;
  relevance_manually_overridden: boolean | null;
  source_name: string;
};

const SELECT =
  "slug, title, summary, buyer, country, government_level, industries, scope_type, estimated_value, currency, relevance_tier, relevance_manually_overridden, source_name";

/** PostgREST caps an unranged select at 1000 rows; page so nothing past the first page is silently dropped (the same trap reclassify-tenders.ts documents). */
const PAGE_SIZE = 1000;

const DEFAULT_EXAMPLES = 5;

export async function explainKeptFromDb(
  supabase: SupabaseClient,
  options: { country?: string; examples?: number; signal?: string } = {},
): Promise<ExplainKeptResult> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tenders")
      .select(SELECT)
      .order("publication_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch tenders: ${error.message}`);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const country = options.country?.trim() || undefined;
  const considered = country ? rows.filter((row) => row.country === country) : rows;
  const examplesPerBucket = options.examples ?? DEFAULT_EXAMPLES;
  // A named signal means the admin opened one bucket to read it in full, so
  // that bucket keeps every title instead of the first few.
  const expandSignal = options.signal?.trim() || undefined;

  const buckets = new Map<string, ExplainKeptBucket>();
  const tierCounts: Record<TenderRelevanceTier, number> = { flagship: 0, significant: 0, standard: 0, excluded: 0 };

  for (const row of considered) {
    if (row.relevance_tier) tierCounts[row.relevance_tier] += 1;

    const signal = row.relevance_manually_overridden
      ? MANUALLY_PROTECTED_BUCKET
      : explainKeptSignal({
          title: row.title?.es || row.title?.zh || "",
          summary: row.summary?.es || undefined,
          buyer: row.buyer,
          country: row.country,
          governmentLevel: row.government_level,
          scopeType: row.scope_type,
          industries: row.industries ?? [],
          estimatedValue: row.estimated_value ?? undefined,
          currency: row.currency ?? undefined,
          isNationalPriorityProject: row.source_name === NATIONAL_PRIORITY_SOURCE_NAME,
        });

    const bucket = buckets.get(signal) ?? { signal, count: 0, byCountry: [], examples: [] };
    bucket.count += 1;
    const entry = bucket.byCountry.find((item) => item.country === row.country);
    if (entry) entry.count += 1;
    else bucket.byCountry.push({ country: row.country, count: 1 });
    if (expandSignal === signal || bucket.examples.length < examplesPerBucket) {
      bucket.examples.push({
        slug: row.slug,
        title: (row.title?.es || row.title?.zh || "").slice(0, 160),
        country: row.country,
        estimatedValue: row.estimated_value ?? undefined,
        currency: row.currency ?? undefined,
      });
    }
    buckets.set(signal, bucket);
  }

  const countryCounts = [...considered.reduce((map, row) => map.set(row.country, (map.get(row.country) ?? 0) + 1), new Map<string, number>())]
    .map(([name, count]) => ({ country: name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalCount: considered.length,
    grandTotalCount: rows.length,
    countryCounts,
    tierCounts,
    country,
    buckets: [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .map((bucket) => ({ ...bucket, byCountry: bucket.byCountry.sort((a, b) => b.count - a.count) })),
  };
}
