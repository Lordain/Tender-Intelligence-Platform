import type { GovernmentLevel, Tender, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";

/**
 * One row from Colombia's real "SECOP II - Procesos de Contratación"
 * open-data set on `datos.gov.co` (Socrata resource `p6dx-8zbt`, published
 * by Agencia Nacional de Contratación Pública — Colombia Compra
 * Eficiente). Confirmed real and reachable with NO authentication via the
 * standard public Socrata read endpoint:
 *
 *   https://www.datos.gov.co/resource/p6dx-8zbt.json?$limit=N&$offset=M
 *
 * (SODA2 — the dataset's own export dialog defaults to SODA3, which
 * requires an auth token; the plain `/resource/<id>.json` SODA2 path
 * needs none for read access to a public dataset, confirmed by a real
 * unauthenticated request returning real rows). 9,097,326 rows total as
 * of this writing — by far the largest single source this platform has
 * touched; a real pull needs `$limit`/`$offset` pagination and almost
 * certainly a `$where` date filter (e.g. recent `fecha_de_publicacion_del`
 * only), not a full dump.
 *
 * Field names are Socrata's auto-generated column identifiers, derived
 * from each column's real display name by stripping/mangling accents —
 * e.g. "Descripción del Procedimiento" becomes `descripci_n_del_procedimiento`
 * (not a typo here). Values themselves keep real accented Spanish text.
 *
 * This dataset is confirmed real from a direct, unauthenticated browser
 * request returning 5 real rows (DANE, Barranquilla, a Bogotá school,
 * INVIAS, a Putumayo municipality) — the field mapping below is built
 * from those 5 rows and will need broadening as more real data is seen
 * (see the status/scope-type functions' comments for what's still a
 * best-effort guess from a small sample).
 */
export type SecopProcesoRow = {
  entidad?: string;
  nit_entidad?: string;
  departamento_entidad?: string;
  ciudad_entidad?: string;
  ordenentidad?: string; // "Nacional" | "Territorial"
  id_del_proceso?: string;
  referencia_del_proceso?: string;
  nombre_del_procedimiento?: string;
  descripci_n_del_procedimiento?: string;
  fecha_de_publicacion_del?: string; // "yyyy-mm-ddT00:00:00.000"
  precio_base?: string;
  modalidad_de_contratacion?: string;
  duracion?: string;
  unidad_de_duracion?: string;
  fecha_de_recepcion_de?: string;
  estado_del_procedimiento?: string;
  adjudicado?: string; // "No" | "Si" (real values seen so far are all "No")
  nombre_del_proveedor?: string;
  codigo_principal_de_categoria?: string; // UNSPSC-shaped, e.g. "V1.80111500"
  estado_de_apertura_del_proceso?: string; // "Abierto" | "Cerrado"
  tipo_de_contrato?: string;
  urlproceso?: { url?: string };
  codigo_entidad?: string;
};

/**
 * Colombia is a unitary republic, not federated like Mexico — "Nacional"
 * (central government) is the clean federal-equivalent match. "Territorial"
 * covers both departmental (state-equivalent) and municipal entities with
 * no further field to split them, so the buyer name itself is checked for
 * municipal-specific words ("municipio", "distrito", "alcaldía" — all real,
 * seen in the 5-row sample) before falling back to "state" for anything
 * territorial that isn't obviously a municipality (e.g. a "Gobernación").
 */
function inferGovernmentLevel(ordenEntidad: string | undefined, entidad: string | undefined): GovernmentLevel {
  if (ordenEntidad === "Nacional") return "federal";
  if (/municipio|distrito|alcald[íi]a/i.test(entidad ?? "")) return "municipal";
  return "state";
}

const SCOPE_TYPE_BY_TIPO_CONTRATO: Record<string, TenderScopeType> = {
  "PRESTACIÓN DE SERVICIOS": "services",
  COMPRAVENTA: "equipment",
  SUMINISTRO: "equipment",
  "OBRA": "works",
  CONSULTORÍA: "consulting",
};

/** Only 2 real distinct values seen in the 5-row sample ("Prestación de servicios", "Otro") — an exact lookup for the one real signal seen, "services" as the fallback since that's this dataset's overwhelming majority in the sample. Needs broadening once a larger real pull is available. */
function inferScopeType(tipoContrato: string | undefined): TenderScopeType {
  if (!tipoContrato) return "services";
  return SCOPE_TYPE_BY_TIPO_CONTRATO[tipoContrato.toUpperCase().trim()] ?? "services";
}

/**
 * `adjudicado` ("Sí"/"No") is the real awarded signal — checked first
 * regardless of the other status fields. `estado_de_apertura_del_proceso`
 * ("Abierto"/"Cerrado") is the clean open/closed signal for everything
 * else. `estado_del_procedimiento` ("Seleccionado", "Evaluación", ...) is
 * a finer-grained real phase name but not used here yet — the 5-row
 * sample isn't enough to build a confident full mapping from it (e.g.
 * "Seleccionado" appeared on rows with `adjudicado: "No"`, so it does NOT
 * mean "awarded" despite the name — a real trap worth flagging, not
 * guessing past).
 */
function inferStatus(adjudicado: string | undefined, aperturaEstado: string | undefined): TenderStatus {
  if (adjudicado?.trim().toLowerCase() === "si" || adjudicado?.trim().toLowerCase() === "sí") return "awarded";
  if (aperturaEstado === "Cerrado") return "submission_closed";
  return "open";
}

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function mapSecopRowToTender(row: SecopProcesoRow, sourceName: string): Tender | null {
  const title = row.nombre_del_procedimiento?.trim();
  const buyer = row.entidad?.trim();
  const tenderNumber = row.referencia_del_proceso?.trim() || row.id_del_proceso?.trim();
  if (!title || !buyer || !tenderNumber) return null;

  const publicationDate = parseDate(row.fecha_de_publicacion_del);
  if (!publicationDate) return null;

  const summary = row.descripci_n_del_procedimiento?.trim() || title;
  const industries = classifyIndustries(title, summary, buyer);
  const scopeType = inferScopeType(row.tipo_de_contrato);
  const now = new Date().toISOString();

  const priceBase = row.precio_base ? Number(row.precio_base) : undefined;
  const estimatedValue = priceBase && priceBase > 0 ? priceBase : undefined;

  const providerName = row.nombre_del_proveedor?.trim();
  const awardedTo = providerName && providerName !== "No Definido" ? providerName : undefined;

  return {
    id: crypto.randomUUID(),
    // Own slug namespace ("secop-") — a real, standalone connector, no
    // cross-source de-dup scheme to line up with.
    slug: `secop-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: "Colombia",
    governmentLevel: inferGovernmentLevel(row.ordenentidad, buyer),
    industries,
    scopeType,
    procedureType: row.modalidad_de_contratacion?.trim() || "Unknown",
    publicationDate,
    submissionDeadline: parseDate(row.fecha_de_recepcion_de) ?? undefined,
    // Colombian public procurement is denominated in COP by law/convention
    // — the dataset carries no separate currency field to read directly
    // (unlike Compras MX's explicit "Moneda" column), so this is a real-
    // world fact treated as given, not a guess, the same posture as DOF
    // always being "federal" (see dof-mapper.ts).
    estimatedValue,
    currency: estimatedValue ? "COP" : undefined,
    location: row.ciudad_entidad?.trim() && row.ciudad_entidad !== "No Definido" ? row.ciudad_entidad.trim() : row.departamento_entidad?.trim(),
    status: inferStatus(row.adjudicado, row.estado_de_apertura_del_proceso),
    awardedTo,
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [{ id: `${tenderNumber}-publication`, type: "publication", date: publicationDate }],
    risks: [],
    relevance: classifyRelevance({ title, summary, industries, scopeType, estimatedValue, currency: "COP", buyer, country: "Colombia" }),
    sourceName,
    // Real, directly captured — urlproceso.url points at the actual
    // public tender page on community.secop.gov.co.
    sourceUrl: row.urlproceso?.url || `https://www.datos.gov.co/resource/p6dx-8zbt.json?id_del_proceso=${row.id_del_proceso}`,
    createdAt: now,
    updatedAt: now,
  };
}
