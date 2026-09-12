import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { resolveComprasMxLinks } from "@/lib/ingestion/resolve-comprasmx-links";

/** Backs the "LicitIA 刷新" section's "补全真实链接" button. */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { write?: boolean };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });

  try {
    const result = await resolveComprasMxLinks(supabase, { write: body.write === true });
    // The public list is cached; drop it so this edit shows up now.
    revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
