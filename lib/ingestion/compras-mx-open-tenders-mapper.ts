import type { Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { inferGovernmentLevelFromProcedureNumber, inferParticipationScope } from "@/lib/ingestion/heuristics";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";

/**
 * One row of a real "Difusión de procedimientos" export — the public
 * search page's own browser-side Excel export (CIUDADANÍA EN GENERAL →
 * DIFUSIÓN DE PROCEDIMIENTOS on comprasmx.buengobierno.gob.mx), confirmed
 * against a real file the user provided. This is the source that finally
 * closes the "contracts vs. open tenders" gap documented in README.md: it
 * lists procedures still in progress (no award/contract fields at all),
 * unlike compras-mx-contracts-mapper.ts's Datos Abiertos export, which we
 * verified (against the FULL 23,597-row 2025 file, not just a sample) is
 * exclusively post-ruling records.
 *
 * IMPORTANT: this is a manual browser export, not an API. The search
 * page's underlying JSON endpoint (`.../whitney/sitiopublico/expedientes`)
 * requires `grc`/`igrc`/`xgrc` request headers that are time-synced,
 * signed anti-automation tokens (paired with a `.../adele/.../reloj`
 * "clock" call) — a deliberate anti-scraping gate, not a plain API key.
 * This platform does not attempt to defeat that gate; this mapper only
 * ever reads a file a human already exported from their own browser
 * session, the same way the Datos Abiertos CSV is handled.
 *
 * Shares its slug scheme with compras-mx-contracts-mapper.ts on purpose —
 * see the comment on `slug` below.
 */
export type ComprasMxOpenTenderRow = {
  "NÚM."?: string;
  "NÚMERO DE IDENTIFICACIÓN"?: string;
  "CARÁCTER"?: string;
  "NOMBRE"?: string;
  "SIGLAS DEPENDENCIA O ENTIDAD"?: string;
  "ESTATUS"?: string;
  "FECHA JUNTA DE ACLARACIONES"?: string;
  "FECHA DE PRESENTACIÓN Y APERTURA DE PROPOSICIONES"?: string;
  "TIPO DE PUBLICACIÓN"?: string;
  "TIPO DE CONTRATACIÓN"?: string;
  "CÓDIGO DE EXPEDIENTE"?: string;
  "UNIDAD COMPRADORA"?: string;
  "ENTIDAD FEDERATIVA"?: string;
};

/**
 * The export's "Tipo de contratación" is one of a small, known set of
 * literal values (confirmed from the real file, not guessed) — an exact
 * lookup is more trustworthy here than a keyword regex, since e.g.
 * "SERVICIOS RELACIONADOS CON LA OBRA" contains both "servicio" and
 * "obra" and would be ambiguous under the regex approach the other
 * mappers use for messier free-text fields.
 */
const SCOPE_TYPE_BY_CONTRATACION: Record<string, TenderScopeType> = {
  "OBRA PÚBLICA": "works",
  ADQUISICIONES: "equipment",
  SERVICIOS: "services",
  "SERVICIOS RELACIONADOS CON LA OBRA": "consulting",
  ARRENDAMIENTOS: "equipment",
  "PRESTACIÓN DE SERVICIOS": "services",
};

function inferScopeType(tipoContratacion: string | undefined): TenderScopeType {
  if (!tipoContratacion) return "services";
  return SCOPE_TYPE_BY_CONTRATACION[tipoContratacion.toUpperCase().trim()] ?? "services";
}

/**
 * Real ESTATUS values, now confirmed against much larger real exports
 * (2026-09-04) than the small sample this function was originally written
 * from — that sample only ever showed VIGENTE and the three
 * clarification-phase variants below, so a bare `startsWith("EN ")`
 * heuristic looked safe. Two bigger files proved it wasn't:
 *
 * 1. The "Anuncios vigentes" (still-in-progress) tab, 1,791 rows: "EN
 *    APERTURA" / "EN EVALUACIÓN" / "EN DECISIÓN DE FALLO" all start with
 *    "EN " too, but they're PAST the clarification phase (submission
 *    already closed) — mapping them to "clarification" was actively wrong.
 *    "SUSPENDIDO" (162 of 1,791, ~9%) doesn't start with "EN " at all and
 *    was silently defaulting to "open" — showing a SUSPENDED procedure as
 *    currently biddable.
 * 2. The "Anuncios concluidos" (concluded) tab — same 13-column export
 *    format, confirmed real (2,000-row sample, 2026-09-04): every row was
 *    ADJUDICADO/ADJUDICADO PARCIAL. This means the "whole feed's domain is
 *    procedures still in progress" assumption the old default-to-"open"
 *    comment relied on no longer holds — this same mapper can now receive
 *    concluded-tab uploads too, where an unrecognized status defaulting to
 *    "open" would be far worse (100% wrong on the whole file, not a rare
 *    edge case). ADJUDICADO/ADJUDICADO PARCIAL are matched by substring
 *    (not an exact switch case) alongside a CANCEL/DESIERT substring catch
 *    for the plausible "cancelled"/"lot declared void" siblings of
 *    ADJUDICADO this 2,000-row sample didn't happen to contain — same
 *    substring-matching approach compranet5-mapper.ts already uses for its
 *    own "CANCEL" check, safer than hardcoding only the exact strings seen
 *    so far in a vocabulary this codebase hasn't fully enumerated.
 */
function inferStatus(estatus: string | undefined): TenderStatus {
  const normalized = estatus?.toUpperCase().trim();
  switch (normalized) {
    case "VIGENTE":
    case "PENDIENTE DE APERTURA":
      return "open";
    case "EN ACLARACIONES":
    case "EN REPREGUNTAS":
    case "EN ATENCIÓN DE PREGUNTAS":
      return "clarification";
    case "EN APERTURA":
    case "EN EVALUACIÓN":
    case "EN DECISIÓN DE FALLO":
      // Submission has already closed; the procedure is at/after the
      // bid-opening event, awaiting a ruling — "clarification" would
      // wrongly suggest it's still in the pre-submission Q&A phase.
      return "submission_closed";
    case "SUSPENDIDO":
      // No dedicated "suspended" status in this platform's TenderStatus —
      // "cancelled" is the closest fit and, just as importantly, is
      // excluded from the tender list's default status filter the same
      // way "open"/"clarification" tenders are shown by default (see
      // DEFAULT_STATUSES in TenderExplorer.tsx) — a suspended procedure
      // no longer belongs in the default "currently biddable" view.
      return "cancelled";
  }
  if (normalized?.includes("ADJUDICA")) return "awarded";
  if (normalized?.includes("CANCEL") || normalized?.includes("DESIERT")) return "cancelled";
  // Unrecognized (e.g. the rare "EN OSD", 2 of 1,791 rows in the vigentes
  // tab, meaning unconfirmed) — "open" remains the safer wrong guess for
  // the still-in-progress tab; a concluded-tab upload with a genuinely
  // unrecognized status is the one real remaining risk this can't rule
  // out, since there's no third bucket to fall back to here.
  return "open";
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;

  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const generic = new Date(raw);
  if (!Number.isNaN(generic.getTime())) return generic.toISOString();

  return null;
}

function buildKeyDates(row: ComprasMxOpenTenderRow, tenderNumber: string): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [];
  const clarification = parseDate(row["FECHA JUNTA DE ACLARACIONES"]);
  const submission = parseDate(row["FECHA DE PRESENTACIÓN Y APERTURA DE PROPOSICIONES"]);

  if (clarification) {
    dates.push({ id: `${tenderNumber}-clarification`, type: "clarification", date: clarification });
  }
  if (submission) {
    // The column name literally combines "presentación y apertura" (submission
    // and opening happen at the same event in this procedure type), so both
    // key-date types point at the same real timestamp rather than guessing
    // a separate opening date we don't have.
    dates.push({ id: `${tenderNumber}-submission`, type: "submission", date: submission });
    dates.push({ id: `${tenderNumber}-opening`, type: "opening", date: submission });
  }

  return dates;
}

export function mapComprasMxOpenTenderRowToTender(
  row: ComprasMxOpenTenderRow,
  sourceName: string,
  sourceUrl: string,
): Tender | null {
  const tenderNumber = row["NÚMERO DE IDENTIFICACIÓN"]?.trim() || row["CÓDIGO DE EXPEDIENTE"]?.trim();
  const title = row["NOMBRE"]?.trim();
  const buyer = row["SIGLAS DEPENDENCIA O ENTIDAD"]?.trim();
  if (!tenderNumber || !title || !buyer) return null;

  const submissionDeadline = parseDate(row["FECHA DE PRESENTACIÓN Y APERTURA DE PROPOSICIONES"]);
  const scopeType = inferScopeType(row["TIPO DE CONTRATACIÓN"]);
  const industries = classifyIndustries(title, buyer);

  // The export has no publication-date column at all (unlike the awarded-
  // contracts export) — using the ingestion timestamp is an honest "when we
  // first saw this" proxy rather than a fabricated publication date; see
  // README.md for why this can't be sourced any other way right now.
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    // Deliberately the SAME slug scheme as compras-mx-contracts-mapper.ts
    // (`comprasmx-${slugify(tenderNumber)}`, same field priority: procedure
    // number, then expediente code) — confirmed against both real files
    // that "Código del expediente"/"CÓDIGO DE EXPEDIENTE" and "Número de
    // procedimiento"/"NÚMERO DE IDENTIFICACIÓN" use the identical format
    // across sources (e.g. "E-2025-00038653", "IA-12-NEF-012NEF001-I-30-2025").
    // That means when a tender ingested here as still-open later gets
    // awarded and shows up in a Datos Abiertos contracts export, upserting
    // that file updates THIS SAME row (status → awarded, award date, value
    // filled in) instead of creating a second, orphaned "open" duplicate
    // that never gets cleaned up.
    slug: `comprasmx-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer,
    country: "Mexico",
    governmentLevel: inferGovernmentLevelFromProcedureNumber(tenderNumber, buyer),
    industries,
    scopeType,
    procedureType: row["TIPO DE PUBLICACIÓN"]?.trim() || "Unknown",
    participationScope: inferParticipationScope(row["CARÁCTER"]),
    publicationDate: now,
    publicationDateIsEstimated: true,
    submissionDeadline: submissionDeadline ?? undefined,
    location: row["ENTIDAD FEDERATIVA"]?.trim(),
    status: inferStatus(row["ESTATUS"]),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(row, tenderNumber),
    risks: [],
    relevance: classifyRelevance({ title, industries, scopeType, buyer }),
    sourceName,
    sourceUrl,
    createdAt: now,
    updatedAt: now,
  };
}
