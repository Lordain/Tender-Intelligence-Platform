import type { Tender, TenderKeyDate } from "@/types/tender";
import { slugify, untranslated } from "@/lib/ingestion/text-utils";
import { classifyStoredTender } from "@/lib/relevance";
import { PETROPERU_SOURCE_NAME } from "@/lib/relevance-petroperu";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { PETROPERU_LIST_URL, type PetroperuCall, type PetroperuRow } from "@/lib/ingestion/connectors/petroperu-live";
import { foldAccents } from "@/lib/text-fold";

export { PETROPERU_SOURCE_NAME };

const PETROPERU_BUYER = "Petróleos del Perú S.A. (Petroperú)";
export const PETROPERU_PROCEDURE_TYPE = "Proceso por Competencia Internacional (PCI) · Petroperú";

/** Only PCI rows are calls; CAI rows are published after the purchase (see petroperu-live.ts). */
export function isPetroperuCall(row: PetroperuRow): boolean {
  return /^PCI-/i.test(row.code.trim());
}

/**
 * A document that ends the process. Judged on the LATEST document only: the
 * 2025 catalyst call had a "Resolución de nulidad" after its first Buena Pro
 * and went on for ten more cronograma changes before its second one.
 */
const CLOSING_DOCUMENT = /buena pro|desiert|cancelaci|orden de (?:compra|trabajo)|informe (?:tecnico|sustentario)/;

export function petroperuClosingDocument(call: PetroperuCall): string | undefined {
  const latest = call.documents.at(-1);
  return latest && CLOSING_DOCUMENT.test(foldAccents(latest.name).toLowerCase()) ? latest.name : undefined;
}

function scopeTypeOf(description: string): Tender["scopeType"] {
  const text = foldAccents(description).toLowerCase();
  if (/\bepc\b|^obras?\b|construccion/.test(text)) return "works";
  if (/^(?:adquisicion|suministro|compra)\b/.test(text)) return "equipment";
  return "services";
}

function extensionOf(fileName: string): string | undefined {
  return /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase();
}

export function petroperuDocumentLinks(call: PetroperuCall, publishedAt: string): TenderDocumentLink[] {
  return call.documents.map((document) => {
    const extension = extensionOf(document.fileName) ?? extensionOf(document.url);
    return {
      sourceUrl: document.url,
      fileName: safeFileName(`${document.name || "Documento"}${extension ? `.${extension}` : ""}`),
      documentType: document.name,
      ...(extension ? { format: extension } : {}),
      publishedAt,
    };
  });
}

/**
 * One open PCI call → a Tender; null for a CAI row or a call whose latest
 * document closes it.
 *
 * No submissionDeadline, by the user's choice (2026-09-25: 截止日写「见招标
 * 文件」): the list states none and the Bases' date moves with every
 * cronograma change. lib/deadline-in-documents.ts renders the missing date
 * as 见招标文件 for this source instead of 未提供.
 */
export function mapPetroperuCallToTender(call: PetroperuCall, now: Date = new Date()): Tender | null {
  if (!isPetroperuCall(call) || petroperuClosingDocument(call)) return null;

  const tenderNumber = call.code.trim();
  const title = call.description.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  const scopeType = scopeTypeOf(title);
  const summary = [
    `${title}.`,
    `Proceso por Competencia Internacional de Petroperú (${tenderNumber}).`,
    "Fecha de presentación de ofertas y requisitos: ver las Bases y las modificaciones de cronograma publicadas.",
  ].join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer: PETROPERU_BUYER,
    country: "Peru",
    governmentLevel: "public_company",
    scopeType,
    procedureType: PETROPERU_PROCEDURE_TYPE,
    tenderNumber,
    sourceName: PETROPERU_SOURCE_NAME,
  });

  const slug = `petroperu-${slugify(tenderNumber)}`;
  const publicationDate = new Date(`${call.publishedOn}T12:00:00-05:00`).toISOString();
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer: PETROPERU_BUYER,
    country: "Peru",
    governmentLevel: "public_company",
    industries,
    scopeType,
    procedureType: PETROPERU_PROCEDURE_TYPE,
    publicationDate,
    status: "open",
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: PETROPERU_SOURCE_NAME,
    sourceUrl: PETROPERU_LIST_URL,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
