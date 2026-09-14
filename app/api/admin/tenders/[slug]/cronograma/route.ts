import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { findKeyDateProblems } from "@/lib/ingestion/key-date-checks";
import { CRONOGRAMA_SOURCE_REFERENCE, diffAgainstExisting, parseSeaceCronograma } from "@/lib/ingestion/seace-cronograma";
import { syncKeyDatesForTopLevelFields } from "@/lib/db/key-dates-sync";

/**
 * Turns a SEACE ficha Cronograma table, pasted by an admin, into this
 * tender's key dates.
 *
 * Why a paste and not a connector: see seace-cronograma.ts's header — the
 * ficha URL is keyed by a UUID that exists nowhere in the OCDS record, so
 * there is no way to reach the page from the data, and finding it means
 * driving SEACE's own search, which this project does not automate. The
 * admin already has the page open.
 *
 * `preview: true` parses and returns without writing, so the admin sees
 * exactly which rows would be stored, which were skipped and why, and any
 * self-consistency complaint — BEFORE anything touches the tender. A bid
 * deadline is the one field on this platform that a customer acts on, so
 * it does not get written from a paste nobody looked at.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as { pasted?: string; preview?: boolean };
  const pasted = body.pasted?.trim();
  if (!pasted) return NextResponse.json({ error: "pasted 内容为空" }, { status: 400 });

  const parsed = parseSeaceCronograma(pasted);

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .select("id, submission_deadline, award_date, publication_date")
    .eq("slug", slug)
    .maybeSingle();
  if (tenderError) return NextResponse.json({ error: tenderError.message }, { status: 500 });
  if (!tender) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The same checker every other key-date write goes through. A ficha table
  // is authoritative published data, so a complaint here is far likelier to
  // mean the paste picked up the wrong rows than that SEACE is wrong — which
  // is exactly why it is shown rather than acted on.
  const problems = findKeyDateProblems(
    parsed.rows.map((row) => ({ type: row.type, date: row.date })),
    { publicationDate: (tender.publication_date as string | null) ?? null },
  );

  const storedDeadline = (tender.submission_deadline as string | null)?.slice(0, 10) ?? null;
  const extractedDeadline = parsed.rows.find((row) => row.type === "submission")?.date;

  // What this tender already has, minus whatever a previous paste wrote (those
  // rows are deleted and rebuilt below, so counting them would make a re-paste
  // report itself as a duplicate of itself).
  const { data: existingRaw, error: existingError } = await supabase
    .from("tender_key_dates")
    .select("type, date, source_reference, extracted_from_document")
    .eq("tender_id", tender.id);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const existing = (existingRaw ?? [])
    .filter((row) => row.source_reference !== CRONOGRAMA_SOURCE_REFERENCE)
    .map((row) => ({
      type: row.type as string,
      date: (row.date as string) ?? "",
      sourceReference: row.source_reference as string | null,
      extractedFromDocument: Boolean(row.extracted_from_document),
    }));

  // `submission` is handled by the deadline column and its sync, not as a row
  // here, so it is not part of the row-level diff.
  const diff = diffAgainstExisting(
    parsed.rows.filter((row) => row.type !== "submission"),
    existing,
  );

  const duplicates = diff.duplicates.map((entry) => ({
    label: entry.row.label,
    date: entry.row.date,
    type: entry.row.type,
    existingSource: entry.existingSource,
  }));
  const conflicts = diff.conflicts.map((entry) => ({
    label: entry.row.label,
    type: entry.row.type,
    fichaDate: entry.row.date,
    storedDate: entry.storedDate,
    existingSource: entry.existingSource,
  }));

  if (body.preview) {
    return NextResponse.json({
      ...parsed,
      problems: problems.map((p) => p.message),
      storedDeadline,
      extractedDeadline,
      duplicates,
      conflicts,
      willInsert: diff.toInsert.length,
    });
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: "没有解析出任何可写入的日期，请检查粘贴内容" }, { status: 400 });
  }

  // Replaces what a previous paste wrote for this tender, and nothing else:
  // extracted_from_document rows belong to the document pipeline and
  // source-supplied rows (publication) belong to the feed. Both are left
  // alone. Re-pasting a corrected table is therefore safe and idempotent.
  const { error: deleteError } = await supabase
    .from("tender_key_dates")
    .delete()
    .eq("tender_id", tender.id)
    .eq("manually_added", true)
    .eq("source_reference", CRONOGRAMA_SOURCE_REFERENCE);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // `submission` is deliberately NOT inserted as a row here. It has its own
  // column (submission_deadline), and syncKeyDatesForTopLevelFields() owns
  // the row that mirrors it — it deletes EVERY row of that type and rebuilds
  // one from the column. Writing both would put two 交标截止 entries on the
  // public timeline until the next admin save silently removed one, which a
  // customer would see. The column is set below and the sync builds the row.
  //
  // Of what is left, only the rows nothing already states get inserted — see
  // diffAgainstExisting(). A date the bid document already yielded is the
  // same fact, and the first real paste put it on the page twice.
  const timelineRows = diff.toInsert;
  if (timelineRows.length > 0) {
    const { error: insertError } = await supabase.from("tender_key_dates").insert(
      timelineRows.map((row) => ({
        tender_id: tender.id,
        type: row.type,
        date: row.date,
        notes: { es: "", en: "", zh: `SEACE ficha：${row.label}` },
        source_reference: CRONOGRAMA_SOURCE_REFERENCE,
        // A human read this off the official page, so a re-ingest must never
        // delete it (migration 0033).
        manually_added: true,
      })),
    );
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Fills the tender's own deadline column only when it is empty — the same
  // "fill, never overwrite" rule writeExtractedKeyDates() follows, for the
  // same reason: a date already there came from somewhere and a paste is
  // not grounds to silently replace it.
  let deadlineSet: string | undefined;
  if (extractedDeadline && !storedDeadline) {
    const { error } = await supabase.from("tenders").update({ submission_deadline: extractedDeadline }).eq("id", tender.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // The same call the admin form's own save makes, so the timeline row and
    // the column can never disagree — and exactly one row exists either way.
    await syncKeyDatesForTopLevelFields(supabase, tender.id as string, { submissionDeadline: extractedDeadline });
    deadlineSet = extractedDeadline;
  }

  revalidateTenders();
  return NextResponse.json({
    written: parsed.rows.length,
    timelineRows: timelineRows.length,
    ignored: parsed.ignored,
    unparsed: parsed.unparsed,
    problems: problems.map((p) => p.message),
    duplicates,
    conflicts,
    deadlineSet,
    deadlineUnchanged: extractedDeadline && storedDeadline && storedDeadline !== extractedDeadline ? storedDeadline : undefined,
  });
}
