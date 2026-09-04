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
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    texto?: string;
    fechaIni?: string;
    fechaFin?: string;
    idOrg?: string;
    write?: boolean;
    months?: number;
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
      { write: body.write === true, months: body.months },
    );
    return NextResponse.json(result);
  } catch (err) {
    await logAdminAlert(supabase, "import-dof", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
