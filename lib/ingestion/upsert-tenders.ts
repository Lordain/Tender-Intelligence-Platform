import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";

/**
 * Real yearly Datos Abiertos exports run tens of thousands of rows — one
 * Supabase round trip per row (the original per-script loop) would take
 * hours and burn through rate limits. Upserting BATCH_SIZE tenders per
 * request keeps a real bulk run to a handful of round trips per thousand
 * rows. 500 is comfortably under Supabase/PostgREST's default payload and
 * statement-timeout limits for a row this wide.
 */
const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type UpsertTendersResult = {
  upsertedCount: number;
  failed: { slug: string; error: string }[];
};

/**
 * Batched upsert-by-slug for tenders plus their key dates, shared by the
 * bulk-file ingestion scripts (Compras MX contracts, CompraNet 5.0). A
 * failed batch doesn't abort the run — its slugs are recorded in `failed`
 * and ingestion continues with the next batch, so one malformed chunk out
 * of a large file doesn't lose everything else in it.
 */
export async function upsertTendersBatched(
  supabase: SupabaseClient,
  tenders: Tender[],
  onProgress?: (upsertedSoFar: number, total: number) => void,
): Promise<UpsertTendersResult> {
  const failed: UpsertTendersResult["failed"] = [];
  let upsertedCount = 0;

  for (const batch of chunk(tenders, BATCH_SIZE)) {
    const rows = batch.map((fields) => {
      return {
        slug: fields.slug,
        tender_number: fields.tenderNumber,
        title: fields.title,
        summary: fields.summary,
        buyer: fields.buyer,
        country: fields.country,
        government_level: fields.governmentLevel,
        industry: fields.industry,
        scope_type: fields.scopeType,
        procedure_type: fields.procedureType,
        participation_scope: fields.participationScope ?? null,
        publication_date: fields.publicationDate,
        submission_deadline: fields.submissionDeadline ?? null,
        award_date: fields.awardDate ?? null,
        awarded_to: fields.awardedTo ?? null,
        estimated_value: fields.estimatedValue ?? null,
        currency: fields.currency ?? null,
        location: fields.location ?? null,
        status: fields.status,
        relevance_tier: fields.relevance.tier,
        relevance_label: fields.relevance.label,
        relevance_reason: fields.relevance.reason,
        source_name: fields.sourceName,
        source_url: fields.sourceUrl,
        updated_at: fields.updatedAt,
      };
    });

    const { data: upserted, error } = await supabase
      .from("tenders")
      .upsert(rows, { onConflict: "slug" })
      .select("id, slug");

    if (error || !upserted) {
      for (const tender of batch) {
        failed.push({ slug: tender.slug, error: error?.message ?? "no rows returned" });
      }
      onProgress?.(upsertedCount, tenders.length);
      continue;
    }

    const idBySlug = new Map<string, string>(upserted.map((row) => [row.slug as string, row.id as string]));

    const tenderIds = [...idBySlug.values()];
    if (tenderIds.length > 0) {
      await supabase.from("tender_key_dates").delete().in("tender_id", tenderIds);
    }

    const keyDateRows = batch.flatMap((tender) => {
      const tenderId = idBySlug.get(tender.slug);
      if (!tenderId) return [];
      return tender.keyDates.map((d) => ({ tender_id: tenderId, type: d.type, date: d.date }));
    });
    if (keyDateRows.length > 0) {
      await supabase.from("tender_key_dates").insert(keyDateRows);
    }

    for (const tender of batch) {
      if (idBySlug.has(tender.slug)) upsertedCount += 1;
      else failed.push({ slug: tender.slug, error: "not returned by upsert" });
    }

    onProgress?.(upsertedCount, tenders.length);
  }

  return { upsertedCount, failed };
}
