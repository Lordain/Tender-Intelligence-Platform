import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Bulk-clears homepage_featured on every currently-checked tender in one
 * call — the per-row PATCH at [slug]/homepage-featured/route.ts only
 * toggles one tender at a time, which isn't practical once dozens are
 * checked and an admin just wants to start over.
 */
export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { error } = await supabase.from("tenders").update({ homepage_featured: false }).eq("homepage_featured", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
