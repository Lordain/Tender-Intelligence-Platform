import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { importPemexLive } from "@/lib/ingestion/import-pemex-live";
import { PEMEX_LIST_TITLES } from "@/lib/ingestion/pemex-sources";

/**
 * Server-side live fetch of a real PEMEX subsidiary list — see
 * lib/ingestion/connectors/pemex-live.ts and lib/ingestion/README.md for
 * why this can hit pemex.com directly (confirmed genuinely anonymous
 * SharePoint REST API, no anti-bot gate) instead of needing the manual
 * browser-Console capture npm run ingest:pemex still documents.
 */
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    listTitle?: string;
    buyer?: string;
    procedureLabel?: string;
    write?: boolean;
    months?: number;
  };

  if (!body.listTitle || !PEMEX_LIST_TITLES.includes(body.listTitle as (typeof PEMEX_LIST_TITLES)[number])) {
    return NextResponse.json({ error: `listTitle must be one of: ${PEMEX_LIST_TITLES.join(", ")}` }, { status: 400 });
  }
  if (!body.buyer?.trim()) {
    return NextResponse.json({ error: "buyer is required" }, { status: 400 });
  }

  try {
    const result = await importPemexLive(body.listTitle, body.buyer.trim(), {
      write: body.write === true,
      months: body.months,
      procedureLabel: body.procedureLabel,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
