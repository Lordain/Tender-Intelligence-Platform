import type { PemexConcursoItem } from "@/lib/ingestion/pemex-mapper";

const PEMEX_SITE_ORIGIN = "https://www.pemex.com";
const CONCURSOS_ROOT_PATH = "/procura/procedimientos-de-contratacion/concursosabiertos";
const SELECT_FIELDS = "Id,Title,descripcion,inicio,vencimiento,tipoevento,tiposuministro,areacontratante,Created,Modified,Attachments";

/**
 * Live, server-side equivalent of the browser Console script documented
 * in lib/ingestion/README.md's "Technique 3" — same URL, same $select,
 * same pagination via odata.nextLink. Confirmed real 2026-09-03
 * (pemex-mapper.ts's own header comment): PEMEX's SharePoint site allows
 * fully anonymous REST access, no anti-bot layer, no cookies/session
 * needed — the reason a plain server-side fetch() works at all here,
 * unlike Compras MX/Proyectos Estratégicos MX's grc/igrc/xgrc-gated APIs.
 * CORS (a browser-only restriction) never applied to this endpoint
 * either way, but running server-side removes the manual "open DevTools,
 * paste a script, download a file" step entirely — admin only picks a
 * list and clicks a button.
 *
 * NOT yet exercised against the real endpoint from this session (this
 * sandbox has no network egress to pemex.com) — the URL/params/headers
 * are copied exactly from the browser script real captures this session
 * already confirmed work, but the very first live run of this specific
 * function should be watched for a real response before trusting it at
 * scale.
 */
export async function fetchPemexList(listTitle: string): Promise<PemexConcursoItem[]> {
  const base = `${PEMEX_SITE_ORIGIN}${CONCURSOS_ROOT_PATH}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items`;
  let url: string | null = `${base}?$select=${SELECT_FIELDS}&$top=5000&$orderby=Modified desc`;

  const all: PemexConcursoItem[] = [];
  while (url) {
    const res = await fetch(url, { headers: { Accept: "application/json;odata=nometadata" } });
    if (!res.ok) {
      throw new Error(`PEMEX list "${listTitle}" request failed: HTTP ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { value: PemexConcursoItem[]; "odata.nextLink"?: string };
    all.push(...(data.value ?? []));
    url = data["odata.nextLink"] ?? null;
  }
  return all;
}

/**
 * One item's attachments, from the same anonymous SharePoint API the list
 * itself comes from. PEMEX publishes the Convocatoria, the Bases and their
 * annexes as real attachments on each Concurso Abierto item — the same files
 * the site's own "Ver documentos" popup lists — so 批量下载标书 can serve
 * PEMEX exactly the way it serves Peru's SEACE.
 *
 * Deliberately a SECOND pass rather than `$expand=AttachmentFiles` on the list
 * query. Folding it in would be one request instead of N, but this endpoint
 * cannot be exercised from the dev sandbox (no egress to pemex.com), and if
 * the expand were refused the whole tender import would fail with it. Kept
 * separate, a failure here costs the links and nothing else.
 */
export type PemexAttachmentFile = { FileName: string; ServerRelativeUrl: string };

export async function fetchPemexAttachments(listTitle: string, itemId: number): Promise<PemexAttachmentFile[]> {
  const url = `${PEMEX_SITE_ORIGIN}${CONCURSOS_ROOT_PATH}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${itemId})/AttachmentFiles`;
  const res = await fetch(url, { headers: { Accept: "application/json;odata=nometadata" } });
  if (!res.ok) {
    throw new Error(`PEMEX attachments for item ${itemId} responded ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { value?: PemexAttachmentFile[] };
  return data.value ?? [];
}

/**
 * A ServerRelativeUrl is site-root-relative ("/procura/.../Attachments/123/
 * 02. Bases_CON-114-2026.pdf"); the download needs an absolute one.
 *
 * Normalised through URL so the spaces and accents PEMEX puts in its filenames
 * are percent-encoded once, here, rather than at some later call site: the
 * stored URL is half of tender_document_links' uniqueness key, and an encoded
 * and an unencoded spelling of the same file would otherwise be two rows and
 * two downloads.
 */
export function pemexAttachmentUrl(serverRelativeUrl: string): string {
  const absolute = serverRelativeUrl.startsWith("http") ? serverRelativeUrl : `${PEMEX_SITE_ORIGIN}${serverRelativeUrl}`;
  try {
    return new URL(absolute).href;
  } catch {
    return absolute;
  }
}
