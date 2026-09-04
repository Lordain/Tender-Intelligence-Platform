import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Quick in-place toggle for the admin tenders list (components/admin/
 * AdminTenderList.tsx) — deliberately separate from the full tender-edit
 * PATCH (app/api/admin/tenders/[slug]/route.ts), which requires the whole
 * edit-form body (title, buyer, dates, ...). This one only ever changes
 * homepage_featured.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as { featured?: boolean };
  if (typeof body.featured !== "boolean") {
    return NextResponse.json({ error: "featured must be a boolean" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { error } = await supabase.from("tenders").update({ homepage_featured: body.featured }).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
