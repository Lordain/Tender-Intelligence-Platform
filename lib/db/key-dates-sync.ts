import type { SupabaseClient } from "@supabase/supabase-js";

const SYNCED_KEY_DATE_TYPES = ["publication", "submission", "award"] as const;

/**
 * Keeps a tender's `tender_key_dates` rows for the three types that also
 * have their own top-level column (`publication_date`/`submission_deadline`/
 * `award_date`) in sync with whatever was just saved on those columns.
 *
 * Real gap found 2026-09-05: `AdminTenderForm.tsx`'s date inputs write
 * ONLY the top-level column via the admin tender create/update routes —
 * the separate `tender_key_dates` table (rendered on both the admin's own
 * `KeyDatesEditor` and the public detail page's 关键日期 timeline) was
 * never touched by those routes at all, so the two displays of what's
 * supposed to be the same date could silently disagree. A user found this
 * for real: after a Colombia tender's `submission_deadline` picked up a
 * real deadline, the overview card (计划交标) updated but the 关键日期
 * timeline below it still showed only the old `publication` entry — the
 * ingestion path (`upsertTendersBatched`) already keeps these in sync via
 * its own delete-then-insert of the whole `keyDates` array, but the admin
 * edit routes had no equivalent at all.
 *
 * Every other key-date type (clarification/site_visit/questions_deadline/
 * opening/contract_signing) has no top-level column counterpart and is
 * left untouched here — those stay purely admin/ingestion-managed via
 * `KeyDatesEditor`'s own dedicated CRUD.
 *
 * Of the three it does own, it only clears a row when it has a real value to
 * put back in its place. The delete used to be unconditional, which was
 * harmless while every row of these types was a mirror of a column — but a
 * cronograma read out of the bases PDF (migration 0045) can carry an
 * `award` date with no `award_date` column behind it, and saving an
 * unrelated field on the admin form would then have silently deleted the
 * planned 授标日 with nothing to restore it from. Where a column DOES have a
 * value it still wins outright, extracted or hand-entered alike: that is the
 * rule the user set (2026-09-12) — 有的交标、中标日期的话，以实际日期为准.
 */
export async function syncKeyDatesForTopLevelFields(
  supabase: SupabaseClient,
  tenderId: string,
  fields: { publicationDate?: string | null; submissionDeadline?: string | null; awardDate?: string | null },
): Promise<void> {
  const incoming = (
    [
      ["publication", fields.publicationDate],
      ["submission", fields.submissionDeadline],
      ["award", fields.awardDate],
    ] as const
  ).filter(([, date]) => !!date);

  // Old mirrors of all three types go; a row someone or something else put
  // there survives unless a real column value is replacing it.
  const { error: deleteError } = await supabase
    .from("tender_key_dates")
    .delete()
    .eq("tender_id", tenderId)
    .in("type", SYNCED_KEY_DATE_TYPES)
    .eq("manually_added", false)
    .eq("extracted_from_document", false);
  if (deleteError) {
    console.error(`Failed to clear synced key dates for tender ${tenderId}: ${deleteError.message}`);
    return;
  }

  if (incoming.length > 0) {
    const { error: supersedeError } = await supabase
      .from("tender_key_dates")
      .delete()
      .eq("tender_id", tenderId)
      .in("type", incoming.map(([type]) => type));
    if (supersedeError) {
      console.error(`Failed to clear superseded key dates for tender ${tenderId}: ${supersedeError.message}`);
      return;
    }
  }

  const rows = incoming.map(([type, date]) => ({ tender_id: tenderId, type, date }));

  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from("tender_key_dates").insert(rows);
  if (insertError) console.error(`Failed to insert synced key dates for tender ${tenderId}: ${insertError.message}`);
}
