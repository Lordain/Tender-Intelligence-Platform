import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

export async function PATCH(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json()) as { featuredCount?: number };
  const count = Number(body.featuredCount);
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    return NextResponse.json({ error: "featuredCount must be a non-negative integer" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: "homepage_featured_count", value: count, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
