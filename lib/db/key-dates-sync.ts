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
 */
export async function syncKeyDatesForTopLevelFields(
  supabase: SupabaseClient,
  tenderId: string,
  fields: { publicationDate?: string | null; submissionDeadline?: string | null; awardDate?: string | null },
): Promise<void> {
  const { error: deleteError } = await supabase.from("tender_key_dates").delete().eq("tender_id", tenderId).in("type", SYNCED_KEY_DATE_TYPES);
  if (deleteError) {
    console.error(`Failed to clear synced key dates for tender ${tenderId}: ${deleteError.message}`);
    return;
  }

  const rows = (
    [
      ["publication", fields.publicationDate],
      ["submission", fields.submissionDeadline],
      ["award", fields.awardDate],
    ] as const
  )
    .filter(([, date]) => !!date)
    .map(([type, date]) => ({ tender_id: tenderId, type, date }));

  if (rows.length === 0) return;
  const { error: insertError } = await supabase.from("tender_key_dates").insert(rows);
  if (insertError) console.error(`Failed to insert synced key dates for tender ${tenderId}: ${insertError.message}`);
}
