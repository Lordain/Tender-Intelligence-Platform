import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";
import { syncKeyDatesForTopLevelFields } from "@/lib/db/key-dates-sync";
import type {
  TenderRelevanceTier,
  TenderScopeType,
  TenderStatus,
  GovernmentLevel,
  TenderParticipationScope,
  LocalizedText,
} from "@/types/tender";

type UpdateTenderBody = {
  titleEs: string;
  titleZh: string;
  summaryEs: string;
  summaryZh: string;
  /** See types/tender.ts's Tender.oneLineSummary — usually written by document analysis, also settable by hand from the admin form (2026-09-06). */
  oneLineSummary?: string | null;
  buyer: string;
  country: string;
  governmentLevel: GovernmentLevel;
  industries: string[];
  scopeType: TenderScopeType;
  procedureType: string;
  participationScope?: TenderParticipationScope | null;
  publicationDate: string;
  /** Whether publicationDate is a real, source-confirmed value or a placeholder (e.g. ingestion time, for sources with no real publication-date field — see compras-mx-open-tenders-mapper.ts). Real bug fixed (2026-09-05): this route used to unconditionally write `false` here on every save, silently "confirming" an estimate the moment an admin edited any OTHER field, even without touching the date itself. */
  publicationDateIsEstimated?: boolean;
  submissionDeadline?: string | null;
  awardDate?: string | null;
  awardedTo?: string | null;
  awardedValue?: number | null;
  estimatedValue?: number | null;
  currency?: string | null;
  location?: string | null;
  status: TenderStatus;
  relevanceTier: TenderRelevanceTier;
  /** Per the user's explicit request (2026-09-04): whether this manual tier choice should survive a future re-ingest of this same tender — see lib/ingestion/upsert-tenders.ts. */
  relevanceManuallyOverridden?: boolean;
  /** Whether an admin dismissed this tender from the /admin/documents-needed worklist (see components/admin/DocumentsNeededView.tsx's "标记为无法获取" toggle) — surfaced here too so an admin can reverse it from the edit form, per that toggle's own confirm-dialog promise. */
  documentsUnavailable?: boolean;
  sourceName: string;
  sourceUrl?: string;
  tenderNumber: string;
};

/** Set whenever an admin edit changes relevance_tier away from what classifyRelevance() (or a previous manual edit) had computed — replaces the auto-generated reason with an honest "a human overrode this" one rather than keeping stale auto-generated reasoning that no longer matches the stored tier. */
const MANUAL_OVERRIDE_REASON: LocalizedText = {
  zh: "管理员在后台手动设置",
  en: "Manually set by an admin",
  es: "Establecido manualmente por un administrador",
};

/**
 * Columns that are never locked against re-ingest even when an admin edit
 * changes them. The relevance trio has its own, older and deliberately
 * user-toggled protection (relevance_manually_overridden — see lib/
 * ingestion/upsert-tenders.ts); documents_unavailable is an admin worklist
 * flag the importer never writes at all, so locking it would be noise.
 */
const NEVER_LOCKED_COLUMNS = new Set([
  "relevance_tier",
  "relevance_label",
  "relevance_reason",
  "relevance_manually_overridden",
  "documents_unavailable",
  "manual_field_overrides",
]);

/**
 * Value equality as Postgres would see it after a round trip, for the
 * override diff above. Deliberately loose in two places:
 *
 * - null and "" are the same absence. The form posts "" for a cleared text
 *   input while the row stores null, so a strict compare would mark
 *   untouched empty fields as edited on every single save and lock the row.
 * - date columns are compared on their calendar day. `publication_date` is
 *   a Postgres `date` and comes back as "2026-08-21", while the form posts
 *   the same day and `award_date` is sent as a full ISO timestamp — a raw
 *   string compare would treat those as different every time.
 *
 * jsonb/array columns (title, summary, industries) fall through to a
 * key-order-independent JSON compare.
 */
function sameStoredValue(stored: unknown, next: unknown): boolean {
  const emptyStored = stored === null || stored === undefined || stored === "";
  const emptyNext = next === null || next === undefined || next === "";
  if (emptyStored || emptyNext) return emptyStored && emptyNext;
  if (typeof stored === "object" || typeof next === "object") {
    return stableJson(stored) === stableJson(next);
  }
  const storedDay = calendarDay(stored);
  const nextDay = calendarDay(next);
  if (storedDay && nextDay) return storedDay === nextDay;
  return String(stored) === String(next);
}

/** "2026-08-21" for anything Date can parse as a day, else null. */
function calendarDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as Partial<UpdateTenderBody>;

  const required: (keyof UpdateTenderBody)[] = ["titleEs", "titleZh", "buyer", "country", "governmentLevel", "scopeType", "procedureType", "publicationDate", "status", "relevanceTier"];
  const missing = required.filter((key) => !body[key]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `missing required field(s): ${missing.join(", ")}` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { data: existing, error: fetchError } = await supabase
    .from("tenders")
    .select(`
      id, title, summary, relevance_tier, manual_field_overrides,
      one_line_summary, tender_number, buyer, country, government_level, industries,
      scope_type, procedure_type, participation_scope, publication_date,
      publication_date_is_estimated, submission_deadline, award_date, awarded_to,
      awarded_value, estimated_value, currency, location, status, source_name, source_url
    `)
    .eq("slug", slug)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const currentTitle = existing.title as LocalizedText;
  const currentSummary = existing.summary as LocalizedText;

  const row: Record<string, unknown> = {
    title: { ...currentTitle, es: body.titleEs!.trim(), zh: body.titleZh!.trim() },
    summary: { ...currentSummary, es: body.summaryEs?.trim() ?? "", zh: body.summaryZh?.trim() ?? body.summaryEs?.trim() ?? "" },
    one_line_summary: body.oneLineSummary?.trim() || null,
    tender_number: body.tenderNumber?.trim() || slug,
    buyer: body.buyer!.trim(),
    country: body.country,
    government_level: body.governmentLevel,
    industries: body.industries ?? [],
    scope_type: body.scopeType,
    procedure_type: body.procedureType,
    participation_scope: body.participationScope || null,
    publication_date: body.publicationDate,
    publication_date_is_estimated: body.publicationDateIsEstimated === true,
    submission_deadline: body.submissionDeadline || null,
    award_date: body.awardDate || null,
    awarded_to: body.awardedTo?.trim() || null,
    // Real, pre-existing bug found 2026-09-06 while adding one_line_summary
    // above: this route accepted awardedValue in UpdateTenderBody (added
    // alongside the awarded_value column) but never actually wrote it here
    // — every 中标金额 edit from AdminTenderForm.tsx was silently dropped.
    awarded_value: body.awardedValue ?? null,
    estimated_value: body.estimatedValue ?? null,
    currency: body.currency?.trim() || null,
    location: body.location?.trim() || null,
    status: body.status,
    source_name: body.sourceName?.trim() || "人工添加（管理后台）",
    source_url: body.sourceUrl?.trim() || "",
    updated_at: new Date().toISOString(),
  };

  // Only touch relevance_tier/label/reason when the admin actually changed
  // the tier — otherwise a routine edit (fixing a typo in the buyer name)
  // would silently overwrite classifyRelevance()'s real, specific reasoning
  // with a generic "manually set" placeholder.
  if (body.relevanceTier !== existing.relevance_tier) {
    row.relevance_tier = body.relevanceTier;
    row.relevance_label = RELEVANCE_TIER_LABELS[body.relevanceTier!];
    row.relevance_reason = MANUAL_OVERRIDE_REASON;
  }

  // relevance_manually_overridden is a separate, independently-toggleable
  // checkbox in the form (see AdminTenderForm.tsx) — written unconditionally
  // from the submitted value, unlike tier/label/reason above, since an admin
  // can turn protection on/off without also changing the tier itself (e.g.
  // releasing a tender back to automatic classification on its next
  // re-ingest without first picking a different tier). See lib/ingestion/
  // upsert-tenders.ts for what this flag actually protects.
  row.relevance_manually_overridden = body.relevanceManuallyOverridden === true;
  row.documents_unavailable = body.documentsUnavailable === true;

  // Record which columns this save actually CHANGED, so a later re-ingest
  // of the same tender leaves them alone (migration 0032; enforced in
  // lib/ingestion/upsert-tenders.ts).
  //
  // Computed by diffing against the stored row rather than trusting the
  // submitted body, because the form posts every field on every save —
  // taking "present in the body" as "edited" would lock the entire row the
  // first time an admin fixed a single typo, and the tender would then
  // never receive a real source update again.
  //
  // Additive only: an admin re-saving a field back to the value the source
  // happened to have does NOT release the lock. Releasing it is a separate,
  // deliberate action (there is no UI for it yet — see the note in the
  // response below), on the same reasoning as relevance_manually_overridden
  // being its own explicit checkbox: silently un-protecting data is the
  // failure mode we are fixing here, so it must not happen as a side effect.
  const previousOverrides = new Set<string>(((existing.manual_field_overrides as string[] | null) ?? []));
  for (const [column, nextValue] of Object.entries(row)) {
    if (column === "updated_at" || NEVER_LOCKED_COLUMNS.has(column)) continue;
    if (!sameStoredValue((existing as Record<string, unknown>)[column], nextValue)) {
      previousOverrides.add(column);
    }
  }
  // publication_date and its "is estimated" flag are one fact in two
  // columns: the 2026-09-08 report was the date being restored to the
  // ingestion placeholder AND the 估 badge coming back. Locking only the
  // one the admin happened to touch would let the import re-flag a
  // hand-confirmed date as an estimate, so they lock together.
  if (previousOverrides.has("publication_date") || previousOverrides.has("publication_date_is_estimated")) {
    previousOverrides.add("publication_date");
    previousOverrides.add("publication_date_is_estimated");
  }
  row.manual_field_overrides = [...previousOverrides].sort();

  const { error } = await supabase.from("tenders").update(row).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncKeyDatesForTopLevelFields(supabase, existing.id as string, {
    publicationDate: body.publicationDate,
    submissionDeadline: body.submissionDeadline,
    awardDate: body.awardDate,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  // Best-effort: read the tender's own tender_number/title before deleting
  // it, purely so tender_manual_deletions (written below) carries a human-
  // readable record of what was removed — nothing downstream depends on
  // these being present.
  const { data: aboutToDelete } = await supabase.from("tenders").select("tender_number, title").eq("slug", slug).maybeSingle();

  // tender_requirements/tender_key_dates/tender_risks/tender_documents all
  // reference tenders(id) with ON DELETE CASCADE (supabase/migrations/0001_init.sql)
  // — deleting the tender row alone cleans up every child row too.
  const { error } = await supabase.from("tenders").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tombstone this slug so a future re-ingest from the same source (same
  // slug scheme — see lib/ingestion/README.md) doesn't silently resurrect
  // it — per the user's explicit request (2026-09-04). Written AFTER the
  // delete succeeds; a failure here is logged but doesn't fail the request
  // — the tender is still gone either way, this table is a best-effort
  // protection layer on top, not the primary action.
  const title = aboutToDelete?.title as { es?: string } | undefined;
  const { error: tombstoneError } = await supabase
    .from("tender_manual_deletions")
    .upsert(
      { slug, tender_number: aboutToDelete?.tender_number ?? null, title: title?.es ?? null, deleted_at: new Date().toISOString() },
      { onConflict: "slug" },
    );
  if (tombstoneError) console.error(`Failed to record tender_manual_deletions for "${slug}": ${tombstoneError.message}`);

  return NextResponse.json({ ok: true });
}
