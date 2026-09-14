import { revalidateTenders } from "@/lib/cache-tags";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { importDofSearchLive } from "@/lib/ingestion/import-dof-search-live";
import { logAdminAlert } from "@/lib/admin-alerts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * Server-side live fetch of DOF's advanced-search results — see
 * lib/ingestion/connectors/dof-search-live.ts and lib/ingestion/README.md
 * for why this can hit sidof.segob.gob.mx directly (confirmed only a
 * routine `ci_session` cookie, no anti-bot gate) instead of needing the
 * manual "Copy as cURL" capture npm run ingest:dof-search still documents.
 *
 * Long by design: the search returns every CFE/PEMEX notice in the window and
 * each one's own detail page is fetched (three at a time — see
 * import-dof-search-live.ts). A 13-day CFE range is ~33 notices, so the
 * platform default would cut the run off partway and write nothing.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    texto?: string;
    fechaIni?: string;
    fechaFin?: string;
    idOrg?: string;
    write?: boolean;
  };

  if (!body.texto?.trim()) {
    return NextResponse.json({ error: "texto（采购单位关键词）is required" }, { status: 400 });
  }
  if (!body.fechaIni?.trim() || !body.fechaFin?.trim()) {
    return NextResponse.json({ error: "fechaIni and fechaFin are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (body.write === true && !supabase) {
    return NextResponse.json({ error: "Supabase isn't configured." }, { status: 500 });
  }

  try {
    const result = await importDofSearchLive(
      {
        texto: body.texto.trim(),
        fechaIni: body.fechaIni.trim(),
        fechaFin: body.fechaFin.trim(),
        idOrg: body.idOrg?.trim() || undefined,
      },
      { write: body.write === true },
    );
    // The public list is cached; drop it so this edit shows up now.
    revalidateTenders();
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "import-dof", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
