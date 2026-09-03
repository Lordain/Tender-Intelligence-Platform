// No "server-only" guard — same reasoning as compras-mx-connector.ts:
// imported directly by standalone scripts run via tsx outside Next.js.

/**
 * Resolves the real Compras MX detail-page URL for a procedure number,
 * via LicitIA's public API (https://licitia.com.mx/abierto/api) — a
 * third-party, independent mirror of Compras MX/CompraNet's own public
 * open data (LicitIA's own footer: "no está afiliado al Gobierno de
 * México"), not an official government source. Free, read-only, no API
 * key, 600 requests/minute/IP, CC BY 4.0 (the user found and shared this
 * documentation directly, 2026-09-03).
 *
 * Why this exists: compras-mx-open-tenders-mapper.ts's source export
 * (the "Difusión de procedimientos" browser export — see
 * lib/ingestion/README.md "The open-tenders-vs-contracts gap") has no
 * deep-link column, only the procedure number — so every still-open
 * tender's `sourceUrl` fell back to Compras MX's generic search page
 * rather than the specific procedure's own page. The real detail URL
 * (`.../sitiopublico/detalle/<id>/procedimiento`) embeds an internal
 * Compras MX database id with no derivable relationship to the procedure
 * number, and the only way to look that id up on Compras MX itself is
 * its anti-bot-gated detail API, which this project deliberately doesn't
 * scrape. LicitIA's `GET /licitaciones/{numero}` exposes that same id as
 * a plain `data.id` field — confirmed for real (2026-09-03) against
 * procedure LO-09-JZO-009JZO001-T-36-2026: LicitIA returned
 * `data.id: "0dd7aa0dd0c04125afc4a68b1de5d91c"`, exactly matching the
 * real Compras MX URL the user found by hand for that same procedure.
 *
 * Used only to build a link BACK to the real official
 * comprasmx.buengobierno.gob.mx page — LicitIA's own JSON content is not
 * stored or displayed anywhere on this platform, only this one id field.
 */

const LICITIA_BASE = "https://api.licitia.com.mx/api/open/v1";

type LicitiaLicitacionResponse = {
  success: boolean;
  data?: { id?: string };
};

export function buildComprasMxDetailUrl(comprasMxId: string): string {
  return `https://comprasmx.buengobierno.gob.mx/sitiopublico/#/sitiopublico/detalle/${comprasMxId}/procedimiento`;
}

/** Returns null when LicitIA doesn't have this procedure indexed (a real, expected case — LicitIA syncs from Compras MX daily, not instantly) or the request otherwise fails, rather than throwing — a single unresolved link shouldn't abort a batch backfill. */
export async function resolveComprasMxDetailUrl(procedureNumber: string): Promise<string | null> {
  const url = `${LICITIA_BASE}/licitaciones/${encodeURIComponent(procedureNumber)}.json`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const body = (await response.json()) as LicitiaLicitacionResponse;
  const id = body.data?.id;
  return typeof id === "string" && id.length > 0 ? buildComprasMxDetailUrl(id) : null;
}
