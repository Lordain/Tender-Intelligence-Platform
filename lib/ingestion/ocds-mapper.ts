import type {
  GovernmentLevel,
  LocalizedText,
  Tender,
  TenderKeyDate,
  TenderScopeType,
  TenderStatus,
} from "@/types/tender";
import type { OcdsRelease } from "@/lib/ingestion/types";

/**
 * OCDS carries a single (Spanish) string per field, not per-locale text. The
 * platform's rule is "original language is the source of truth" — we store
 * the real Spanish text in `es` and mirror it into `en`/`zh` rather than
 * fabricate a translation. Phase 6 (AI Analysis) is what's supposed to
 * produce real en/zh text; until that exists, showing the Spanish source
 * in every locale is honest, a fabricated-sounding translation is not.
 */
function untranslated(text: string): LocalizedText {
  return { es: text, en: text, zh: text };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SCOPE_TYPE_BY_CATEGORY: Record<string, TenderScopeType> = {
  goods: "equipment",
  services: "services",
  works: "works",
};

function inferScopeType(mainProcurementCategory: string | undefined): TenderScopeType {
  if (!mainProcurementCategory) return "services";
  return SCOPE_TYPE_BY_CATEGORY[mainProcurementCategory] ?? "services";
}

const STATUS_BY_OCDS_STATUS: Record<string, TenderStatus> = {
  planning: "planned",
  active: "open",
  complete: "awarded",
  cancelled: "cancelled",
  unsuccessful: "cancelled",
  withdrawn: "cancelled",
};

function inferStatus(release: OcdsRelease): TenderStatus {
  const ocdsStatus = release.tender?.status;
  if (ocdsStatus && ocdsStatus in STATUS_BY_OCDS_STATUS) {
    return STATUS_BY_OCDS_STATUS[ocdsStatus];
  }
  return "open";
}

const GOVERNMENT_LEVEL_PATTERNS: [RegExp, GovernmentLevel][] = [
  [/municipio|ayuntamiento/i, "municipal"],
  [/gobierno del estado|secretar[íi]a de.*estado/i, "state"],
  [/^cfe$|comisión federal de electricidad|^pemex$|petróleos mexicanos|imss|isste/i, "public_company"],
  [/secretar[íi]a|instituto nacional|federal/i, "federal"],
];

/** Best-effort heuristic from the buyer name — OCDS has no government-level field. Flag for human review, don't trust blindly. */
function inferGovernmentLevel(buyerName: string): GovernmentLevel {
  for (const [pattern, level] of GOVERNMENT_LEVEL_PATTERNS) {
    if (pattern.test(buyerName)) return level;
  }
  return "federal";
}

function buildKeyDates(release: OcdsRelease): TenderKeyDate[] {
  const dates: TenderKeyDate[] = [];
  const tender = release.tender;

  if (release.date) {
    dates.push({ id: `${release.id}-publication`, type: "publication", date: release.date });
  }
  if (tender?.enquiryPeriod?.endDate) {
    dates.push({
      id: `${release.id}-questions`,
      type: "questions_deadline",
      date: tender.enquiryPeriod.endDate,
    });
  }
  if (tender?.tenderPeriod?.endDate) {
    dates.push({
      id: `${release.id}-submission`,
      type: "submission",
      date: tender.tenderPeriod.endDate,
    });
  }
  const firstAward = release.awards?.[0];
  if (firstAward?.date) {
    dates.push({ id: `${release.id}-award`, type: "award", date: firstAward.date });
  }

  return dates;
}

/**
 * Maps one OCDS release to our Tender schema. Only fields OCDS actually
 * carries are populated (Layer 1 — rules, per the platform's three-layer
 * extraction design). qualifications/experienceRequirements/
 * requiredDocuments/risks are left empty: those live in attached documents
 * (Convocatoria, Anexo Técnico) that OCDS references by URL but doesn't
 * extract — reading them is Layer 2 (AI/LLM) work, not built yet (needs an
 * LLM provider decision, see README).
 */
export function mapOcdsReleaseToTender(
  release: OcdsRelease,
  sourceName: string,
  sourceUrlBase: string,
): Tender | null {
  const tender = release.tender;
  if (!tender?.title) return null;

  const buyerName =
    release.buyer?.name ?? release.parties?.find((p) => p.roles?.includes("buyer"))?.name;
  if (!buyerName) return null;

  const publicationDate = release.date ?? tender.tenderPeriod?.startDate;
  if (!publicationDate) return null;

  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    slug: `ocds-${slugify(release.ocid)}`,
    tenderNumber: tender.id ?? release.ocid,
    title: untranslated(tender.title),
    summary: untranslated(tender.description ?? tender.title),
    buyer: buyerName,
    country: "Mexico",
    governmentLevel: inferGovernmentLevel(buyerName),
    industry: tender.items?.[0]?.classification?.description ?? "General",
    scopeType: inferScopeType(tender.mainProcurementCategory),
    procedureType: tender.procurementMethodDetails ?? tender.procurementMethod ?? "Unknown",
    publicationDate,
    submissionDeadline: tender.tenderPeriod?.endDate,
    awardDate: release.awards?.[0]?.date,
    estimatedValue: tender.value?.amount,
    currency: tender.value?.currency,
    status: inferStatus(release),
    qualifications: [],
    experienceRequirements: [],
    requiredDocuments: [],
    keyDates: buildKeyDates(release),
    risks: [],
    sourceName,
    sourceUrl: `${sourceUrlBase}${release.ocid}`,
    createdAt: now,
    updatedAt: now,
  };
}
