/**
 * A Guatecompras call (lib/ingestion/guatemala-paste.ts) → a Tender, for
 * Guatemala (user, 2026-10-16: A — 两步粘贴导入). Staged
 * (lib/staged-countries.ts): what is written shows in the admin pages only.
 *
 * The list row is enough to judge a call (step one, nothing written); the
 * detail page adds the hour, the kind of entity, the bonds and SNIP, and is
 * what step two writes. Classified by the general rules through
 * classifyStoredTender, where the user's rule A for Guatemala — central
 * government and state bodies only, never a local government — lives, so a
 * reclassified row lands where it was imported.
 */
import type { GovernmentLevel, Tender, TenderKeyDate, TenderScopeType } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { isGuatemalaLocalGovernment, type GuatecomprasDetail, type GuatecomprasListCall } from "@/lib/ingestion/guatemala-paste";
import { guatecomprasCallUrl } from "@/lib/ingestion/guatemala-paste-result";

export const GUATEMALA = "Guatemala";
export const GUATEMALA_SOURCE_NAME = "Guatemala — Guatecompras (Ministerio de Finanzas Públicas)";

/** What a call is, from its description's first words. */
export function guatemalaScopeType(description: string): TenderScopeType {
  const text = description.trim().toUpperCase();
  if (/^(CONSULTOR|ESTUDIO|DISEÑO|SUPERVISI|ELABORACI[ÓO]N DE (ESTUDIO|PLAN|DISEÑO))/.test(text)) return "consulting";
  if (/^(CONSTRUCCI|MEJORAMIENTO|AMPLIACI|REHABILITACI|CONSERVACI|REPARACI|REMOZAMIENTO|REPOSICI|INTRODUCCI|INSTALACI)/.test(text)) return "works";
  if (/^(ADQ|COMPRA|SUMINISTRO)/.test(text)) return "equipment";
  if (/^(SERVICIO|CONTRATACI[ÓO]N DE(L)? SERVICIO|DIGITALIZACI|MANTENIMIENTO|ARRENDAMIENTO)/.test(text)) return "services";
  return "unknown";
}

type GuatemalaCall = {
  nog: string;
  description: string;
  modality: string;
  categories: string;
  entity: string;
  entityKind?: string;
  unit: string;
  publishedAt?: string;
  offersUntil?: string;
  open: boolean;
  bondBidPercent?: number | null;
  bondPerformancePercent?: number | null;
  snip?: boolean;
  url?: string;
};

export function guatemalaCallFromList(call: GuatecomprasListCall, url?: string): GuatemalaCall {
  return {
    nog: call.nog,
    description: call.description,
    modality: call.modality,
    categories: call.categories,
    entity: call.entity,
    unit: call.unit,
    publishedAt: call.publishedDay,
    offersUntil: call.offersUntilDay,
    open: /vigente/i.test(call.status),
    url,
  };
}

export function guatemalaCallFromDetail(detail: GuatecomprasDetail, url?: string): GuatemalaCall {
  return {
    nog: detail.nog,
    description: detail.description,
    modality: detail.modality,
    categories: detail.categories,
    entity: detail.entity,
    entityKind: detail.entityKind,
    unit: detail.unit,
    publishedAt: detail.publishedAt,
    offersUntil: detail.offersUntil,
    open: /vigente/i.test(detail.status),
    bondBidPercent: detail.bondBidPercent,
    bondPerformancePercent: detail.bondPerformancePercent,
    snip: detail.snip,
    url,
  };
}

function guatemalaTime(iso: string): string {
  return new Date(iso).toLocaleString("es-GT", { timeZone: "America/Guatemala", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function mapGuatemalaCallToTender(call: GuatemalaCall, now: Date = new Date()): Tender {
  const title = call.description;
  const buyer = call.entity;
  const governmentLevel: GovernmentLevel = isGuatemalaLocalGovernment(call.entity, call.entityKind) ? "municipal" : "federal";
  const scopeType = guatemalaScopeType(call.description);
  const procedureType = call.modality;
  const tenderNumber = `NOG ${call.nog}`;
  const bonds =
    call.bondBidPercent || call.bondPerformancePercent
      ? `Fianza de sostenimiento de oferta ${call.bondBidPercent ?? 0} % y de cumplimiento ${call.bondPerformancePercent ?? 0} %.`
      : undefined;
  const summary = [
    `${title}.`,
    `Entidad compradora: ${call.entity}${call.unit ? ` (${call.unit})` : ""}.`,
    call.entityKind ? `Tipo de entidad: ${call.entityKind}.` : undefined,
    `Modalidad: ${call.modality}.`,
    call.categories ? `Categorías: ${call.categories}.` : undefined,
    call.snip ? "Proyecto de inversión pública registrado en el SNIP." : undefined,
    bonds,
    call.offersUntil ? `Ofertas electrónicas por Guatecompras hasta el ${guatemalaTime(call.offersUntil)} (hora de Guatemala).` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: GUATEMALA,
    governmentLevel,
    scopeType,
    procedureType,
    tenderNumber,
    sourceName: GUATEMALA_SOURCE_NAME,
  });

  const slug = `guatemala-${slugify(call.nog)}`;
  const publicationDate = call.publishedAt ?? now.toISOString();
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (call.offersUntil) keyDates.push({ id: `${slug}-submission`, type: "submission", date: call.offersUntil });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: GUATEMALA,
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(call.offersUntil ? { submissionDeadline: call.offersUntil } : {}),
    status: call.open ? "open" : "submission_closed",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: GUATEMALA_SOURCE_NAME,
    sourceUrl: call.url ?? guatecomprasCallUrl(call.nog),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
