import type { GovernmentLevel, Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { PANAMACOMPRA_SITE, type PanamaDetalle, type PanamaProceso } from "@/lib/ingestion/connectors/panama-panamacompra-live";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * A PanamaCompra V3 procedure (lib/ingestion/connectors/panama-panamacompra-live.ts)
 * as a Tender. Added 2026-10-06 for a read-only trial; nothing writes these
 * yet, and Panama is not a platform country.
 *
 * Classified by the platform's general rules (lib/relevance.ts) with the
 * country set, like the Dominican Republic: the default $1M floor, US$200k
 * for new energy, the same exclusions.
 */

export const PANAMA = "Panama";
export const PANAMA_SOURCE_NAME = "PanamaCompra — Dirección General de Contrataciones Públicas (Panamá)";

/** The public route that opens a procedure by its number. */
export function panamaPublicUrl(numProceso: string): string {
  return `${PANAMACOMPRA_SITE}/Inicio/#/busqueda-numero-licitacion/${encodeURIComponent(numProceso)}`;
}

/**
 * The detail page's dates: "15-09-2026 - 10:09 AM" and "28-10-2026 hasta
 * 09:01 AM", in Panama's own time (UTC-5 all year).
 */
export function panamaTime(raw: string | undefined): string | undefined {
  const match = /(\d{2})-(\d{2})-(\d{4})\D+?(\d{1,2}):(\d{2})\s*([AP])\.?\s*M/i.exec(raw ?? "");
  if (!match) return undefined;
  const [, day, month, year, hourText, minute, meridiem] = match;
  let hour = Number(hourText) % 12;
  if (meridiem.toUpperCase() === "P") hour += 12;
  const parsed = Date.parse(`${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${minute}:00-05:00`);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/** "B/. 235,506.66" → 235506.66. The balboa is pegged 1:1 to the dollar and circulates as dollars. */
export function panamaAmount(raw: string | undefined): number | undefined {
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(raw ?? "");
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function panamaScopeType(objeto: string | undefined): TenderScopeType {
  const value = (objeto ?? "").toLowerCase();
  if (value.startsWith("bien")) return "equipment";
  if (value.startsWith("obra")) return "works";
  if (value.startsWith("consult")) return "consulting";
  if (value.startsWith("servicio")) return "services";
  return "unknown";
}

/** Municipalities and state companies by name; the rest of the buyers are central government. */
export function panamaGovernmentLevel(entity: string): GovernmentLevel {
  if (/\bmunicipio\b|\bjunta comunal\b|\bconsejo provincial\b/i.test(entity)) return "municipal";
  // No \b after "á": JavaScript's \b counts only ASCII letters, so it never matches there.
  if (/\bmetro de panam[aá](?![a-z])|\baeropuerto\b|\bautoridad del canal\b|\bempresa\b|\bETESA\b|\bIDAAN\b|\bbanco\b|\bcaja de ahorros\b|\btocumen\b/i.test(entity)) return "public_company";
  return "federal";
}

export function panamaStatus(estado: string, deadline: string | undefined, now: Date): TenderStatus {
  const value = estado.toLowerCase();
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("desierto")) return "deserted";
  if (value.includes("suspend")) return "suspended";
  if (value.includes("adjudicado")) return "awarded";
  if (value.includes("por adjudicar") || value.includes("reclamo") || value.includes("cerrad")) return "submission_closed";
  if (deadline && Date.parse(deadline) < now.getTime()) return "submission_closed";
  return "open";
}

function sentence(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function mapPanamaProcesoToTender(proceso: PanamaProceso, detalle: PanamaDetalle | undefined, now: Date = new Date()): Tender {
  const fields = detalle?.fields ?? {};
  const procedureType = proceso.nombre.replace(/^Licitacion\b/, "Licitación").trim();
  const title = proceso.titulo.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  const description = fields["Descripción"]?.replace(/\s+/g, " ").trim();
  const buyer = [proceso.nombreEntidad, proceso.nombreUnidadCompra].filter(Boolean).join(" — ").trim();
  const scopeType = panamaScopeType(fields["Objeto de Contratación"] ?? fields["Objeto de contratación"] ?? proceso.nombreObjectoContractual);
  const governmentLevel = panamaGovernmentLevel(proceso.nombreEntidad);
  const submissionDeadline = panamaTime(fields["Fecha y hora presentación de propuestas"]);
  const publicationDate = panamaTime(fields["Fecha de Publicación"]) ?? proceso.fechaPublicacion ?? now.toISOString();
  const amount = panamaAmount(fields["Precio de referencia"]);
  const lender = /banco|naciones unidas/i.test(procedureType);

  const summary = [
    sentence(title),
    description && description.toLowerCase() !== title.toLowerCase() ? sentence(description) : undefined,
    sentence(`Modalidad: ${procedureType}`),
    proceso.nombreModalidad ? sentence(`Adjudicación ${proceso.nombreModalidad.toLowerCase()}`) : undefined,
    fields["Provincia de entrega"] ? sentence(`Provincia de entrega: ${fields["Provincia de entrega"]}`) : undefined,
    fields["Vigencia del Contrato"] ? sentence(`Vigencia del contrato: ${fields["Vigencia del Contrato"]}`) : undefined,
    lender ? "Con financiamiento de un organismo multilateral." : undefined,
    fields["Fecha y hora presentación de propuestas"] ? sentence(`Presentación de propuestas: ${fields["Fecha y hora presentación de propuestas"]} (hora de Panamá)`) : undefined,
    "Publicado en PanamaCompra, el sistema electrónico de contrataciones públicas de Panamá; pliego de cargos y adendas consultables sin registro.",
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: PANAMA,
    governmentLevel,
    scopeType,
    procedureType,
    tenderNumber: proceso.numProceso,
    ...(amount !== undefined ? { estimatedValue: amount, currency: "USD" } : {}),
    sourceName: PANAMA_SOURCE_NAME,
  });

  const slug = `panama-${slugify(proceso.numProceso)}`;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: proceso.numProceso,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: PANAMA,
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(amount !== undefined ? { estimatedValue: amount, currency: "USD" } : {}),
    status: panamaStatus(proceso.nombreRealizado, submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: PANAMA_SOURCE_NAME,
    sourceUrl: panamaPublicUrl(proceso.numProceso),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
