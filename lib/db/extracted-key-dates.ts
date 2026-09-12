import type { SupabaseClient } from "@supabase/supabase-js";
import { assertWritten } from "@/lib/db/assert-written";
import type { toTenderFields } from "@/lib/ingestion/extract-requirements";

/**
 * Writes the cronograma the model read out of the document, under the rule
 * the user set (2026-09-12): 应用到所有没有交标、中标日期的项目，有的交标、中标
 * 日期的话，以实际日期为准.
 *
 * So this FILLS, it never overwrites. A `submission_deadline` or `award_date`
 * already on the row came from the source feed — structured data an entity
 * published as a field, not a date a model read off a page — and it stays.
 * Only a tender that has none gets one from here, which is exactly the
 * population that needed this: every Peru OECE row, plus any Colombia row
 * datos.gov.co never supplied a `fecha_de_recepcion_de` for.
 *
 * A document that DISAGREES with a stored date is not silently dropped: an
 * addendum moving a deadline is a real and common event, and the admin is
 * the one who can tell that from a mis-read table, so it is surfaced as a
 * warning and left for them to apply in the key-dates editor.
 *
 * Every row is written with extracted_from_document (migration 0045) so the
 * next re-import cannot delete it — the source supplies none of these dates,
 * so the importer's "delete what the source didn't supply" refresh would
 * otherwise wipe the whole cronograma on the very next run.
 *
 * Returns the deadline it set, if it set one.
 */
export async function writeExtractedKeyDates(
  supabase: SupabaseClient,
  tenderId: string,
  keyDates: ReturnType<typeof toTenderFields>["keyDates"],
  stored: { submissionDeadline: string | null; awardDate: string | null },
  warnings: string[],
): Promise<string | undefined> {
  if (keyDates.length === 0) return undefined;

  // Day-string comparison: the stored columns can carry a time, the extracted
  // dates never do.
  const storedDeadlineDay = stored.submissionDeadline?.slice(0, 10) ?? null;
  const storedAwardDay = stored.awardDate?.slice(0, 10) ?? null;
  const extractedDeadline = keyDates.find((item) => item.type === "submission")?.date;
  const extractedAward = keyDates.find((item) => item.type === "award")?.date;

  if (extractedDeadline && storedDeadlineDay && storedDeadlineDay !== extractedDeadline) {
    warnings.push(
      `标书里的交标截止日（${extractedDeadline}）与数据源已有的日期（${storedDeadlineDay}）不一致——以数据源为准，没有覆盖。如果标书是更新后的补遗，请在「其他关键日期」里手动修改。`,
    );
  }
  if (extractedAward && storedAwardDay && storedAwardDay !== extractedAward) {
    warnings.push(`标书里的授标日（${extractedAward}）与数据源已有的日期（${storedAwardDay}）不一致——以数据源为准，没有覆盖。`);
  }

  // A type whose own column is already filled is dropped rather than written
  // alongside it: upsert-tenders mirrors those columns into this same table
  // (lib/db/key-dates-sync.ts does the same on the admin edit path), so
  // inserting a second row would put two 交标截止日 on one timeline — with
  // different dates, in exactly the disagreement case warned about above.
  const insertable = keyDates.filter(
    (item) => !(item.type === "submission" && storedDeadlineDay) && !(item.type === "award" && storedAwardDay),
  );

  // Replaces only what a PREVIOUS extraction wrote for this tender — never a
  // manually_added row (an admin's own entry outranks a re-read) and never a
  // source-supplied one (publication, PEMEX's validity_end).
  assertWritten(
    "清除旧的标书提取日期",
    await supabase.from("tender_key_dates").delete().eq("tender_id", tenderId).eq("extracted_from_document", true),
  );

  if (insertable.length > 0) {
    assertWritten(
      "标书提取的关键日期",
      await supabase.from("tender_key_dates").insert(
        insertable.map((item) => ({
          tender_id: tenderId,
          type: item.type,
          date: item.date,
          notes: item.notes,
          extracted_from_document: true,
        })),
      ),
    );
  }

  // award_date is deliberately NOT filled the way submission_deadline is.
  // The column renders as 中标日期 (lib/localize.ts) — a statement that this
  // tender WAS awarded on that day — while a cronograma's otorgamiento de la
  // buena pro is a planned date for a decision nobody has made yet. It stays
  // a timeline entry, which is a schedule, not a result.
  if (!extractedDeadline || storedDeadlineDay) return undefined;

  assertWritten(
    "交标截止日",
    await supabase.from("tenders").update({ submission_deadline: extractedDeadline }).eq("id", tenderId),
  );
  return extractedDeadline;
}
