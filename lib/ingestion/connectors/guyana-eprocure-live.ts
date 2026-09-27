/**
 * Guyana's central procurement site — eprocure.gov.gy, run by the National
 * Procurement and Tender Administration Board (NPTAB), live since February
 * 2026. It replaced nptab.gov.gy, which no longer resolves (2026-09-27).
 *
 * ── The door ─────────────────────────────────────────────────────────────
 *
 * The public page is a shell that loads every open opportunity from one
 * Frappe method, the same call its own script makes:
 *
 *   GET /api/method/doctracker.api.powerbi.get_public_bid_opportunities
 *   → {"message": [ {project_id, project_name, agency, procurement_method,
 *      procurement_nature, estimated_value, current_state,
 *      advertisement_date, projected_bid_opening_date, regions,
 *      advertisement_documents: [{document_name, document_file}]} ]}
 *
 * No parameters, no paging: it returns what is advertised now (35 rows on
 * 2026-09-27, advertised 24 August – 21 September) and nothing that has
 * closed. `estimated_value` was 0 on every row.
 *
 * ── Why the notice PDF is read too ───────────────────────────────────────
 *
 * The row does not say how big a contract is or who may bid; the notice
 * does, in a sentence every one of them has: "International Competitive
 * Bidding (ICB)" or "National Competitive Bidding (NCB)", and for a
 * donor-financed contract the lender ("Caribbean Development Bank",
 * "Credit No.: IDA-77040"). The user keeps large works and large purchases
 * only (2026-09-27: 小项目不要，只要大型工程项目或者采购项目), and that
 * sentence is the one reliable size signal the source publishes — see
 * lib/relevance-guyana.ts. Text comes from poppler's `pdftotext`, the tool
 * document-intake.ts already depends on; where it is not installed — the web
 * host, which runs the admin page's manual import button — from unpdf
 * (pdf.js). On all 35 notices of 2026-09-27 the two gave the same facts. A
 * scanned notice has no text layer and reads as null either way.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getDocumentProxy } from "unpdf";

const execFileAsync = promisify(execFile);

export const GUYANA_EPROCURE_ORIGIN = "https://eprocure.gov.gy";
export const GUYANA_EPROCURE_LIST_URL = `${GUYANA_EPROCURE_ORIGIN}/`;
const API_URL = `${GUYANA_EPROCURE_ORIGIN}/api/method/doctracker.api.powerbi.get_public_bid_opportunities`;

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

const TIMEOUT_MS = 60_000;
/** A notice is one to three pages; anything past this is not a notice. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;
/** Pages read per notice — the competition and lender sentences are on the first. */
const MAX_NOTICE_PAGES = 4;

export type GuyanaOpportunity = {
  projectId: string;
  projectName: string;
  /** As published, with the numeric prefix: "34-Ministry of Public Utilities and Aviation". */
  agency: string;
  procurementMethod: string;
  procurementNature: string;
  procurementSubNature: string;
  currentState: string;
  /** YYYY-MM-DD */
  advertisementDate: string;
  /** YYYY-MM-DD — "Submission Deadline & Tender Opening - 9:00am on" this day. */
  bidOpeningDate: string | null;
  regions: string[];
  documents: { name: string; url: string }[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isoDate(value: unknown): string | null {
  const raw = text(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

/** One API row, or null when it lacks what every row has had (an id, a name and an advertisement date). */
export function parseGuyanaOpportunity(raw: unknown): GuyanaOpportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const projectId = text(row.project_id).trim();
  const projectName = text(row.project_name).trim();
  const advertisementDate = isoDate(row.advertisement_date);
  if (!projectId || !projectName || !advertisementDate) return null;
  const documents = (Array.isArray(row.advertisement_documents) ? row.advertisement_documents : [])
    .map((doc) => (doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {}))
    .map((doc) => ({ name: text(doc.document_name).trim() || "Advertisement", path: text(doc.document_file).trim() }))
    .filter((doc) => doc.path.startsWith("/files/") || doc.path.startsWith("/private/files/"))
    .map((doc) => ({ name: doc.name, url: `${GUYANA_EPROCURE_ORIGIN}${encodeURI(doc.path)}` }));
  return {
    projectId,
    projectName,
    agency: text(row.agency).trim(),
    procurementMethod: text(row.procurement_method).trim(),
    procurementNature: text(row.procurement_nature).trim(),
    procurementSubNature: text(row.procurement_sub_nature).trim(),
    currentState: text(row.current_state).trim(),
    advertisementDate,
    bidOpeningDate: isoDate(row.actual_bid_opening_date) ?? isoDate(row.projected_bid_opening_date),
    regions: Array.isArray(row.regions) ? row.regions.filter((region): region is string => typeof region === "string") : [],
    documents,
  };
}

export async function fetchGuyanaOpportunities(): Promise<GuyanaOpportunity[]> {
  const response = await fetch(API_URL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`eprocure.gov.gy 返回 HTTP ${response.status} ${response.statusText}`);
  const body = (await response.json().catch(() => null)) as { message?: unknown; exc?: unknown } | null;
  if (!body || body.exc || !Array.isArray(body.message)) throw new Error("eprocure.gov.gy 返回的不是招标清单（接口可能变了）");
  return body.message.map(parseGuyanaOpportunity).filter((row): row is GuyanaOpportunity => row !== null);
}

/**
 * The notice's text, or null when it cannot be read: a download failure, a
 * scanned notice with no text layer, or no `pdftotext` on this machine. Null
 * is an ordinary answer, never an exception — one unreadable notice must not
 * stop the import.
 */
export async function fetchNoticeText(url: string): Promise<string | null> {
  let dir: string | null = null;
  try {
    const response = await fetch(url, { headers: { ...HEADERS, Accept: "application/pdf" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString() !== "%PDF-") return null;
    let raw: string;
    try {
      dir = await mkdtemp(join(tmpdir(), "guyana-notice-"));
      const file = join(dir, "notice.pdf");
      await writeFile(file, bytes);
      raw = (await execFileAsync("pdftotext", ["-q", "-l", String(MAX_NOTICE_PAGES), file, "-"], { maxBuffer: 4 * 1024 * 1024 })).stdout;
    } catch (err) {
      // Only a missing binary falls through to pdf.js; a PDF that pdftotext
      // itself refuses is not one pdf.js will read better.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return null;
      raw = await pdfJsText(bytes);
    }
    const clean = raw.replace(/\s+/g, " ").trim();
    return clean.length >= 40 ? clean : null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The first MAX_NOTICE_PAGES pages' text through pdf.js, for a machine without pdftotext. */
async function pdfJsText(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  try {
    const pages: string[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, MAX_NOTICE_PAGES); number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return pages.join(" ");
  } finally {
    await pdf.loadingTask.destroy();
  }
}
