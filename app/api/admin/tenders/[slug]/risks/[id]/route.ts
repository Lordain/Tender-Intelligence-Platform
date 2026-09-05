import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { TenderRiskLevel } from "@/types/tender";

type RiskBody = {
  level: TenderRiskLevel;
  titleZh: string;
  descriptionZh?: string;
  sourceReference?: string;
};

/** Same "scope every row op to id AND tender_id" reasoning as key-dates/[id]/route.ts — see that file's comment. */
async function resolveTenderId(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase.from("tenders").select("id").eq("slug", slug).maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  return { tenderId: data.id as string };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug, id } = await params;
  const body = (await request.json()) as Partial<RiskBody>;
  if (!body.level || !body.titleZh?.trim()) {
    return NextResponse.json({ error: "level and titleZh are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const resolved = await resolveTenderId(supabase, slug);
  if (resolved.error) return resolved.error;

  const { error } = await supabase
    .from("tender_risks")
    .update({
      level: body.level,
      title: { es: "", en: "", zh: body.titleZh.trim() },
      description: { es: "", en: "", zh: body.descriptionZh?.trim() ?? "" },
      source_reference: body.sourceReference?.trim() || null,
    })
    .eq("id", id)
    .eq("tender_id", resolved.tenderId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug, id } = await params;
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const resolved = await resolveTenderId(supabase, slug);
  if (resolved.error) return resolved.error;

  const { error } = await supabase.from("tender_risks").delete().eq("id", id).eq("tender_id", resolved.tenderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
