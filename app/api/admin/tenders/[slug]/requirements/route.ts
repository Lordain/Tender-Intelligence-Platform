import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

type RequirementBody = {
  kind: "qualification" | "experience" | "document";
  titleZh: string;
  descriptionZh?: string;
  mandatory?: boolean;
  sourceReference?: string;
};

/**
 * Manual add for one tender_requirements row — qualifications/
 * experienceRequirements/requiredDocuments all share this one table,
 * distinguished by `kind` (see supabase/migrations/0001_init.sql). This is
 * the "标书分析结果" manual entry the admin normally only gets from the
 * Layer 2 document-extraction pipeline (lib/ingestion/analyze-uploaded-
 * document.ts) — for a tender with no source document to run that
 * pipeline against, or to correct/supplement its output by hand.
 *
 * `title`/`description` only ever carry `zh` from this form — same
 * reasoning as key-dates' `notes` (LOCALE is hardcoded "zh", es/en are
 * never rendered anywhere).
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as Partial<RequirementBody>;
  if (!body.kind || !body.titleZh?.trim()) {
    return NextResponse.json({ error: "kind and titleZh are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { data: tender, error: tenderError } = await supabase.from("tenders").select("id").eq("slug", slug).maybeSingle();
  if (tenderError) return NextResponse.json({ error: tenderError.message }, { status: 500 });
  if (!tender) return NextResponse.json({ error: "not found" }, { status: 404 });

  // New rows append after whatever's already there for this kind — an
  // admin adding one item by hand shouldn't have to also renumber every
  // existing row.
  const { data: maxRow } = await supabase
    .from("tender_requirements")
    .select("sort_order")
    .eq("tender_id", tender.id)
    .eq("kind", body.kind)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("tender_requirements")
    .insert({
      tender_id: tender.id,
      kind: body.kind,
      title: { es: "", en: "", zh: body.titleZh.trim() },
      description: { es: "", en: "", zh: body.descriptionZh?.trim() ?? "" },
      mandatory: body.mandatory ?? true,
      source_reference: body.sourceReference?.trim() || null,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
