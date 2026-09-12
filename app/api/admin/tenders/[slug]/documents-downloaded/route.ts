import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Marks one tender's bid documents as "already downloaded" on the
 * /admin/documents-needed worklist — same shape as the sibling
 * documents-unavailable route, deliberately separate from the full tender-edit
 * PATCH so a one-click marker never needs the whole edit-form body.
 *
 * The two markers mean different things and must not be confused:
 * documents-unavailable removes the row from the worklist because the source
 * has nothing obtainable; this one leaves it there (the files still have to be
 * uploaded before the tender is analysed) and only records that the fetching
 * half is done.
 *
 * The server stamps the time rather than trusting a client-supplied one, and
 * un-marking clears it — a Peruvian tender's documents get republished after
 * the consultas round, at which point what was downloaded is stale.
 *
 * No revalidateTenders() here, unlike documents-unavailable: this column is
 * admin bookkeeping and appears on no public surface, so dropping the public
 * list cache would be pure waste.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const { slug } = await params;
  const body = (await request.json()) as { downloaded?: boolean };
  if (typeof body.downloaded !== "boolean") {
    return NextResponse.json({ error: "downloaded must be a boolean" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "supabase not configured" }, { status: 500 });

  const documentsDownloadedAt = body.downloaded ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("tenders")
    .update({ documents_downloaded_at: documentsDownloadedAt })
    .eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, documentsDownloadedAt });
}
