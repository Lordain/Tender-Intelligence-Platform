import type { OcdsRelease, OcdsReleasePackage, SourceConnector } from "@/lib/ingestion/types";

// No "server-only" guard here: this module is imported directly by
// standalone ingestion scripts (scripts/*.ts) run via tsx outside of
// Next.js, and the "server-only" package throws unconditionally under
// plain Node execution — it only no-ops when Next.js's bundler sets the
// special "react-server" export condition. Nothing client-side imports
// this module anyway, so the guard isn't needed for safety here.

/**
 * UNVERIFIED PLACEHOLDER. This session had no network access to confirm the
 * real base URL, query parameters, pagination shape, or auth requirements
 * of Mexico's official OCDS API ("Contrataciones Abiertas" —
 * gob.mx/contratacionesabiertas, documented in a PDF guide at
 * transparenciapresupuestaria.gob.mx). Do not assume this fetch call works
 * as written — confirm the real contract against that guide first, then
 * adjust the URL construction and response parsing below. See
 * lib/ingestion/README.md for the full picture.
 */
export function createComprasMxConnector(): SourceConnector {
  const baseUrl = process.env.COMPRAS_MX_OCDS_API_URL;

  return {
    sourceName: "Contrataciones Abiertas (OCDS) — Compras MX",
    async fetchReleases({ updatedSince } = {}): Promise<OcdsRelease[]> {
      if (!baseUrl) {
        throw new Error(
          "COMPRAS_MX_OCDS_API_URL is not set. This connector is an unverified placeholder " +
            "— see lib/ingestion/README.md before configuring it against the real API.",
        );
      }

      const url = new URL(baseUrl);
      if (updatedSince) url.searchParams.set("dateFrom", updatedSince);

      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`Compras MX OCDS API responded ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OcdsReleasePackage;
      return data.releases ?? [];
    },
  };
}
