import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { TenderKeyDate } from "@/types/tender";

type KeyDateBody = {
  type: TenderKeyDate["type"];
  date: string;
  mandatory?: boolean;
  notesZh?: string;
};

/** Resolves slug -> tender id once so both PATCH and DELETE below can scope their row operation to `id AND tender_id` — an admin editing tender A's key dates should never be able to touch tender B's row even by guessing/reusing an id. */
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
  const body = (await request.json()) as Partial<KeyDateBody>;
  if (!body.type || !body.date) {
    return NextResponse.json({ error: "type and date are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const resolved = await resolveTenderId(supabase, slug);
  if (resolved.error) return resolved.error;

  const notes = body.notesZh?.trim() ? { es: "", en: "", zh: body.notesZh.trim() } : null;

  const { error } = await supabase
    .from("tender_key_dates")
    .update({ type: body.type, date: body.date, mandatory: body.mandatory ?? null, notes })
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

  const { error } = await supabase.from("tender_key_dates").delete().eq("id", id).eq("tender_id", resolved.tenderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
