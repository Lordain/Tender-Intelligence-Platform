import AdmZip from "adm-zip";
import type { OeceRecordPackage } from "@/lib/ingestion/peru-oece-mapper";

/**
 * Live-fetches Peru's real OECE (formerly OSCE) open contracting data —
 * confirmed real end-to-end by the user directly (see
 * peru-oece-mapper.ts's header comment). Base URL confirmed real via a
 * live `Try it out` + `Execute` run in the user's own browser against
 * the Swagger docs at `contratacionesabiertas.oece.gob.pe/api`.
 *
 * `GET /file/{source}/{type}/{year}/{month}` returns a real ZIP archive
 * (`content-type: application/zip`) containing one JSON file with that
 * month's OCDS record package — genuinely unauthenticated, no anti-bot
 * gate encountered.
 */
const OECE_BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1";

export type OeceFileListing = {
  id: string;
  year: string;
  month: string;
  monthName: string;
  source: string;
  timestamp: string;
  files: { csv?: string; xlsx?: string; json?: string; sha?: string };
};

/**
 * `GET /files` — real response confirmed by the user: `{ "results": [...] }`,
 * most recent entry at the time `seace_v3-2026-08` (generated
 * 2026-09-01) — i.e. genuinely current, roughly a one-month lag.
 * `page` mirrors the real query param seen in the Swagger UI.
 */
export async function listOeceFiles(page = 1): Promise<OeceFileListing[]> {
  const url = new URL(`${OECE_BASE_URL}/files`);
  url.searchParams.set("page", String(page));

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`OECE /files responded ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { results: OeceFileListing[] };
  return body.results ?? [];
}

/**
 * Downloads one month's real ZIP and extracts the single JSON entry
 * inside it — confirmed real shape from the user's own download
 * (`2026-08_seace_v3_json.zip`, `content-disposition: attachment`).
 * Throws if the ZIP doesn't contain exactly the expected single `.json`
 * entry, rather than silently picking the wrong file.
 */
export async function downloadOeceRecordPackage(
  source: string,
  year: string,
  month: string,
): Promise<OeceRecordPackage> {
  const url = `${OECE_BASE_URL}/file/${source}/json/${year}/${month}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OECE file download responded ${response.status} ${response.statusText} for ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  const zip = new AdmZip(Buffer.from(arrayBuffer));
  const jsonEntries = zip.getEntries().filter((entry) => entry.entryName.toLowerCase().endsWith(".json"));
  if (jsonEntries.length !== 1) {
    throw new Error(
      `Expected exactly one .json entry in the OECE zip for ${source}/${year}/${month}, found ${jsonEntries.length}`,
    );
  }

  const data = JSON.parse(jsonEntries[0].getData().toString("utf-8")) as OeceRecordPackage;
  return { records: Array.isArray(data.records) ? data.records : [] };
}
