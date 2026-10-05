import type { GovernmentLevel, Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { DOMINICANA_NATIONAL_EMERGENCY_CODE, type DgcpDocumento, type DgcpProceso } from "@/lib/ingestion/connectors/dominicana-dgcp-live";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * A DGCP procedure (lib/ingestion/connectors/dominicana-dgcp-live.ts) as a
 * Tender. Added 2026-10-04, staged, and opened to visitors the same day.
 *
 * Classified by the platform's general rules (lib/relevance.ts) with the
 * country set: a $1M floor, US$200k for new energy, the same exclusions.
 * Every amount is published, so no Dominican row depends on the
 * no-amount rules.
 */

export const DOMINICAN_REPUBLIC = "Dominican Republic";
export const DOMINICANA_SOURCE_NAME = "DGCP — Portal Transaccional de Compras Públicas (República Dominicana)";
const PORTAL_HOME = "https://comunidad.comprasdominicana.gob.do/";

/**
 * The API stamps every time with "Z", but the times are Santo Domingo's own
 * (UTC-4 all year): bid deadlines land on 10:00 and 14:00, opening hours of a
 * government office, which as UTC would be 06:00 and 10:00 local. So the "Z"
 * is read as -04:00.
 */
export function dominicanTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const local = raw.replace(/Z$/, "").replace(/(\.\d{3})\d*$/, "$1");
  const parsed = Date.parse(`${local}-04:00`);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

export function dominicanScopeType(objeto: string | undefined): TenderScopeType {
  const value = (objeto ?? "").toLowerCase();
  if (value.startsWith("bien")) return "equipment";
  if (value.startsWith("obra")) return "works";
  if (value.startsWith("consult")) return "consulting";
  if (value.startsWith("servicio")) return "services";
  return "unknown";
}

/** Municipalities and state companies by name; the rest of the buyers are central government. */
export function dominicanGovernmentLevel(buyer: string): GovernmentLevel {
  if (/\bayuntamiento\b|\bjunta (?:de )?distrito\b|\bdistrito municipal\b/i.test(buyer)) return "municipal";
  if (/^(?:empresa|corporaci[oó]n)\b|\bEDE(?:NORTE|SUR|ESTE)\b|\bETED\b|\bEGEHID\b|\bbanco\b|\bCAASD\b|\bCORAA/i.test(buyer)) return "public_company";
  return "federal";
}

export function dominicanStatus(estado: string, deadline: string | undefined, now: Date): TenderStatus {
  const value = estado.toLowerCase();
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("desierto")) return "deserted";
  if (value.includes("suspend")) return "suspended";
  if (value.includes("adjudicado")) return "awarded";
  if (value.includes("sobres") || value.includes("etapa cerrada")) return "submission_closed";
  if (deadline && Date.parse(deadline) < now.getTime()) return "submission_closed";
  return "open";
}

export function dominicanDocumentLinks(documentos: DgcpDocumento[]): TenderDocumentLink[] {
  return documentos.map((doc) => ({
    sourceUrl: doc.url_documento,
    fileName: safeFileName(doc.nombre_documento || "documento"),
    documentType: doc.tipo_documento,
    format: /\.([a-z0-9]{2,4})$/i.exec(doc.nombre_documento ?? "")?.[1]?.toLowerCase(),
    publishedAt: dominicanTime(doc.fecha_carga_archivo),
  }));
}

function sentence(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * The procedure as shown on the tender. A national-emergency procedure says
 * so: the bare "Procesos de Excepción" reads as a direct award, which it is not.
 */
export function dominicanProcedureType(proceso: Pick<DgcpProceso, "modalidad" | "codigo_proceso">): string {
  return DOMINICANA_NATIONAL_EMERGENCY_CODE.test(proceso.codigo_proceso) ? "Proceso de Excepción por Emergencia Nacional (convocatoria abierta)" : proceso.modalidad;
}

export function mapDgcpProcesoToTender(proceso: DgcpProceso, now: Date = new Date()): Tender {
  const procedureType = dominicanProcedureType(proceso);
  const title = proceso.titulo.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  const description = proceso.descripcion?.replace(/\s+/g, " ").trim();
  const buyer = proceso.unidad_compra.trim();
  const scopeType = dominicanScopeType(proceso.objeto_proceso);
  const governmentLevel = dominicanGovernmentLevel(buyer);
  const submissionDeadline = dominicanTime(proceso.fecha_fin_recepcion_ofertas);
  const publicationDate = dominicanTime(proceso.fecha_publicacion) ?? now.toISOString();
  const international = /internacional/i.test(proceso.modalidad);
  const external = proceso.organismo_financiero_externo && !/^no$/i.test(proceso.organismo_financiero_externo.trim());
  const currency = (proceso.divisa || "DOP").toUpperCase();
  const amount = typeof proceso.monto_estimado === "number" && proceso.monto_estimado > 0 ? proceso.monto_estimado : undefined;

  const summary = [
    sentence(title),
    description && description.toLowerCase() !== title.toLowerCase() ? sentence(description) : undefined,
    sentence(`Modalidad: ${procedureType}`),
    proceso.objeto_proceso ? sentence(`Objeto: ${proceso.objeto_proceso}${proceso.subobjeto_proceso ? ` (${proceso.subobjeto_proceso})` : ""}`) : undefined,
    external ? "Con financiamiento de un organismo financiero externo." : undefined,
    proceso.es_snip && /^s[ií]$/i.test(proceso.es_snip) && proceso.codigo_snip && proceso.codigo_snip !== "N/A" ? sentence(`Proyecto SNIP ${proceso.codigo_snip}`) : undefined,
    submissionDeadline && proceso.fecha_fin_recepcion_ofertas ? sentence(`Recepción de ofertas hasta ${proceso.fecha_fin_recepcion_ofertas.slice(0, 16).replace("T", " ")} (hora de Santo Domingo)`) : undefined,
    "Publicado en el Portal Transaccional de la Dirección General de Contrataciones Públicas (comprasdominicana.gob.do); pliego y anexos descargables sin registro.",
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: DOMINICAN_REPUBLIC,
    governmentLevel,
    scopeType,
    procedureType,
    tenderNumber: proceso.codigo_proceso,
    ...(amount !== undefined ? { estimatedValue: amount, currency } : {}),
    sourceName: DOMINICANA_SOURCE_NAME,
  });

  const slug = `dominicana-${slugify(proceso.codigo_proceso)}`;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber: proceso.codigo_proceso,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: DOMINICAN_REPUBLIC,
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    ...(international ? { participationScope: "international_open" as const } : {}),
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    ...(amount !== undefined ? { estimatedValue: amount, currency } : {}),
    status: dominicanStatus(proceso.estado_proceso, submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: DOMINICANA_SOURCE_NAME,
    sourceUrl: proceso.url?.replace(/\.do\/\//, ".do/") || PORTAL_HOME,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
