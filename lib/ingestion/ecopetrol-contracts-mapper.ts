import type { Tender, TenderScopeType } from "@/types/tender";
import { untranslated, slugify } from "@/lib/ingestion/text-utils";
import { classifyRelevance } from "@/lib/relevance";
import { classifyIndustries } from "@/lib/industry";
import type { EcopetrolContractRow } from "@/lib/ingestion/connectors/ecopetrol-contracts-xlsb-file";

/**
 * Maps one row of Ecopetrol's real "Contratación asignada a la fecha"
 * export (see connectors/ecopetrol-contracts-xlsb-file.ts for the real
 * source and file-shape findings). This is an AWARDED CONTRACTS registry
 * (Colombia's PEMEX-equivalent state oil company disclosing what it has
 * already signed), same posture as compras-mx-contracts-mapper.ts /
 * compranet5-mapper.ts — historical intelligence (who won, real values,
 * real buyers within the Ecopetrol group), NOT a source for "tenders
 * still open to bid on."
 *
 * No separate "buyer" field — every row IS Ecopetrol's own contracting,
 * so `buyer` is fixed rather than read from a column, same posture as
 * dof-mapper.ts always writing "federal" (a real fact about the source,
 * not a guess).
 */

const SCOPE_TYPE_BY_TIPO_CONTRATO: Record<string, TenderScopeType> = {
  SERVICIOS: "services",
  BIENES: "equipment",
};

function inferScopeType(tipoContratoOperativo: string | number | undefined): TenderScopeType {
  const key = String(tipoContratoOperativo ?? "").toUpperCase().trim();
  return SCOPE_TYPE_BY_TIPO_CONTRATO[key] ?? "services";
}

/**
 * Real Excel serial date (e.g. 46096) → ISO date. Verified against the
 * real file with Python (`datetime(1899, 12, 30) + timedelta(days=serial)`
 * — the standard Excel epoch, already correct for Excel's 1900
 * leap-year bug) before porting here — 46096 -> 2026-03-15, confirmed
 * against real Fecha Creación values in context (a 2026-sheet contract
 * created in March 2026 is plausible; a naive off-by-one epoch would have
 * produced a visibly wrong month).
 */
function excelSerialToIso(value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === "") return null;
  const serial = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(serial)) return null;
  const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const date = new Date(EXCEL_EPOCH_MS + serial * MS_PER_DAY);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseAmount(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The two value columns are year-suffixed in the real file ("Valor Suscrito en Ordenes Despacho en Pesos en 2026") — found by prefix match rather than a hardcoded year, so this keeps working across sheets/years without a mapper change each year. */
function findValueByPrefix(row: EcopetrolContractRow, prefix: string): string | number | undefined {
  const key = Object.keys(row).find((k) => k.startsWith(prefix));
  return key ? row[key] : undefined;
}

export function mapEcopetrolContractRowToTender(row: EcopetrolContractRow, sourceName: string, sourceUrl: string): Tender | null {
  const tenderNumber = String(row["Contrato Operativo"] ?? "").trim();
  const title = String(row["Objeto Contrato"] ?? "").trim();
  if (!tenderNumber || !title) return null;

  const publicationDate = excelSerialToIso(row["Fecha Creación Contrato Operativo"]);
  if (!publicationDate) return null;

  const industries = classifyIndustries(title);
  const scopeType = inferScopeType(row["Tipo Contrato Operativo"]);
  const estimatedValue = parseAmount(findValueByPrefix(row, "Valor Suscrito en Ordenes Despacho"));
  const now = new Date().toISOString();

  const awardedToRaw = row["Nombre Proveedor"];
  const awardedTo = awardedToRaw ? String(awardedToRaw).trim() : undefined;

  const locationRaw = row["Lugar de Ejecucion"] ?? row["Lugar Ejecucion"] ?? row["Lugar de Ejecución"];
  const location = locationRaw && String(locationRaw).trim() !== "NO REGISTRADO" ? String(locationRaw).trim() : undefined;

  return {
    id: crypto.randomUUID(),
    slug: `ecopetrol-${slugify(tenderNumber)}`,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(title),
    buyer: "Ecopetrol S.A.",
    country: "Colombia",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType: String(row["Tipo Movimiento"] ?? "Unknown"),
    publicationDate,
    awardDate: publicationDate,
    awardedTo,
    estimatedValue,
    currency: estimatedValue ? "COP" : undefined,
    location,
    status: "awarded",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: [{ id: `${tenderNumber}-award`, type: "award", date: publicationDate }],
    risks: [],
    relevance: classifyRelevance({ title, industries, scopeType, estimatedValue, currency: "COP" }),
    sourceName,
    sourceUrl,
    createdAt: now,
    updatedAt: now,
  };
}
