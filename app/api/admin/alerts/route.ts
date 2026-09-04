import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Backs AdminAlertBanner.tsx (rendered in AdminShell on every /admin/*
 * page) — GET returns unresolved admin_alerts rows, PATCH marks one
 * resolved. See lib/admin-alerts.ts for what writes these rows.
 */
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ alerts: [] });

  const { data, error } = await supabase
    .from("admin_alerts")
    .select("id, kind, message, source, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] });
}

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { id?: string; resolveAll?: boolean };

  if (body.resolveAll) {
    const { error } = await supabase.from("admin_alerts").update({ resolved_at: new Date().toISOString() }).is("resolved_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("admin_alerts").update({ resolved_at: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
