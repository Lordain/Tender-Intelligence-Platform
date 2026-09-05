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
  skippedExcludedCount: number;
  /**
   * Count of rows skipped for relevance_tier/label/reason ONLY (per the
   * user's explicit request, 2026-09-04) — an admin manually classified
   * these via the edit form, so a re-ingest here still updates every other
   * field (title, dates, buyer, ...) normally, just not the classification.
   */
  protectedCount: number;
  /**
   * Count of rows skipped entirely (never written at all) because an admin
   * previously deleted this exact slug from the admin list — see
   * tender_manual_deletions / the DELETE handler in
   * app/api/admin/tenders/[slug]/route.ts. Per the user's explicit request
   * (2026-09-04): a manual delete should survive the same tender showing
   * up again in a later re-ingest from its original source.
   */
  skippedManuallyDeletedCount: number;
  failed: { slug: string; error: string }[];
};

type TenderRowFields = ReturnType<typeof buildRow>;

function buildRow(fields: Tender) {
  return {
    slug: fields.slug,
    tender_number: fields.tenderNumber,
    title: fields.title,
    summary: fields.summary,
    buyer: fields.buyer,
    country: fields.country,
    government_level: fields.governmentLevel,
    industries: fields.industries,
    scope_type: fields.scopeType,
    procedure_type: fields.procedureType,
    participation_scope: fields.participationScope ?? null,
    publication_date: fields.publicationDate,
    publication_date_is_estimated: fields.publicationDateIsEstimated ?? false,
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
    relevance_manually_overridden: false,
    source_name: fields.sourceName,
    source_url: fields.sourceUrl,
    updated_at: fields.updatedAt,
  };
}

/**
 * Same row as buildRow(), minus every relevance_* column — for a tender an
 * admin has manually classified (relevance_manually_overridden = true in
 * Supabase). Supabase's bulk `.upsert()` derives its ON CONFLICT DO UPDATE
 * SET clause from the JSON keys actually present in the request, uniform
 * across the whole array — so a row shape that never carries these keys at
 * all means Postgres leaves the existing relevance_tier/label/reason/
 * manually_overridden values on conflict completely untouched, not merely
 * unchanged-because-equal. (Omitting the keys on only SOME rows within one
 * mixed-shape array wouldn't give this guarantee — PostgREST would still
 * include those columns in the shared SET clause and could NULL them out
 * for the rows missing the key — which is why protected and unprotected
 * rows are upserted as two separate, internally-uniform calls below.)
 */
function buildRowWithoutRelevance(fields: Tender): Omit<TenderRowFields, "relevance_tier" | "relevance_label" | "relevance_reason" | "relevance_manually_overridden"> {
  const full = buildRow(fields);
  return Object.fromEntries(
    Object.entries(full).filter(([key]) => !["relevance_tier", "relevance_label", "relevance_reason", "relevance_manually_overridden"].includes(key)),
  ) as Omit<TenderRowFields, "relevance_tier" | "relevance_label" | "relevance_reason" | "relevance_manually_overridden">;
}

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
  // Per the user's explicit call (2026-09-04): an "excluded" (routine-
  // service) tender no longer gets written at all, replacing the earlier
  // "write it but hide it by default" design (see purge-excluded-
  // tenders.ts, which still exists for the one-off cleanup of rows
  // ingested before this change). A source re-ingested later will simply
  // never (re-)insert these rows going forward; recovering their metadata
  // for future stats means re-ingesting the original file, not querying
  // Supabase.
  const includable = tenders.filter((t) => t.relevance.tier !== "excluded");
  const excludedCount = tenders.length - includable.length;
  if (excludedCount > 0) {
    console.log(`Skipping ${excludedCount} tender(s) classified "excluded" (routine service) — not written to Supabase.`);
  }

  const failed: UpsertTendersResult["failed"] = [];
  let upsertedCount = 0;
  let protectedCount = 0;

  // A real bug this caught: a single `.upsert(rows, { onConflict: "slug" })`
  // call is one SQL statement, and Postgres rejects "ON CONFLICT DO UPDATE
  // command cannot affect row a second time" if two rows in that SAME
  // statement share the conflict key — which failed a WHOLE 500-row batch
  // at once on a real PEMEX run, not just the duplicates, because a source
  // export can genuinely repeat the same procedure (same slug) more than
  // once. De-duping by slug before chunking (last occurrence wins) keeps
  // every batch's conflict keys unique, which is what Postgres requires.
  const uniqueBySlug = [...new Map(includable.map((t) => [t.slug, t])).values()];

  // Tombstone check — an admin's earlier manual delete (DELETE
  // /api/admin/tenders/[slug]) should never get silently re-inserted by a
  // later re-ingest of the same source. Done as its own pre-pass (not
  // folded into the per-batch loop below) so a skip here also shrinks the
  // onProgress() denominator correctly, the same way the "excluded" filter
  // above does.
  const deletedSlugs = new Set<string>();
  for (const slugChunk of chunk(uniqueBySlug.map((t) => t.slug), BATCH_SIZE)) {
    const { data, error } = await supabase.from("tender_manual_deletions").select("slug").in("slug", slugChunk);
    // Same defensive posture as the relevance-override check below: a
    // failed lookup here (including the table not existing yet, before
    // this migration is applied) shouldn't block ingestion — it just means
    // this run conservatively falls back to "nothing was manually deleted."
    if (error) console.error(`  Failed to check tender_manual_deletions for this batch: ${error.message}`);
    for (const row of data ?? []) deletedSlugs.add(row.slug as string);
  }
  const liveTenders = uniqueBySlug.filter((t) => !deletedSlugs.has(t.slug));
  const skippedManuallyDeletedCount = uniqueBySlug.length - liveTenders.length;
  if (skippedManuallyDeletedCount > 0) {
    console.log(`Skipping ${skippedManuallyDeletedCount} tender(s) an admin previously deleted — not re-inserted.`);
  }

  for (const batch of chunk(liveTenders, BATCH_SIZE)) {
    const { data: protectedRows, error: protectedError } = await supabase
      .from("tenders")
      .select("slug")
      .in("slug", batch.map((t) => t.slug))
      .eq("relevance_manually_overridden", true);
    // A failed lookup here shouldn't block the whole batch from writing —
    // it just means this batch conservatively falls back to "nothing is
    // protected," same as before this feature existed. Real, unexpected
    // Supabase errors still surface via the upsert calls below.
    if (protectedError) console.error(`  Failed to check for manually-overridden tenders in this batch: ${protectedError.message}`);
    const protectedSlugs = new Set((protectedRows ?? []).map((r) => r.slug as string));

    const normalBatch = batch.filter((t) => !protectedSlugs.has(t.slug));
    const protectedBatch = batch.filter((t) => protectedSlugs.has(t.slug));
    protectedCount += protectedBatch.length;

    const upserted: { id: string; slug: string }[] = [];

    if (normalBatch.length > 0) {
      const { data, error } = await supabase
        .from("tenders")
        .upsert(normalBatch.map(buildRow), { onConflict: "slug" })
        .select("id, slug");
      if (error || !data) {
        for (const tender of normalBatch) failed.push({ slug: tender.slug, error: error?.message ?? "no rows returned" });
      } else {
        upserted.push(...(data as { id: string; slug: string }[]));
      }
    }

    if (protectedBatch.length > 0) {
      const { data, error } = await supabase
        .from("tenders")
        .upsert(protectedBatch.map(buildRowWithoutRelevance), { onConflict: "slug" })
        .select("id, slug");
      if (error || !data) {
        for (const tender of protectedBatch) failed.push({ slug: tender.slug, error: error?.message ?? "no rows returned" });
      } else {
        upserted.push(...(data as { id: string; slug: string }[]));
      }
    }

    const idBySlug = new Map<string, string>(upserted.map((row) => [row.slug, row.id]));

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
      else if (!failed.some((f) => f.slug === tender.slug)) failed.push({ slug: tender.slug, error: "not returned by upsert" });
    }

    onProgress?.(upsertedCount, liveTenders.length);
  }

  if (protectedCount > 0) {
    console.log(`Kept the existing relevance classification for ${protectedCount} tender(s) an admin has manually overridden — every other field still updated normally.`);
  }

  return { upsertedCount, skippedExcludedCount: excludedCount, protectedCount, skippedManuallyDeletedCount, failed };
}
