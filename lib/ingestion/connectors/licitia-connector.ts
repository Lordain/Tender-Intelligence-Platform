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
 *
 * Real request shape (verified 2026-09-03 against this exact procedure,
 * after a real batch run came back 0/591 resolved and the user curl'd
 * both variants to compare): appending `.json` to the path — this
 * file's original guess, based on the docs' own "Formatos por página"
 * wording — is WRONG and returns a real 404
 * (`{"success":false,"error":{"code":"NOT_FOUND",...}}`) for every
 * procedure, indexed or not. The real way to get JSON is the bare path
 * (`/licitaciones/{numero}`, no suffix) with `Accept: application/json`
 * — confirmed returning the full real record. Content negotiation via
 * header only; the `.json`/`.md` suffixes the docs mention are a
 * different mechanism this endpoint doesn't accept the same way (not
 * investigated further since the header alone works).
 */

const LICITIA_BASE = "https://api.licitia.com.mx/api/open/v1";

type LicitiaLicitacionResponse = {
  success: boolean;
  data?: { id?: string };
};

export function buildComprasMxDetailUrl(comprasMxId: string): string {
  return `https://comprasmx.buengobierno.gob.mx/sitiopublico/#/sitiopublico/detalle/${comprasMxId}/procedimiento`;
}

/**
 * "not_found" is the real, expected case (LicitIA syncs from Compras MX
 * daily, not instantly) — a 404 or a response with no `data.id`.
 * "error" is everything else (network failure, a non-404 non-2xx status,
 * a response that didn't parse as JSON) and carries a real message —
 * 2026-09-03: the first version of this function collapsed every one of
 * these into a bare `null`, and a real batch run against 526 tenders
 * came back 0/526 resolved with no way to tell whether that meant
 * "genuinely not indexed" or "every request is silently failing" (it
 * turned out to be the latter — see resolve-comprasmx-links.ts's
 * now-surfaced error messages for the real cause). A single unresolved
 * link still shouldn't abort a batch backfill, so this returns a typed
 * result instead of throwing — but the caller can now actually see why.
 */
export type ResolveComprasMxDetailUrlResult =
  | { status: "resolved"; detailUrl: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function resolveComprasMxDetailUrl(procedureNumber: string): Promise<ResolveComprasMxDetailUrlResult> {
  const url = `${LICITIA_BASE}/licitaciones/${encodeURIComponent(procedureNumber)}`;

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (response.status === 404) return { status: "not_found" };
  if (!response.ok) return { status: "error", message: `HTTP ${response.status} ${response.statusText}` };

  let body: LicitiaLicitacionResponse;
  try {
    body = (await response.json()) as LicitiaLicitacionResponse;
  } catch (err) {
    return { status: "error", message: `response wasn't valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }

  const id = body.success ? body.data?.id : undefined;
  return typeof id === "string" && id.length > 0
    ? { status: "resolved", detailUrl: buildComprasMxDetailUrl(id) }
    : { status: "not_found" };
}
