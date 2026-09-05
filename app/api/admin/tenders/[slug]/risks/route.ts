import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { TenderRiskLevel } from "@/types/tender";

type RiskBody = {
  level: TenderRiskLevel;
  titleZh: string;
  descriptionZh?: string;
  sourceReference?: string;
};

/** Manual add for one tender_risks row — same "标书分析结果" manual-entry reasoning as requirements/route.ts. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as Partial<RiskBody>;
  if (!body.level || !body.titleZh?.trim()) {
    return NextResponse.json({ error: "level and titleZh are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { data: tender, error: tenderError } = await supabase.from("tenders").select("id").eq("slug", slug).maybeSingle();
  if (tenderError) return NextResponse.json({ error: tenderError.message }, { status: 500 });
  if (!tender) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("tender_risks")
    .insert({
      tender_id: tender.id,
      level: body.level,
      title: { es: "", en: "", zh: body.titleZh.trim() },
      description: { es: "", en: "", zh: body.descriptionZh?.trim() ?? "" },
      source_reference: body.sourceReference?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
