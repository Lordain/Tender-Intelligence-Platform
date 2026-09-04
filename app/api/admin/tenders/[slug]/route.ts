import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { RELEVANCE_TIER_LABELS } from "@/lib/tender-labels";
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
  buyer: string;
  country: string;
  governmentLevel: GovernmentLevel;
  industries: string[];
  scopeType: TenderScopeType;
  procedureType: string;
  participationScope?: TenderParticipationScope | null;
  publicationDate: string;
  submissionDeadline?: string | null;
  awardDate?: string | null;
  awardedTo?: string | null;
  estimatedValue?: number | null;
  currency?: string | null;
  location?: string | null;
  status: TenderStatus;
  relevanceTier: TenderRelevanceTier;
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
    .select("title, summary, relevance_tier")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const currentTitle = existing.title as LocalizedText;
  const currentSummary = existing.summary as LocalizedText;

  const row: Record<string, unknown> = {
    title: { ...currentTitle, es: body.titleEs!.trim(), zh: body.titleZh!.trim() },
    summary: { ...currentSummary, es: body.summaryEs?.trim() ?? "", zh: body.summaryZh?.trim() ?? body.summaryEs?.trim() ?? "" },
    tender_number: body.tenderNumber?.trim() || slug,
    buyer: body.buyer!.trim(),
    country: body.country,
    government_level: body.governmentLevel,
    industries: body.industries ?? [],
    scope_type: body.scopeType,
    procedure_type: body.procedureType,
    participation_scope: body.participationScope || null,
    publication_date: body.publicationDate,
    publication_date_is_estimated: false,
    submission_deadline: body.submissionDeadline || null,
    award_date: body.awardDate || null,
    awarded_to: body.awardedTo?.trim() || null,
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

  const { error } = await supabase.from("tenders").update(row).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  // tender_requirements/tender_key_dates/tender_risks/tender_documents all
  // reference tenders(id) with ON DELETE CASCADE (supabase/migrations/0001_init.sql)
  // — deleting the tender row alone cleans up every child row too.
  const { error } = await supabase.from("tenders").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
