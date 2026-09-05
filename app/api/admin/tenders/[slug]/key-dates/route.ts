import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { TenderKeyDate } from "@/types/tender";

type KeyDateBody = {
  type: TenderKeyDate["type"];
  date: string;
  mandatory?: boolean;
  notesZh?: string;
};

/**
 * Manual add for one tender_key_dates row (see supabase/migrations/0001_init.sql
 * — a real child table, not a jsonb column on tenders). Per-row endpoints
 * (this + [id]/route.ts's PATCH/DELETE) rather than a full-array replace,
 * since an admin editing one date shouldn't have to resend every other one.
 *
 * `notes` only ever carries `zh` from this form — LOCALE is hardcoded "zh"
 * (lib/i18n.tsx), so es/en are never rendered anywhere; left as empty
 * strings rather than duplicating the zh text into them.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as Partial<KeyDateBody>;
  if (!body.type || !body.date) {
    return NextResponse.json({ error: "type and date are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { data: tender, error: tenderError } = await supabase.from("tenders").select("id").eq("slug", slug).maybeSingle();
  if (tenderError) return NextResponse.json({ error: tenderError.message }, { status: 500 });
  if (!tender) return NextResponse.json({ error: "not found" }, { status: 404 });

  const notes = body.notesZh?.trim() ? { es: "", en: "", zh: body.notesZh.trim() } : null;

  const { data, error } = await supabase
    .from("tender_key_dates")
    .insert({ tender_id: tender.id, type: body.type, date: body.date, mandatory: body.mandatory ?? null, notes })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
