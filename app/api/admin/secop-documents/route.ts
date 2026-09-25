import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { SECOP_PROCESS_ID } from "@/lib/secop-links";
import { extractNoticeUidFromUrl } from "@/lib/ingestion/colombia-mapper";
import { fetchSecopProcesoById } from "@/lib/ingestion/connectors/colombia-secop-live";
import { fetchSecopDocumentsForProcess, isPreAwardDocument } from "@/lib/ingestion/connectors/colombia-documents-connector";

export const runtime = "nodejs";

/** Enough to cover a whole licitación pack (29 files on the tender that prompted this) without turning the row into a page. */
const MAX_LISTED = 30;

export type SecopDocumentListResponse = {
  /** Set when SECOP has published the public page since our last refresh — the row's 官方入口 is then just stale. */
  officialUrl?: string;
  /** Pre-award files on record, before the MAX_LISTED cut. */
  total: number;
  documents: { id: string; name: string; sizeKb?: number; uploadedAt?: string; url: string }[];
  /** The full, unfiltered file list on datos.gov.co, for when total > MAX_LISTED. */
  fullListUrl?: string;
};

/**
 * The official files of a Colombian tender that has no public SECOP page yet
 * (lib/secop-links.ts) — for /admin/documents-needed, where 官方入口 would
 * otherwise open a raw API row.
 *
 * Only lists links; downloading stays in the admin's own browser. SECOP's
 * file host answers a datacenter IP with an Azure gateway 403 (measured
 * 2026-09-25), and a person's browser is what it is there to serve.
 *
 * Two datos.gov.co reads per click, none on page load: the list is fetched
 * when the admin opens it, not for every row of the worklist.
 */
export async function GET(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const idDelProceso = new URL(request.url).searchParams.get("process")?.trim() ?? "";
  if (!SECOP_PROCESS_ID.test(idDelProceso)) {
    return NextResponse.json({ error: "process 应为 SECOP 流程编号，例如 CO1.REQ.11032432" }, { status: 400 });
  }

  try {
    const proceso = await fetchSecopProcesoById(idDelProceso);
    if (!proceso) return NextResponse.json({ error: `哥伦比亚开放数据里找不到 ${idDelProceso}` }, { status: 404 });

    const officialUrl = extractNoticeUidFromUrl(proceso.urlproceso?.url) ? proceso.urlproceso?.url : undefined;
    const portfolioId = proceso.id_del_portafolio?.trim();
    const rows = portfolioId ? (await fetchSecopDocumentsForProcess(portfolioId)).filter(isPreAwardDocument) : [];

    const documents: SecopDocumentListResponse["documents"] = [];
    for (const row of rows) {
      const url = row.url_descarga_documento?.url;
      if (!url || !row.nombre_archivo) continue;
      const bytes = Number(row.tamanno_archivo);
      documents.push({
        id: row.id_documento ?? url,
        name: row.nombre_archivo,
        sizeKb: Number.isFinite(bytes) && bytes > 0 ? Math.max(1, Math.round(bytes / 1024)) : undefined,
        uploadedAt: row.fecha_carga?.slice(0, 10),
        url,
      });
    }

    const body: SecopDocumentListResponse = {
      officialUrl,
      total: documents.length,
      documents: documents.slice(0, MAX_LISTED),
      fullListUrl: portfolioId ? `https://www.datos.gov.co/resource/dmgg-8hin.json?proceso=${encodeURIComponent(portfolioId)}` : undefined,
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: `读取哥伦比亚开放数据失败：${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
