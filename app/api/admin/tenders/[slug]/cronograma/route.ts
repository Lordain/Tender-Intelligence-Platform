import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { findKeyDateProblems } from "@/lib/ingestion/key-date-checks";
import { decideBidWindow } from "@/lib/db/bid-window-gate";
import type { LocalizedText, TenderRelevanceTier } from "@/types/tender";
import {
  CRONOGRAMA_SOURCE_REFERENCE,
  CRONOGRAMA_SOURCE_REFERENCES,
  PE_MX_CRONOGRAMA_SOURCE_REFERENCE,
  diffAgainstExisting,
} from "@/lib/ingestion/seace-cronograma";
import { parseAnyCronograma } from "@/lib/ingestion/proyectos-estrategicos-cronograma";
import { syncKeyDatesForTopLevelFields } from "@/lib/db/key-dates-sync";
import { isSeaceFichaUrl } from "@/lib/peru-seace-url";

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
  const body = (await request.json()) as { pasted?: string; preview?: boolean; fichaUrl?: string };
  const pasted = body.pasted?.trim();
  if (!pasted) return NextResponse.json({ error: "pasted 内容为空" }, { status: 400 });

  // One textarea, either source — the two formats are unmistakable and the
  // detector says which it read, so a paste into the wrong tender surfaces as
  // a format mismatch rather than as silence. See parseAnyCronograma().
  const parsed = parseAnyCronograma(pasted);

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { data: tender, error: tenderError } = await supabase
    .from("tenders")
    .select("id, submission_deadline, award_date, publication_date, publication_date_is_estimated, estimated_value, relevance_tier, relevance_reason, relevance_manually_overridden, manual_field_overrides, ficha_url, source_url")
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
  const storedAwardDate = (tender.award_date as string | null)?.slice(0, 10) ?? null;
  const extractedAwardDate = parsed.rows.find((row) => row.type === "award")?.date;

  // What this tender already has, minus whatever a previous paste wrote (those
  // rows are deleted and rebuilt below, so counting them would make a re-paste
  // report itself as a duplicate of itself).
  const { data: existingRaw, error: existingError } = await supabase
    .from("tender_key_dates")
    .select("type, date, source_reference, extracted_from_document")
    .eq("tender_id", tender.id);
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const existing = (existingRaw ?? [])
    .filter((row) => !CRONOGRAMA_SOURCE_REFERENCES.includes(row.source_reference as (typeof CRONOGRAMA_SOURCE_REFERENCES)[number]))
    .map((row) => ({
      type: row.type as string,
      date: (row.date as string) ?? "",
      sourceReference: row.source_reference as string | null,
      extractedFromDocument: Boolean(row.extracted_from_document),
    }));

  // `submission` is handled by the deadline column and its sync, not as a row
  // here, so it is not part of the row-level diff.
  // `submission` and `award` are both excluded from the row-level diff: each
  // has its own column, and syncKeyDatesForTopLevelFields() owns the single
  // row that mirrors it. Inserting one here as well would put two 交标截止 or
  // two 授标 entries on the public timeline until the next admin save silently
  // removed one, which a customer would see.
  const diff = diffAgainstExisting(
    parsed.rows.filter((row) => row.type !== "submission" && row.type !== "award"),
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
      storedAwardDate,
      extractedAwardDate,
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
    .in("source_reference", [...CRONOGRAMA_SOURCE_REFERENCES]);
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
  // Each format gets its own marker so the admin can see which page a row was
  // read off; both are deleted above, so re-pasting either stays idempotent.
  const sourceReference =
    parsed.format === "proyectos-estrategicos" ? PE_MX_CRONOGRAMA_SOURCE_REFERENCE : CRONOGRAMA_SOURCE_REFERENCE;
  const timelineRows = diff.toInsert;
  if (timelineRows.length > 0) {
    const { error: insertError } = await supabase.from("tender_key_dates").insert(
      timelineRows.map((row) => ({
        tender_id: tender.id,
        type: row.type,
        date: row.date,
        // Just the stage, verbatim. The row renders its source_reference
        // beside this already, so prefixing the note with it printed the same
        // sentence twice across one line.
        notes: { es: "", en: "", zh: row.label },
        source_reference: sourceReference,
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
  //
  // The award date is filled the same way, at the user's instruction
  // (2026-09-14). Note what it means: 中标日期 on the public page reads as a
  // statement that the tender WAS awarded, while an otorgamiento de la buena
  // pro on a cronograma is a date nobody has reached yet — which is why the
  // document-extraction path (writeExtractedKeyDates) deliberately does NOT
  // fill it. What makes it safe here is that the public overview renders the
  // date only inside the awarded block, which needs a supplier or an awarded
  // amount; a planned date alone changes nothing a reader sees, and gives the
  // admin the schedule they asked for.
  // The page the admin is copying from, so the next person does not have to
  // find it again by typing the procedure number into SEACE's search (which
  // is what 13 lost deadlines cost on 2026-09-15). Optional, and never
  // overwritten with an empty box: clearing it is not something the paste
  // form is for.
  //
  // Scheme-checked rather than pattern-matched against a known portal: this
  // value ends up in an href on the admin page, so `javascript:` and friends
  // must not survive, but a new source's URL shape is not this route's
  // business to predict.
  const fichaUrl = body.fichaUrl?.trim();
  let fichaUrlSet: string | undefined;
  if (fichaUrl) {
    let parsed_url: URL | null = null;
    try {
      parsed_url = new URL(fichaUrl);
    } catch {
      return NextResponse.json({ error: "ficha 链接不是一个有效的网址" }, { status: 400 });
    }
    if (parsed_url.protocol !== "http:" && parsed_url.protocol !== "https:") {
      return NextResponse.json({ error: "ficha 链接必须是 http/https 网址" }, { status: 400 });
    }
    if (fichaUrl.length > 2000) {
      return NextResponse.json({ error: "ficha 链接过长" }, { status: 400 });
    }
    fichaUrlSet = parsed_url.toString();
  }

  const columnUpdate: Record<string, string> = {};
  if (fichaUrlSet && fichaUrlSet !== tender.ficha_url) columnUpdate.ficha_url = fichaUrlSet;
  // ...and it becomes the public 官方入口 too — EXCEPT for a SEACE ficha
  // link, which cannot survive being clicked by a reader.
  //
  // This route used to copy every pasted link into source_url, on the user's
  // 2026-09-15 instruction (请直接用这个替换编辑项目页面最下方的官方标书链接),
  // and for Mexico's Proyectos Estratégicos it still does — that portal's
  // `#/` routes are resolved in the browser and deep-link fine.
  //
  // SEACE does not. Its ficha page is keyed on server-side session state, so
  // a pasted link works for the person who just walked through the buscador
  // and is blank for everyone after (reported 2026-09-18: 加的时候能用，但是
  // 现在再点击用不了; evidence in lib/peru-seace-url.ts). Copying one into
  // source_url therefore does not give readers a deep link, it replaces a
  // working search page with a dead page — so the copy is refused here
  // rather than left for a cleanup script to undo again.
  //
  // ficha_url still keeps it: that column records where this tender's
  // schedule was read from, and that stays true after the link stops
  // resolving.
  const fichaIsSessionScoped = isSeaceFichaUrl(fichaUrlSet);
  if (fichaUrlSet && !fichaIsSessionScoped && fichaUrlSet !== tender.source_url) columnUpdate.source_url = fichaUrlSet;
  if (extractedDeadline && !storedDeadline) columnUpdate.submission_deadline = extractedDeadline;
  if (extractedAwardDate && !storedAwardDate) columnUpdate.award_date = extractedAwardDate;

  let deadlineSet: string | undefined;
  let awardDateSet: string | undefined;
  if (Object.keys(columnUpdate).length > 0) {
    // Locked as a hand edit in the SAME statement that writes it.
    //
    // Without this the next import silently undid the work. A Peru OECE
    // record carries no deadline at all, so upsertTendersBatched() wrote
    // `submission_deadline: null` straight over the pasted date, and
    // lockedKeyDateTypes() — which reads exactly this column list — did not
    // protect the mirror row either, so the timeline entry went with it. The
    // user pasted ~65 SEACE cronogramas by hand and the next morning's import
    // emptied them (reported 2026-09-15: 昨天都手动补了交标日期，今天重新导入
    // 又变成没有). Their standing rule is the opposite: 不要我们做了半天，然后
    // 重新导入又得重做.
    //
    // The admin form's own save route has always done this (it diffs the
    // submitted row against the stored one); this route bypassed that route
    // and wrote the columns directly, which is how it missed the lock. Merged
    // rather than replaced, so an earlier lock on another column survives.
    const overrides = new Set<string>((tender.manual_field_overrides as string[] | null) ?? []);
    // ficha_url is deliberately not locked: no import writes that column, so
    // an entry there would be noise in a list that is read to mean "an import
    // must keep its hands off this".
    // source_url IS locked (an import would otherwise restore the search
    // page); ficha_url is not, because no import writes that column and an
    // entry there would be noise in a list read as "imports keep off".
    for (const column of Object.keys(columnUpdate)) if (column !== "ficha_url") overrides.add(column);

    const { error } = await supabase
      .from("tenders")
      .update({ ...columnUpdate, manual_field_overrides: [...overrides].sort() })
      .eq("id", tender.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deadlineSet = columnUpdate.submission_deadline;
    awardDateSet = columnUpdate.award_date;
  }

  // The bidding-window rule, applied where Peru's deadlines actually arrive.
  //
  // This is the route the user meant (2026-09-19: 秘鲁都是我手动补的). SEACE
  // publishes the cronograma only on the ficha page, so a Peru OECE row lands
  // with no deadline at all and upsertTendersBatched()'s gate has nothing to
  // measure. The window comes into existence here, on the paste.
  //
  // Runs even when this request wrote no column, because the tier can be stale
  // from an earlier paste: a row excluded by this rule and then corrected by a
  // separate edit has to be let back in. decideBidWindow() is a no-op unless
  // something actually needs changing.
  const bidWindowDeadline = storedDeadline ?? deadlineSet ?? null;
  const bidWindow = decideBidWindow({
    currentTier: tender.relevance_tier as TenderRelevanceTier | null,
    currentReason: (tender.relevance_reason as LocalizedText | null) ?? null,
    manuallyOverridden: tender.relevance_manually_overridden === true,
    estimatedValue: (tender.estimated_value as number | null) ?? null,
    publicationDate: (tender.publication_date as string | null) ?? null,
    publicationDateIsEstimated: tender.publication_date_is_estimated === true,
    submissionDeadline: bidWindowDeadline,
  });
  if (bidWindow) {
    const { error } = await supabase.from("tenders").update(bidWindow.patch).eq("id", tender.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The same call the admin form's own save makes, so the timeline rows and
  // the columns can never disagree — and exactly one row exists of each type.
  // Passed the EFFECTIVE values, stored or just-written: a column that already
  // had a date still needs its mirror row rebuilt, since the paste deleted
  // whatever rows it had written for these types a moment ago.
  const effectiveDeadline = storedDeadline ?? deadlineSet;
  const effectiveAwardDate = storedAwardDate ?? awardDateSet;
  if (effectiveDeadline || effectiveAwardDate) {
    await syncKeyDatesForTopLevelFields(supabase, tender.id as string, {
      submissionDeadline: effectiveDeadline,
      awardDate: effectiveAwardDate,
    });
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
    awardDateSet,
    fichaUrlSet: columnUpdate.ficha_url,
    sourceUrlSet: columnUpdate.source_url,
    // Told to the admin, not swallowed: they pasted a link expecting the
    // public button to change, and it deliberately did not.
    fichaNotUsedAsPublicLink: fichaIsSessionScoped || undefined,
    awardDateUnchanged: extractedAwardDate && storedAwardDate && storedAwardDate !== extractedAwardDate ? storedAwardDate : undefined,
    deadlineUnchanged: extractedDeadline && storedDeadline && storedDeadline !== extractedDeadline ? storedDeadline : undefined,
  });
}
