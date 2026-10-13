import type { GovernmentLevel, Tender, TenderKeyDate, TenderScopeType, TenderStatus } from "@/types/tender";
import { untranslated } from "@/lib/ingestion/text-utils";
import { safeFileName, type TenderDocumentLink } from "@/lib/ingestion/document-links";
import { ARCE_BASE, type ArceRelease } from "@/lib/ingestion/connectors/uruguay-arce-live";
import { classifyStoredTender } from "@/lib/relevance";

/**
 * An ARCE call (lib/ingestion/connectors/uruguay-arce-live.ts) as a Tender.
 * Added 2026-10-13, staged.
 *
 * Classified by the platform's general rules with the country set. No call
 * carries an amount, so every Uruguayan row goes through the no-amount rules,
 * and lib/relevance.ts caps it at 常规 (user, 2026-10-13: 没金额最多常规).
 */

export const URUGUAY = "Uruguay";
export const URUGUAY_SOURCE_NAME = "ARCE — Compras Estatales (Uruguay)";

/**
 * ARCE stamps every time with "Z", but the times are Montevideo's (UTC-3 all
 * year): deadlines land on 10:00, 11:00 and 15:30, office hours, which as UTC
 * would be 07:00 to 12:30 local. So the "Z" is read as -03:00.
 */
export function uruguayTime(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const parsed = Date.parse(`${raw.replace(/Z$/, "").replace(/(\.\d{3})\d*$/, "$1")}-03:00`);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/** OCDS mainProcurementCategory when present; otherwise left to the title rules. */
export function uruguayScopeType(release: ArceRelease): TenderScopeType {
  const category = release.tender?.mainProcurementCategory;
  if (category === "goods") return "equipment";
  if (category === "works") return "works";
  if (category === "services") return "services";
  const text = `${release.tender?.description ?? ""}`.toLowerCase();
  if (/\bobra|construcci[oó]n|pavimentaci|rehabilitaci[oó]n de (ruta|puente)/.test(text)) return "works";
  if (/\badquisici[oó]n|suministro|compra de\b/.test(text)) return "equipment";
  return "unknown";
}

/** State companies by the buyer id's inciso (60–69, 50–53), departmental governments (80–99); the rest is central government. */
export function uruguayGovernmentLevel(buyerId: string | undefined, buyerName: string): GovernmentLevel {
  const inciso = Number((buyerId ?? "").split("-")[0]);
  if (/^intendencia\b/i.test(buyerName) || (inciso >= 80 && inciso <= 99)) return "municipal";
  if ((inciso >= 60 && inciso <= 69) || (inciso >= 50 && inciso <= 53)) return "public_company";
  return "federal";
}

export function uruguayStatus(release: ArceRelease, deadline: string | undefined, now: Date): TenderStatus {
  const status = (release.tender?.status ?? "").toLowerCase();
  if (status === "cancelled") return "cancelled";
  if (status === "unsuccessful") return "deserted";
  if (status === "complete") return "awarded";
  if (deadline && Date.parse(deadline) < now.getTime()) return "submission_closed";
  return "open";
}

export function uruguayDocumentLinks(release: ArceRelease): TenderDocumentLink[] {
  return (release.tender?.documents ?? [])
    .filter((doc) => /^https?:\/\//i.test(doc.url ?? ""))
    .map((doc) => {
      const name = doc.title || doc.url!.split("/").pop() || "pliego";
      return {
        sourceUrl: doc.url!,
        fileName: safeFileName(name),
        documentType: doc.documentType,
        format: /\.([a-z0-9]{2,4})$/i.exec(doc.url ?? "")?.[1]?.toLowerCase(),
        publishedAt: uruguayTime(doc.datePublished),
      };
    });
}

function sentence(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** The description is the real title; ARCE's own title is only the procedure and its number ("Licitación Pública 16/2026"). */
function uruguayTitle(release: ArceRelease): string {
  const description = (release.tender?.description ?? "").replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  if (!description) return release.tender?.title ?? release.id;
  return description.length > 220 ? `${description.slice(0, 217).replace(/\s+\S*$/, "")}…` : description;
}

export function mapArceReleaseToTender(release: ArceRelease, now: Date = new Date()): Tender {
  const tender = release.tender ?? {};
  const purchaseId = tender.id ?? release.id.replace(/^\D+-/, "");
  const procedureType = (tender.procurementMethodDetails ?? "Licitación").trim();
  const procedureNumber = (tender.title ?? procedureType).trim();
  const tenderNumber = `${procedureNumber} (ID ${purchaseId})`;
  const title = uruguayTitle(release);
  const buyer = (release.buyer?.name ?? "Estado uruguayo").replace(/\s+/g, " ").trim();
  const scopeType = uruguayScopeType(release);
  const governmentLevel = uruguayGovernmentLevel(release.buyer?.id, buyer);
  const submissionDeadline = uruguayTime(tender.tenderPeriod?.endDate);
  const publicationDate = uruguayTime(tender.tenderPeriod?.startDate) ?? uruguayTime(release.date) ?? now.toISOString();
  const items = (tender.items ?? []).map((item) => item.description?.trim()).filter((value): value is string => Boolean(value));
  const description = (tender.description ?? "").replace(/\s+/g, " ").trim();

  const summary = [
    sentence(description || title),
    items.length > 0 ? sentence(`Ítems: ${[...new Set(items)].slice(0, 12).join("; ")}${items.length > 12 ? "…" : ""}`) : undefined,
    sentence(`${procedureNumber}, ${buyer}`),
    submissionDeadline && tender.tenderPeriod?.endDate ? sentence(`Recepción de ofertas hasta ${tender.tenderPeriod.endDate.slice(0, 16).replace("T", " ")} (hora de Montevideo)`) : undefined,
    "Publicado por la Agencia Reguladora de Compras Estatales (comprasestatales.gub.uy); pliego descargable sin registro.",
  ]
    .filter(Boolean)
    .join(" ");

  const { industries, relevance } = classifyStoredTender({
    title,
    summary,
    buyer,
    country: URUGUAY,
    governmentLevel,
    scopeType,
    procedureType,
    tenderNumber,
    sourceName: URUGUAY_SOURCE_NAME,
  });

  const slug = `uruguay-${purchaseId}`;
  const keyDates: TenderKeyDate[] = [{ id: `${slug}-publication`, type: "publication", date: publicationDate }];
  if (submissionDeadline) keyDates.push({ id: `${slug}-submission`, type: "submission", date: submissionDeadline });
  const timestamp = now.toISOString();

  return {
    id: crypto.randomUUID(),
    slug,
    tenderNumber,
    title: untranslated(title),
    summary: untranslated(summary),
    buyer,
    country: URUGUAY,
    governmentLevel,
    industries,
    scopeType,
    procedureType,
    publicationDate,
    ...(submissionDeadline ? { submissionDeadline } : {}),
    status: uruguayStatus(release, submissionDeadline, now),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates,
    risks: [],
    relevance,
    sourceName: URUGUAY_SOURCE_NAME,
    sourceUrl: `${ARCE_BASE}/consultas/detalle/id/${purchaseId}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
