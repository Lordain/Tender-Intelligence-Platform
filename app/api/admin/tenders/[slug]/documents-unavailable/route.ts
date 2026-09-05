import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Quick in-place toggle for the /admin/documents-needed worklist
 * (components/admin/DocumentsNeededView.tsx) — same pattern as the
 * homepage-featured toggle route: deliberately separate from the full
 * tender-edit PATCH, which requires the whole edit-form body. This one
 * only ever changes documents_unavailable, letting an admin dismiss a
 * tender from that worklist for sources with no automated attachment path
 * (e.g. Colombia's CAPTCHA-gated SECOP II detail page) without uploading
 * anything or touching relevance_tier.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as { unavailable?: boolean };
  if (typeof body.unavailable !== "boolean") {
    return NextResponse.json({ error: "unavailable must be a boolean" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const { error } = await supabase.from("tenders").update({ documents_unavailable: body.unavailable }).eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
