import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { classifyRelevance } from "@/lib/relevance";
import { slugify } from "@/lib/ingestion/text-utils";
import type { Tender, TenderScopeType, TenderStatus, GovernmentLevel, TenderParticipationScope } from "@/types/tender";

type CreateTenderBody = {
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
  participationScope?: TenderParticipationScope;
  publicationDate: string;
  submissionDeadline?: string;
  awardDate?: string;
  awardedTo?: string;
  awardedValue?: number;
  estimatedValue?: number;
  currency?: string;
  location?: string;
  status: TenderStatus;
  sourceUrl?: string;
};

/**
 * Admin "add tender" endpoint (see app/admin/tenders/new/page.tsx). Scoped
 * to a curated field set, not every Tender field — nested
 * qualifications/experienceRequirements/requiredDocuments/keyDates/risks
 * are populated by document extraction, not something an admin fills in by
 * hand here; they can still be added later via npm run extract:document or
 * npm run ingest:documents like any other tender.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as Partial<CreateTenderBody>;

  const required: (keyof CreateTenderBody)[] = ["titleEs", "titleZh", "buyer", "country", "governmentLevel", "scopeType", "procedureType", "publicationDate", "status"];
  const missing = required.filter((key) => !body[key]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `missing required field(s): ${missing.join(", ")}` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const titleEs = body.titleEs!.trim();
  const titleZh = body.titleZh!.trim();
  const summaryEs = body.summaryEs?.trim() ?? "";
  const summaryZh = body.summaryZh?.trim() ?? summaryEs;
  const industries = body.industries ?? [];
  const scopeType = body.scopeType!;
  const estimatedValue = body.estimatedValue;
  const currency = body.currency?.trim() || undefined;
  const buyer = body.buyer!.trim();

  const relevance = classifyRelevance({
    title: titleEs,
    summary: summaryEs,
    industries,
    scopeType,
    estimatedValue,
    currency,
    buyer,
    country: body.country,
  });

  // Manual entries get their own slug prefix (distinct from every real
  // source's own scheme — proyectosmexico-<id>, pemex-<slug>, etc.) — a
  // short random id makes collisions negligible without needing a
  // uniqueness round-trip before insert, the same posture as every other
  // source-specific slug builder in lib/ingestion/.
  const slug = `manual-${crypto.randomUUID().slice(0, 8)}-${slugify(titleEs).slice(0, 50)}`.replace(/-+$/, "");
  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    id: crypto.randomUUID(),
    slug,
    tender_number: slug,
    title: { es: titleEs, en: titleEs, zh: titleZh },
    summary: { es: summaryEs, en: summaryEs, zh: summaryZh },
    buyer,
    country: body.country,
    government_level: body.governmentLevel,
    industries,
    scope_type: scopeType,
    procedure_type: body.procedureType,
    participation_scope: body.participationScope ?? null,
    publication_date: body.publicationDate,
    publication_date_is_estimated: false,
    submission_deadline: body.submissionDeadline || null,
    award_date: body.awardDate || null,
    awarded_to: body.awardedTo?.trim() || null,
    awarded_value: body.awardedValue ?? null,
    estimated_value: estimatedValue ?? null,
    currency: currency ?? null,
    location: body.location?.trim() || null,
    status: body.status,
    relevance_tier: relevance.tier,
    relevance_label: relevance.label,
    relevance_reason: relevance.reason,
    source_name: "人工添加（管理后台）",
    source_url: body.sourceUrl?.trim() || "",
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from("tenders").insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ slug } satisfies { slug: Tender["slug"] });
}
