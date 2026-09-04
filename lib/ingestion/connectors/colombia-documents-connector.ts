/**
 * Fetches real SECOP II (Colombia) tender document metadata and file
 * bytes. Confirmed real and genuinely automatable — unlike Compras MX
 * (Mexico), which is anti-bot gated (see README.md), and unlike PEMEX
 * (Mexico), whose attachments connector deliberately only records
 * references, never downloading bytes. Both halves here were confirmed
 * real by the user directly: the metadata dataset (Socrata resource
 * `dmgg-8hin`, "SECOP II - Archivos Descarga Desde 2025" on
 * datos.gov.co) returned real rows from a direct unauthenticated
 * request, and one real document's actual bytes downloaded successfully
 * in an incognito browser window (no login) — file size matched the
 * dataset's own `tamanno_archivo` field exactly (29155 bytes).
 *
 * Files downloaded here are NOT re-served to this platform's own users —
 * per explicit product direction, the site never offers tender document
 * downloads, only the structured information Layer 2 extracts from them.
 * So this module (and the ingest script that calls it) never populates
 * `tender_documents.storage_url`; only `source_url` (the real government
 * download link, for provenance) and `content_hash` (for dedup) matter
 * here, same posture already used for PEMEX's real attachment references.
 */

const METADATA_BASE_URL = "https://www.datos.gov.co/resource/dmgg-8hin.json";

export type SecopDocumentRow = {
  id_documento?: string;
  n_mero_de_contrato?: string;
  proceso?: string;
  nombre_archivo?: string;
  tamanno_archivo?: string;
  extensi_n?: string;
  descripci_n?: string;
  fecha_carga?: string;
  entidad?: string;
  nit_entidad?: string;
  url_descarga_documento?: { url?: string };
};

/**
 * `proceso` is the real SECOP process id (e.g. "CO1.BDOS.10288373") —
 * the same shape as `id_del_proceso` in the main SECOP II process
 * dataset (`colombia-mapper.ts`'s `p6dx-8zbt`), NOT necessarily the same
 * as a tender's `tenderNumber` (which prefers `referencia_del_proceso` —
 * a human-assigned reference, often differently formatted). Callers must
 * pass the real process id directly rather than assuming it can always
 * be derived from an already-ingested tender's `tenderNumber` — not
 * verified either way yet, so not assumed.
 */
export async function fetchSecopDocumentsForProcess(procesoId: string): Promise<SecopDocumentRow[]> {
  const url = new URL(METADATA_BASE_URL);
  url.searchParams.set("proceso", procesoId);
  url.searchParams.set("$limit", "200");

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`SECOP documents API responded ${response.status} ${response.statusText} for proceso=${procesoId}`);
  }
  return (await response.json()) as SecopDocumentRow[];
}

/**
 * Unfiltered sample of the archivos-metadata dataset — used purely as a
 * diagnostic (see ingest-colombia.ts's call site) to print real `proceso`
 * values next to real `id_del_proceso` values from the process dataset,
 * since the first real bulk run (2026-09-04) got 0 matching rows for all
 * 499 candidates and this is the fastest way to eyeball whether the two
 * datasets' ids are actually the same shape/namespace or not.
 */
export async function fetchSecopDocumentsSample(limit = 5): Promise<SecopDocumentRow[]> {
  const url = new URL(METADATA_BASE_URL);
  url.searchParams.set("$limit", String(limit));

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`SECOP documents API sample responded ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as SecopDocumentRow[];
}

/**
 * `n_mero_de_contrato` (contract number) present vs. absent is a real,
 * structural signal for pre-award (tender/bidding-stage) vs. post-award
 * (contract-management) documents — confirmed against the one real
 * "clean" pre-award example seen (a market-analysis study, no contract
 * number) against four real post-award ones (payment receipts, a
 * supervisor designation, an insurance certificate — all four carried a
 * contract number). Only pre-award documents are useful for Layer 2
 * (helping a company decide whether to bid); this needs broadening once
 * more real data is seen — thin evidence (n=1) for the "clean" case.
 */
export function isPreAwardDocument(row: SecopDocumentRow): boolean {
  return !row.n_mero_de_contrato?.trim();
}

export async function downloadSecopDocument(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Document download responded ${response.status} ${response.statusText} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
