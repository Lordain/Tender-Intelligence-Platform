/**
 * What a SEACE link is worth outside the browser session that made it.
 *
 * SEACE's per-tender page is
 * `prod2.seace.gob.pe/seacebus-uiwd-pub/fichaSeleccion/fichaSeleccion.xhtml?id=<uuid>&ptoRetorno=LOCAL`.
 * It looks like a permalink and is not one. The user added these by hand
 * (2026-09-15) and reported them dead three days later, with the detail that
 * settles the mechanism: 加的时候能用，但是现在再点击用不了.
 *
 * That rules out the reading the symptom first suggests — that a tender's
 * page expires when the procedure closes. Under that theory the links would
 * die one at a time, each on its own schedule, and a freshly-added one would
 * still work. Instead every one of them died, including recent ones, while
 * each worked at the moment it was pasted. What is common to "the moment it
 * was pasted" is not the tender's age: it is that the browser had just walked
 * through the buscador. The screenshot shows the same thing from the other
 * side — the page renders its full shell, every label present, every value
 * blank, `Monto del Derecho de Participacion: GRATUITO` (a default, not a
 * record), and Cronograma reporting `No se encontraron Datos`. That is a
 * backing bean that was constructed and never populated, not a 404 and not a
 * withdrawn notice. The `id` is a key into server-side state that only exists
 * for a session that performed the search; `ptoRetorno=LOCAL` ("return point")
 * is a navigation breadcrumb for that same flow.
 *
 * NOT REPRODUCED FROM HERE: this sandbox has no egress to seace.gob.pe (the
 * proxy refuses CONNECT), so the above was read off the evidence rather than
 * tested. The user's own research (2026-09-18) confirms it and supplies the
 * failure's other end — a ficha whose session is gone lands on
 * `fichaSeleccion.xhtml?id=null`, the error page for exactly this.
 *
 * That research also names a SECOND, independent way these links die, and it
 * is the one that matters for the code below: OECE periodically reorganizes
 * SEACE's paths and hostnames, and has already moved the public search route
 * once. When that happens, old links break regardless of sessions.
 *
 * Which is almost certainly what the two hostnames in this repo were — the
 * feed's `prodapp2` and the browser's `prod2` are the before and after of one
 * such migration, not two live servers. So the constant below is written once
 * and imported everywhere rather than pasted into each mapper and page: the
 * next migration should be a one-line change, and the reason the old spelling
 * lingered for months is that it was written in four places.
 *
 * Either way the operational conclusion holds without the diagnosis being
 * right: a URL that only resolves inside the session that created it cannot
 * be the public 官方入口 button, because every reader arrives cold.
 */

/**
 * The entry point every Peru tender falls back to.
 *
 * Host note: the repo carried BOTH `prod2` and `prodapp2` spellings. This is
 * the one the user is browsing today (2026-09-18) and the one they named; the
 * other comes from OECE's own `sources[0].url`, which apparently still
 * advertises the pre-migration host. Neither could be tested from here, so
 * this normalizes on the one with a live sighting over the one the feed
 * asserts — a feed that is demonstrably behind on this exact field.
 *
 * If SEACE moves again, change this line. Everything else derives from it.
 */
export const SEACE_PUBLIC_SEARCH_URL =
  "https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml";

/** A per-tender SEACE ficha deep link — the kind that dies with its session. */
export function isSeaceFichaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/(^|\.)seace\.gob\.pe$/i.test(parsed.hostname)) return false;
  return /fichaSeleccion/i.test(parsed.pathname);
}

/** A SEACE public search page on any of its hostnames. */
export function isSeaceSearchUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!/(^|\.)seace\.gob\.pe$/i.test(parsed.hostname)) return false;
  return /buscadorPublico/i.test(parsed.pathname);
}

/**
 * The URL a Peru tender's 官方入口 button should carry.
 *
 * Returns null when `url` is already fine and needs no rewrite, so a caller
 * can tell "changed it" from "left it alone" without comparing strings — the
 * scripts that use this report counts, and a no-op counted as a change reads
 * as work that did not happen.
 */
export function correctedSeaceSourceUrl(url: string | null | undefined): string | null {
  if (isSeaceFichaUrl(url)) return SEACE_PUBLIC_SEARCH_URL;
  // A search URL on the other hostname, or with the session junk still
  // attached, is normalized too — otherwise the next import reintroduces the
  // second spelling and this fix only holds until morning.
  if (isSeaceSearchUrl(url) && url !== SEACE_PUBLIC_SEARCH_URL) return SEACE_PUBLIC_SEARCH_URL;
  return null;
}
