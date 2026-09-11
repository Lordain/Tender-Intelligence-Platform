/**
 * Fetches ProInversión's Obras por Impuestos convocatorias straight from the
 * endpoint the "Exportar a Excel" button calls, instead of a file a human
 * downloaded.
 *
 * Endpoint and payload captured by the user from their own browser
 * (2026-09-11, DevTools → Network → Exportar a Excel): a multipart POST to
 * the site's own theme-level service, same-origin, no API key and no
 * authorization header — the cookies in the captured request are analytics
 * and language, not a session, so they are deliberately not replayed here.
 *
 * The field set is sent exactly as the page sends it rather than trimmed to
 * what looks necessary: this is an undocumented internal endpoint, a missing
 * field is as likely to change the result silently as to error, and the
 * captured shape is the only one confirmed to return all 422 rows.
 * `EstadoConvocatoria=4041` is what the page sends for the "En Proceso"
 * filter that produced that file.
 *
 * NOT verifiable from this project's sandbox — investinperu.pe is blocked by
 * the network egress policy here, so unlike the OECE connector this one has
 * never been run against the live host by the author. It is written to the
 * captured request and must be confirmed by a real run on the user's machine
 * before anything it returns is trusted; readPeruOxiFile's header-anchor
 * check is the backstop that makes a changed response fail loudly.
 */
const OXI_EXPORT_URL =
  "https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/oxi/selectionprocessesExport.php";

const OXI_LISTING_PAGE = "https://www.investinperu.pe/inversiones-seleccion-oxi/";

/** Exactly the fields the page posts, in the page's own order. */
const EXPORT_FIELDS: [string, string][] = [
  ["Codigo", ""],
  ["Nombre", ""],
  ["SectorList", ""],
  ["TipologiaList", ""],
  ["AnoInicial", ""],
  ["AnoFinal", ""],
  ["MontoInicial", "0"],
  ["MontoFinal", "5000000000"],
  ["DepartamentoCodigo", "00"],
  ["ProvinciaCodigo", "0000"],
  ["DistritoCodigo", "000000"],
  ["NivelGobierno", ""],
  ["TipoProyecto", ""],
  ["TipoConvocatoriaList", ""],
  ["EstadoConvocatoria", "4041"],
  ["Lan", "es"],
  ["Page", "1"],
  ["PageLimit", "9"],
];

/** XLSX files are ZIP archives; every one starts "PK\x03\x04". */
function looksLikeXlsx(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/**
 * Returns the raw .xlsx bytes, ready for readPeruOxiFile().
 *
 * Handles both plausible response shapes, because the captured request sends
 * `Accept: application/json` while the button produces a file: the endpoint
 * may return the workbook directly, or JSON naming a generated file to
 * download. Anything else throws with the beginning of the body attached, so
 * a redesigned endpoint or an interstitial reads as a real failure instead of
 * a zero-row import.
 */
export async function downloadOxiExport(): Promise<Buffer> {
  const form = new FormData();
  for (const [name, value] of EXPORT_FIELDS) form.append(name, value);

  const response = await fetch(OXI_EXPORT_URL, {
    method: "POST",
    body: form,
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://www.investinperu.pe",
      Referer: OXI_LISTING_PAGE,
    },
  });
  if (!response.ok) {
    throw new Error(`OxI export responded ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (looksLikeXlsx(buffer)) return buffer;

  const text = buffer.toString("utf-8");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(
      `OxI export returned neither an .xlsx nor JSON (${buffer.length} bytes). First 300 chars: ${text.slice(0, 300)}`,
    );
  }

  const fileUrl = findFileUrl(payload);
  if (!fileUrl) {
    throw new Error(`OxI export returned JSON with no downloadable file URL in it: ${text.slice(0, 300)}`);
  }
  const absolute = fileUrl.startsWith("http") ? fileUrl : new URL(fileUrl, OXI_LISTING_PAGE).toString();
  const fileResponse = await fetch(absolute, { headers: { Referer: OXI_LISTING_PAGE } });
  if (!fileResponse.ok) {
    throw new Error(`OxI export file download responded ${fileResponse.status} ${fileResponse.statusText} for ${absolute}`);
  }
  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
  if (!looksLikeXlsx(fileBuffer)) {
    throw new Error(`OxI export file at ${absolute} is not an .xlsx (${fileBuffer.length} bytes).`);
  }
  return fileBuffer;
}

/** First string anywhere in the payload that looks like a path to the generated workbook. */
function findFileUrl(payload: unknown): string | undefined {
  if (typeof payload === "string") return /\.xlsx?(\?|$)/i.test(payload) ? payload : undefined;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findFileUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (payload && typeof payload === "object") {
    for (const value of Object.values(payload)) {
      const found = findFileUrl(value);
      if (found) return found;
    }
  }
  return undefined;
}
