import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tender } from "@/types/tender";
import { assertWritten } from "@/lib/db/assert-written";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * Real yearly Datos Abiertos exports run tens of thousands of rows — one
 * Supabase round trip per row (the original per-script loop) would take
 * hours and burn through rate limits. Upserting BATCH_SIZE tenders per
 * request keeps a real bulk run to a handful of round trips per thousand
 * rows. 500 is comfortably under Supabase/PostgREST's default payload and
 * statement-timeout limits for a row this wide.
 */
const BATCH_SIZE = 500;

/**
 * Slugs per LOOKUP, much smaller than BATCH_SIZE.
 *
 * A PostgREST `.in()` filter travels in the GET query string, so 500 slugs
 * is a 12,000-23,000 character URL depending on how long the source's slugs
 * are. Supabase's gateway rejects a request line that size, and Node
 * surfaces that rejection as a bare `TypeError: fetch failed` with nothing
 * pointing at the URL — which is exactly what a large Mexico import hit
 * (2026-09-07), while a smaller one in the same session went through. 100
 * slugs keeps the worst case near 4 KB, well inside any gateway's limit,
 * at the cost of a few more small round trips.
 *
 * Only the read filters need this. The upserts below send their rows in the
 * request BODY, where BATCH_SIZE is about payload size, not URL length.
 */
const LOOKUP_CHUNK_SIZE = 100;

/**
 * One retry before giving up. These lookups now abort the whole import when
 * they fail (see below for why), so a single genuine blip should not cost a
 * full re-run — but a second failure is treated as real rather than retried
 * into a hang.
 */
async function withOneRetry<T>(run: () => PromiseLike<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return run();
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export type UpsertTendersResult = {
  upsertedCount: number;
  skippedExcludedCount: number;
  /**
   * Count of existing rows that carried at least one protected column, so
   * this import left part of them untouched. Two independent sources of
   * protection, both partial — the rest of the row still updates normally:
   *
   *   - manual_field_overrides (migration 0032): the columns an admin
   *     actually changed in the edit form. Added 2026-09-08 after a
   *     corrected 发布日期 (and its "estimated" flag) was silently reverted
   *     to the ingestion placeholder by the next import.
   *   - relevance_manually_overridden (2026-09-04): the relevance trio,
   *     when an admin ticked that checkbox.
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

/**
 * Re-derives every tender's tier and industry tags from the fields this row
 * is about to STORE, and makes those the values written — the same
 * computation, on the same inputs, that `npm run reclassify:tenders` will
 * perform the next time it runs.
 *
 * A mapper cannot disagree with reclassify while both call
 * classifyStoredTender(), but it can still feed it something other than what
 * it stores: ocds-mapper.ts really did classify on `tender.description` while
 * storing `tender.description ?? tender.title`, so a release with no
 * description was judged on less text at import than on re-read. This closes
 * that whole class of mistake mechanically, against real data, on every
 * import — rather than trusting thirteen mappers to keep two lists of fields
 * in sync by hand.
 *
 * It corrects rather than throws, and says so loudly. An import that aborts
 * because one row's tier drifted helps nobody; a row silently stored with a
 * tier the next reclassify would change is exactly the bug that turned 193
 * rows into 486 on 2026-09-08. Correcting means the stored tier is always the
 * stable one, and the log line names the mapper to fix.
 */
function enforceStoredFieldParity(tenders: Tender[]): void {
  const examples: string[] = [];
  let driftedCount = 0;

  for (const tender of tenders) {
    const fromStoredFields = classifyStoredTender({
      title: tender.title.es,
      summary: tender.summary.es,
      buyer: tender.buyer,
      country: tender.country,
      governmentLevel: tender.governmentLevel,
      scopeType: tender.scopeType,
      estimatedValue: tender.estimatedValue,
      currency: tender.currency,
      sourceName: tender.sourceName,
      structuredDurationDays: tender.structuredDurationDays,
    });

    const tierDrifted = fromStoredFields.relevance.tier !== tender.relevance.tier;
    const industriesDrifted =
      fromStoredFields.industries.length !== tender.industries.length ||
      [...fromStoredFields.industries].sort().join(",") !== [...tender.industries].sort().join(",");

    if (!tierDrifted && !industriesDrifted) continue;

    driftedCount++;
    if (examples.length < 10) {
      examples.push(
        `  ${tender.slug} (${tender.sourceName}): ` +
          (tierDrifted ? `tier ${tender.relevance.tier} → ${fromStoredFields.relevance.tier}` : "") +
          (tierDrifted && industriesDrifted ? ", " : "") +
          (industriesDrifted ? `industries [${tender.industries.join("|")}] → [${fromStoredFields.industries.join("|")}]` : ""),
      );
    }

    tender.relevance = fromStoredFields.relevance;
    tender.industries = fromStoredFields.industries;
  }

  if (driftedCount === 0) return;
  console.warn(
    `[upsert-tenders] ${driftedCount} tender(s) classified differently from what they store — the mapper passed classifyStoredTender() something other than the field it writes. Stored-field result used (that is what reclassify will compute); fix the mapper. First ${Math.min(driftedCount, 10)}:\n${examples.join("\n")}`,
  );
}

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
    // Not displayed anywhere — stored only so reclassify-tenders.ts can feed
    // the classifier the same duration this import did (migration 0029).
    structured_duration_days: fields.structuredDurationDays ?? null,
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
 * The row buildRow() produces, with every protected column's CURRENT stored
 * value put back over the source's value.
 *
 * The obvious implementation — omit the protected keys entirely — is wrong,
 * and shipped broken for one import (2026-09-08): `ON CONFLICT DO UPDATE`
 * makes Postgres build and validate the proposed INSERT tuple BEFORE it
 * detects the conflict, so a missing `publication_date` (NOT NULL, no
 * default) fails the whole statement with "null value in column
 * publication_date violates not-null constraint" — even though the row
 * exists and only the UPDATE branch would ever have run. The user hit this
 * on the first import after protecting a hand-corrected date.
 *
 * Writing the stored value back is equivalent for the UPDATE branch (the
 * column ends up unchanged either way) and keeps every row the same shape,
 * which also removes the need to group rows by omit-set: PostgREST derives
 * one shared ON CONFLICT SET clause per request from the keys present, so
 * uniform rows are exactly what it wants.
 */
function buildRowWithProtectedValues(fields: Tender, existing: ExistingRow | undefined): Record<string, unknown> {
  const row = buildRow(fields) as Record<string, unknown>;
  if (!existing) return row;

  // An ESTIMATED publication date never overwrites one already stored.
  //
  // Several sources publish no real publication-date field, so their mappers
  // fall back to the ingestion timestamp and mark it estimated (see e.g.
  // compras-mx-open-tenders-mapper.ts). Re-importing then moved the date to
  // "today" every single run, so a tender's 发布日期 crept forward daily and
  // 最新发布 sorting became meaningless — reported by the user 2026-09-10:
  // 发布日期每天都在变动.
  //
  // Keeping the stored value means the date settles on the day the tender
  // was FIRST seen, which is the closest honest answer a source without the
  // field allows, and it stops moving. A REAL date (is_estimated false) still
  // overwrites anything, estimate or not — that is genuine new information,
  // and it is how an estimate gets corrected once the source publishes one.
  if (row.publication_date_is_estimated === true && existing.stored.publication_date) {
    row.publication_date = existing.stored.publication_date;
    // `?? true` guards the NOT NULL column (migration 0011) against a stored
    // row that somehow has no flag: we do know THIS import's date is an
    // estimate, so calling it one is both safe and the honest reading.
    row.publication_date_is_estimated = existing.stored.publication_date_is_estimated ?? true;
  }

  if (existing.omit.size === 0) return row;
  for (const column of existing.omit) {
    // `slug` is the ON CONFLICT target and can never be protected; anything
    // the stored row doesn't actually have is left as the source built it.
    if (column === "slug" || !(column in existing.stored)) continue;
    row[column] = existing.stored[column];
  }
  return row;
}

type ExistingRow = {
  /** Columns this import must not touch; empty for a row nobody edited. */
  omit: Set<string>;
  stored: Record<string, unknown>;
};

const RELEVANCE_COLUMNS = ["relevance_tier", "relevance_label", "relevance_reason", "relevance_manually_overridden"] as const;

/**
 * Every column this import must leave alone for one existing tender:
 * whatever an admin hand-edited (manual_field_overrides, migration 0032)
 * plus the relevance trio when they ticked the separate manual-override
 * checkbox.
 *
 * The two mechanisms stay separate on purpose. relevance_manually_overridden
 * is a deliberate user-facing checkbox guarding a COMPUTED classification;
 * manual_field_overrides is filled in automatically by observing which
 * columns an edit actually changed, and guards TYPED-IN data. Collapsing
 * them would mean either making the checkbox lock typed data it was never
 * about, or making every typo fix silently freeze the classification.
 */
function omitSetFor(row: { manual_field_overrides?: string[] | null; relevance_manually_overridden?: boolean | null }): Set<string> {
  const omit = new Set<string>(row.manual_field_overrides ?? []);
  if (row.relevance_manually_overridden === true) for (const column of RELEVANCE_COLUMNS) omit.add(column);
  return omit;
}

/**
 * The tender_key_dates types that must be left alone for a tender, derived
 * from the locked columns they mirror (lib/db/key-dates-sync.ts writes the
 * same three). If an admin corrected `publication_date`, re-inserting the
 * source's own "publication" key date would put the wrong day back on the
 * public timeline even though the column itself is protected.
 */
function lockedKeyDateTypes(fields: Tender, existing: ExistingRow | undefined): Set<string> {
  const types = new Set<string>();
  if (!existing) return types;
  // Mirror of the estimated-date rule in buildRowWithProtectedValues: when
  // the stored publication_date is kept, the source's own "publication" key
  // date must not be written either, or the timeline would show the drifting
  // date the column no longer has.
  if (fields.publicationDateIsEstimated === true && existing.stored.publication_date) types.add("publication");
  const omit = existing.omit;
  if (omit.has("publication_date")) types.add("publication");
  if (omit.has("submission_deadline")) types.add("submission");
  if (omit.has("award_date")) types.add("award");
  return types;
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
  enforceStoredFieldParity(tenders);

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
  for (const slugChunk of chunk(uniqueBySlug.map((t) => t.slug), LOOKUP_CHUNK_SIZE)) {
    const { data, error } = await withOneRetry(() =>
      supabase.from("tender_manual_deletions").select("slug").in("slug", slugChunk),
    );
    // Fails the import rather than continuing (2026-09-07). This used to
    // log and fall through to "nothing was manually deleted", which meant a
    // transient network error silently RE-INSERTED every tender the admin
    // had deleted — seen for real on an import where both this lookup and
    // the override lookup below returned `TypeError: fetch failed`, and the
    // tender count went from ~150 back to ~800. An import that stops is a
    // retry; an import that quietly undoes the admin's decisions is not
    // visible at all until someone counts the rows.
    //
    // The one tolerated case is the table not existing yet (PostgREST
    // 42P01), which is what the old fallback was really written for.
    if (error && error.code !== "42P01") {
      throw new Error(`无法读取 tender_manual_deletions，已中止导入以免重新插入已删除的项目：${error.message}`);
    }
    if (error) console.error(`  tender_manual_deletions 表不存在，本次按「没有手动删除」处理。`);
    for (const row of data ?? []) deletedSlugs.add(row.slug as string);
  }
  const liveTenders = uniqueBySlug.filter((t) => !deletedSlugs.has(t.slug));
  const skippedManuallyDeletedCount = uniqueBySlug.length - liveTenders.length;
  if (skippedManuallyDeletedCount > 0) {
    console.log(`Skipping ${skippedManuallyDeletedCount} tender(s) an admin previously deleted — not re-inserted.`);
  }

  for (const batch of chunk(liveTenders, BATCH_SIZE)) {
    // Chunked separately from the upsert batch, for the URL-length reason
    // explained at LOOKUP_CHUNK_SIZE.
    // Every EXISTING row in this batch, keyed by slug — not just the
    // protected ones. buildRowWithProtectedValues() needs the stored row for
    // the estimated-publication-date rule too, which applies to rows nobody
    // has ever edited.
    const protectionBySlug = new Map<string, ExistingRow>();
    let protectedError: { message: string } | null = null;
    for (const slugChunk of chunk(batch.map((t) => t.slug), LOOKUP_CHUNK_SIZE)) {
      // `*` rather than a column list: buildRowWithProtectedValues needs the
      // stored value of whatever column an admin happened to lock, and a
      // hand-maintained list here would silently stop protecting any column
      // added to the table later. Only rows that turn out to BE protected
      // are kept, so the extra width costs nothing beyond this read.
      const { data: rows, error } = await withOneRetry(() =>
        supabase.from("tenders").select("*").in("slug", slugChunk),
      );
      if (error) {
        protectedError = error;
        break;
      }
      for (const row of (rows ?? []) as Record<string, unknown>[]) {
        const omit = omitSetFor(row as { manual_field_overrides?: string[] | null; relevance_manually_overridden?: boolean | null });
        protectionBySlug.set(row.slug as string, { omit, stored: row });
      }
    }
    // Fails the batch rather than continuing (2026-09-07, widened 2026-09-08).
    // Falling back to "nothing is protected" is not conservative: every
    // tender in the batch then goes through the full buildRow(), which
    // rewrites relevance_manually_overridden: false along with a freshly
    // computed tier AND overwrites every hand-corrected field. So a failed
    // lookup does not merely skip the protection — it ERASES it, flag and
    // all, leaving nothing in the row to show a human had ever touched it
    // and no way to find the affected tenders afterwards. Unrecoverable,
    // unlike a re-inserted deletion.
    if (protectedError) {
      throw new Error(`无法读取人工编辑保护标记，已中止导入以免覆盖人工修改：${protectedError.message}`);
    }
    protectedCount += batch.filter((t) => (protectionBySlug.get(t.slug)?.omit.size ?? 0) > 0).length;

    const upserted: { id: string; slug: string }[] = [];

    {
      const { data, error } = await supabase
        .from("tenders")
        .upsert(batch.map((t) => buildRowWithProtectedValues(t, protectionBySlug.get(t.slug))), { onConflict: "slug" })
        .select("id, slug");
      if (error || !data) {
        for (const tender of batch) failed.push({ slug: tender.slug, error: error?.message ?? "no rows returned" });
      } else {
        upserted.push(...(data as { id: string; slug: string }[]));
      }
    }

    const idBySlug = new Map<string, string>(upserted.map((row) => [row.slug, row.id]));

    // Key dates are refreshed by delete-then-insert, which is why both
    // halves below are careful about what a human put there (2026-09-08):
    //
    //   - manually_added rows (the 其他关键日期 editor — 现场踏勘, 提问截止,
    //     澄清会议...) are never deleted. No source supplies them, so a
    //     blanket delete simply destroyed them on every re-import.
    //   - extracted_from_document rows (migration 0045) are never deleted
    //     either, for the same reason and more sharply: they are the whole
    //     cronograma read out of the bases PDF, and for Peru they are the
    //     only dates that exist at all. Deleting "what the source did not
    //     supply" would wipe every one of them on the next run, since the
    //     source supplies none of them.
    //   - the three types mirrored from the tender's own columns
    //     (publication / submission / award) are skipped entirely for a
    //     tender whose backing column is locked by manual_field_overrides,
    //     so the timeline cannot drift away from the corrected column.
    const keyDateRows = batch.flatMap((tender) => {
      const tenderId = idBySlug.get(tender.slug);
      if (!tenderId) return [];
      const lockedTypes = lockedKeyDateTypes(tender, protectionBySlug.get(tender.slug));
      return tender.keyDates
        .filter((d) => !lockedTypes.has(d.type))
        // `notes` and `mandatory` were dropped here — both columns have
        // existed since 0001_init and the timeline renders both, but the
        // insert only ever carried type and date. The visible cost
        // (2026-09-11, reported from a real CFE notice): Mexican procedures
        // open the technical and the economic envelope at two separate
        // sessions days apart, dof-search-mapper.ts labels each one
        // 技术标开标/商务标开标 precisely so they can be told apart, and the
        // timeline showed two identical 开标 rows on different dates because
        // the labels never reached the database.
        .map((d) => ({
          tender_id: tenderId,
          type: d.type,
          date: d.date,
          notes: d.notes ?? null,
          mandatory: d.mandatory ?? null,
        }));
    });

    // Grouped by locked-type signature so each delete can exclude exactly
    // the types it must not touch; almost always one group with none.
    const deleteGroups = new Map<string, { types: string[]; ids: string[] }>();
    for (const tender of batch) {
      const tenderId = idBySlug.get(tender.slug);
      if (!tenderId) continue;
      const types = [...lockedKeyDateTypes(tender, protectionBySlug.get(tender.slug))].sort();
      const signature = types.join(",");
      const group = deleteGroups.get(signature);
      if (group) group.ids.push(tenderId);
      else deleteGroups.set(signature, { types, ids: [tenderId] });
    }

    for (const { types, ids } of deleteGroups.values()) {
      let query = supabase
        .from("tender_key_dates")
        .delete()
        .in("tender_id", ids)
        .eq("manually_added", false)
        .eq("extracted_from_document", false);
      if (types.length > 0) query = query.not("type", "in", `(${types.join(",")})`);
      assertWritten("旧关键日期清除", await query);
    }
    if (keyDateRows.length > 0) {
      assertWritten("关键日期", await supabase.from("tender_key_dates").insert(keyDateRows));
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
