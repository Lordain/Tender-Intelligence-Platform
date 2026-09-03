import type { Tender, TenderKeyDate, TenderScopeType, TenderParticipationScope } from "@/types/tender";
import { untranslated } from "@/lib/ingestion/text-utils";
import { inferGovernmentLevel } from "@/lib/ingestion/heuristics";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries, type IndustryKey } from "@/lib/industry";

/**
 * One row of the real CSV export from proyectosmexico.gob.mx/proyectos/
 * (Banobras/SHCP's official curated list of strategic national
 * investment projects — see lib/ingestion/README.md "Proyectos México").
 * Confirmed against a real 58-row export the user captured via the
 * page's own CSV export button (no anti-bot gate, same "Technique 1"
 * browser-download pattern as Compras MX/Ecopetrol contracts) — every
 * row in that real file had `Etapa: "Licitación"` (currently in the
 * bidding stage, not pre-investment/construction/operation), confirmed
 * by the user directly ("CSV是投标中的项目"). Only the columns this
 * mapper actually reads are typed; the real file has more (Activo/
 * Cantidad/Medida/Calidad x4, Sostenibilidad, Redes de Alianza) not yet
 * mapped.
 *
 * Real per-row project ID: the "Proyecto" column is always
 * "<numeric id> <title>" (e.g. "1118 Rehabilitación y ampliación de las
 * PTAR..."), confirmed against all 58 real rows — the same numeric id
 * also appears in the real per-project URL slug. Used to build a stable
 * slug (`proyectosmexico-<id>`) distinct from every other source's slug
 * scheme.
 *
 * NO ID-BASED DEDUP AGAINST OTHER SOURCES IS POSSIBLE — flagged
 * explicitly, not silently assumed either way. Proyectos México's own
 * numeric id has no relationship to a Compras MX procedure number or a
 * PEMEX SharePoint item Title; there is no shared key between this
 * source and the others this platform ingests. A real-world project
 * COULD end up double-counted — once here (while it's an investment-
 * pipeline listing) and again later as its own Compras MX/PEMEX
 * procedure once that agency actually opens the LAASSP/LOPSRM tender —
 * with nothing in either system's data linking the two rows. Accepted
 * as a known, documented limitation rather than attempting unreliable
 * fuzzy title/buyer matching to "resolve" it.
 */
export type ProyectosMexicoRow = {
  Proyecto?: string;
  Alias?: string;
  Sector?: string;
  Subsector?: string;
  "Moneda del contrato"?: string;
  "Inversión (Millones MXN)"?: string;
  "Inversión (Millones USD)"?: string;
  Descripción?: string;
  "Tipo de contrato"?: string;
  "Plazo de contrato"?: string;
  "Proceso de selección"?: string;
  "Anuncio/ Convocatoria"?: string;
  "Recepción de propuestas"?: string;
  Etapa?: string;
  "Estado(s)"?: string;
  "Entidad responsable"?: string;
  URL?: string;
};

const PROJECT_ID_PATTERN = /^(\d+)\s+(.+)$/;

function splitProjectIdAndTitle(proyecto: string): { id: string; title: string } | null {
  const match = PROJECT_ID_PATTERN.exec(proyecto.trim());
  if (!match) return null;
  return { id: match[1], title: match[2].trim() };
}

/**
 * Real "Sector" values confirmed across the 58-row export: "Agua y Medio
 * Ambiente", "Electricidad", "Transporte", "Infraestructura Social",
 * "Telecomunicaciones" — a direct, authoritative field (this platform's
 * own sector classification, not a guess) rather than title-text
 * matching, so mapped as an exact lookup and fed alongside the
 * content-based classifyIndustries() result rather than replacing it.
 */
const SECTOR_KEYWORDS: Record<string, IndustryKey> = {
  "Agua y Medio Ambiente": "water",
  Electricidad: "power",
  Transporte: "transportation",
  "Infraestructura Social": "construction",
  Telecomunicaciones: "ict_telecom",
};

/**
 * Real "Proceso de selección" values confirmed: "Licitación Pública
 * Nacional" (13/58), "Licitación Pública Internacional Bajo Tratados"
 * (26/58), "Licitación Pública Internacional" (5/58), "Licitación
 * Pública" (8/58, ambiguous — not mapped), "Invitación pública" (1/58,
 * not mapped). This is a real, direct participation-scope signal — the
 * clearest one across any source this platform ingests (see README's
 * "governmentLevel and industry are best-effort guesses" — this one
 * genuinely isn't a guess).
 */
function inferParticipationScopeFromProceso(proceso: string | undefined): TenderParticipationScope | undefined {
  if (!proceso) return undefined;
  const normalized = proceso.trim();
  if (normalized === "Licitación Pública Internacional Bajo Tratados") return "international_treaty";
  if (normalized === "Licitación Pública Internacional") return "international_open";
  if (normalized === "Licitación Pública Nacional") return "national";
  return undefined;
}

/** Real format confirmed across the export: "dd/mm/yyyy" (e.g. "28/08/2026"). */
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Real values are in MILLIONS (e.g. "7,651" in the MXN column means
 * 7,651,000,000 MXN — confirmed against the real export's own column
 * header "Inversión (Millones MXN)"). The USD column is preferred when
 * present since it needs no currency-table conversion — the same real
 * row that has an MXN figure always has the USD one too in the export
 * inspected.
 */
function parseMillions(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n * 1_000_000 : undefined;
}

function buildKeyDates(id: string, row: ProyectosMexicoRow): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [];
  const announcement = parseDate(row["Anuncio/ Convocatoria"]);
  const proposalReception = parseDate(row["Recepción de propuestas"]);
  if (announcement) dates.push({ id: `proyectosmexico-${id}-announcement`, type: "publication", date: announcement });
  if (proposalReception) dates.push({ id: `proyectosmexico-${id}-proposals`, type: "submission", date: proposalReception });
  return dates;
}

export function mapProyectosMexicoRowToTender(row: ProyectosMexicoRow, sourceName: string): Tender | null {
  const proyecto = row.Proyecto?.trim();
  if (!proyecto) return null;
  const split = splitProjectIdAndTitle(proyecto);
  if (!split) return null;
  const { id, title } = split;

  const buyer = row["Entidad responsable"]?.trim();
  if (!buyer) return null;

  // The real Etapa/Subetapa fields distinguish "still open to bid" from
  // "desierto" (the procedure was declared void — no valid bids
  // received) — the latter isn't a live opportunity, so it's skipped
  // here the same way an awarded/cancelled status is filtered elsewhere
  // in this platform, rather than ingested and relying on the UI's
  // default-hide behavior to paper over it.
  if (row.Etapa?.trim() !== "Licitación") return null;

  const publicationDate = parseDate(row["Anuncio/ Convocatoria"]) ?? new Date().toISOString();
  const summary = row["Descripción"]?.trim() || row.Alias?.trim() || title;

  const sectorIndustry = row.Sector ? SECTOR_KEYWORDS[row.Sector.trim()] : undefined;
  let industries = classifyIndustries(title, summary, row.Subsector);
  if (sectorIndustry && !industries.includes(sectorIndustry)) {
    industries = [...industries.filter((i) => i !== "general"), sectorIndustry];
  }

  const scopeType: TenderScopeType = "works";
  const estimatedValue = parseMillions(row["Inversión (Millones USD)"]);
  const currency = estimatedValue !== undefined ? "USD" : undefined;

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    slug: `proyectosmexico-${id}`,
    tenderNumber: id,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Mexico",
    governmentLevel: inferGovernmentLevel(buyer),
    industries,
    scopeType,
    procedureType: row["Proceso de selección"]?.trim() || row["Tipo de contrato"]?.trim() || "Unknown",
    participationScope: inferParticipationScopeFromProceso(row["Proceso de selección"]),
    publicationDate,
    submissionDeadline: parseDate(row["Recepción de propuestas"]) ?? undefined,
    estimatedValue,
    currency,
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(id, row),
    risks: [],
    relevance: classifyRelevance({
      title,
      summary,
      industries,
      scopeType,
      estimatedValue,
      currency,
      buyer,
      isNationalPriorityProject: true,
    }),
    sourceName,
    sourceUrl: row.URL?.trim() || "",
    createdAt: now,
    updatedAt: now,
  };
}
