import type {
  GovernmentLevel,
  LocalizedText,
  TenderKeyDate,
  TenderParticipationScope,
  TenderRelevanceTier,
  TenderRiskLevel,
  TenderScopeType,
  TenderStatus,
} from "@/types/tender";
import type { IndustryKey } from "@/lib/industry";
import type { Locale } from "@/types/tender";

/**
 * Product direction is Latin America (see lib/ingestion/README.md's
 * "Multi-country expansion" section) — only Mexico has a real connector
 * built so far, but the filter is added ahead of that so the UI doesn't
 * need reworking again once Brazil/Chile/Colombia/Peru connectors exist.
 * Values match the real `country` field every mapper already writes
 * (`country: "Mexico"`, English canonical).
 */
export const ALL_COUNTRIES = ["Mexico", "Brazil", "Chile", "Colombia", "Peru"] as const;

export const COUNTRY_LABELS: Record<(typeof ALL_COUNTRIES)[number], LocalizedText> = {
  Mexico: { en: "Mexico", es: "México", zh: "墨西哥" },
  Brazil: { en: "Brazil", es: "Brasil", zh: "巴西" },
  Chile: { en: "Chile", es: "Chile", zh: "智利" },
  Colombia: { en: "Colombia", es: "Colombia", zh: "哥伦比亚" },
  Peru: { en: "Peru", es: "Perú", zh: "秘鲁" },
};

/** tender.country is typed as string (matches the Postgres text column), not narrowed to ALL_COUNTRIES — every real mapper writes a known value, but this stays defensive (falls back to the raw string) against any stale/unrecognized value rather than crashing on an unknown lookup, same posture as industryLabel(). */
export function countryLabel(country: string, locale: Locale): string {
  const label = COUNTRY_LABELS[country as (typeof ALL_COUNTRIES)[number]];
  return label ? label[locale] : country;
}

export const INDUSTRY_LABELS: Record<IndustryKey, LocalizedText> = {
  education: { en: "Education", es: "Educación", zh: "教育" },
  healthcare: { en: "Healthcare", es: "Salud", zh: "医疗" },
  tax: { en: "Tax/Fiscal", es: "Fiscal/Tributario", zh: "税务" },
  energy: { en: "Energy (Oil & Gas)", es: "Energía (Petróleo y Gas)", zh: "能源" },
  power: { en: "Power/Electricity", es: "Electricidad", zh: "电力" },
  ict_telecom: { en: "ICT/Telecom", es: "TIC/Telecom", zh: "ICT" },
  transportation: { en: "Transportation", es: "Transporte", zh: "交通" },
  construction: { en: "Construction", es: "Construcción", zh: "土建" },
  mining: { en: "Mining", es: "Minería", zh: "矿业" },
  water: { en: "Water & Sanitation", es: "Agua y Saneamiento", zh: "水务" },
  vehicles: { en: "Vehicles", es: "Vehículos", zh: "车辆" },
  general: { en: "General", es: "General", zh: "综合" },
};

/** tender.industries is typed as string[] (matches the Postgres text[] column), not IndustryKey[] — a real classifyIndustries() result is always a known key, but this stays defensive (falls back to the raw string) against any stale/unrecognized value rather than crashing on an unknown lookup. */
export function industryLabel(key: string, locale: Locale): string {
  const label = INDUSTRY_LABELS[key as IndustryKey];
  return label ? label[locale] : key;
}

export const SCOPE_TYPE_LABELS: Record<TenderScopeType, LocalizedText> = {
  equipment: { en: "Equipment", es: "Equipo", zh: "设备" },
  services: { en: "Services", es: "Servicios", zh: "服务" },
  equipment_services: {
    en: "Equipment + Services",
    es: "Equipo + Servicios",
    zh: "设备+服务",
  },
  works: { en: "Works / EPC", es: "Obra / EPC", zh: "工程/EPC" },
  consulting: { en: "Consulting", es: "Consultoría", zh: "咨询" },
};

export const STATUS_LABELS: Record<TenderStatus, LocalizedText> = {
  planned: { en: "Planned", es: "Planeada", zh: "计划中" },
  open: { en: "Open", es: "Abierta", zh: "招标中" },
  clarification: { en: "Clarification", es: "Aclaraciones", zh: "澄清中" },
  submission_closed: {
    en: "Submission Closed",
    es: "Presentación Cerrada",
    zh: "已截止",
  },
  awarded: { en: "Awarded", es: "Adjudicada", zh: "已中标" },
  cancelled: { en: "Cancelled", es: "Cancelada", zh: "已取消" },
};

export const STATUS_COLORS: Record<TenderStatus, string> = {
  planned: "bg-zinc-100 text-zinc-700",
  open: "bg-emerald-100 text-emerald-800",
  clarification: "bg-amber-100 text-amber-800",
  submission_closed: "bg-zinc-200 text-zinc-700",
  awarded: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

export const GOVERNMENT_LEVEL_LABELS: Record<GovernmentLevel, LocalizedText> = {
  federal: { en: "Federal", es: "Federal", zh: "联邦" },
  state: { en: "State", es: "Estatal", zh: "州级" },
  municipal: { en: "Municipal", es: "Municipal", zh: "市级" },
  public_company: { en: "Public Company", es: "Empresa Pública", zh: "国有企业" },
  private: { en: "Private", es: "Privada", zh: "私营" },
};

/**
 * Translated as-is from the real "Carácter del procedimiento" values, not
 * interpreted — see TenderParticipationScope in types/tender.ts for why
 * this platform doesn't assert which countries a treaty covers.
 */
export const PARTICIPATION_SCOPE_LABELS: Record<TenderParticipationScope, LocalizedText> = {
  national: {
    en: "National (domestic suppliers only)",
    es: "Nacional (solo proveedores nacionales)",
    zh: "仅限本国供应商",
  },
  international_treaty: {
    en: "International — treaty coverage only",
    es: "Internacional — bajo cobertura de tratados",
    zh: "国际招标（仅限贸易协定覆盖国）",
  },
  international_open: {
    en: "International — open",
    es: "Internacional — abierto",
    zh: "国际公开招标",
  },
};

export const RISK_LEVEL_COLORS: Record<TenderRiskLevel, string> = {
  low: "bg-zinc-100 text-zinc-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export const RISK_LEVEL_ICONS: Record<TenderRiskLevel, string> = {
  low: "⚪",
  medium: "🟡",
  high: "🟠",
  critical: "🔴",
};

export const RELEVANCE_TIER_LABELS: Record<TenderRelevanceTier, LocalizedText> = {
  flagship: { en: "Flagship", es: "Insignia", zh: "旗舰大标" },
  significant: { en: "Significant", es: "Relevante", zh: "重点项目" },
  standard: { en: "Standard", es: "Estándar", zh: "常规项目" },
  // "（排除）" appended per the user's explicit ask (2026-09-04) — this
  // label shows up both in AdminTenderForm's manual-tier dropdown and
  // AdminTenderList's tier badge; the front-end tender browser never
  // renders it at all (RELEVANCE_TIERS there deliberately omits
  // "excluded" — see TenderExplorer.tsx), so widening it here only
  // clarifies the two admin-only surfaces, no user-facing risk.
  excluded: { en: "Routine service (excluded)", es: "Servicio rutinario (excluido)", zh: "日常服务类（排除）" },
};

export const RELEVANCE_TIER_COLORS: Record<TenderRelevanceTier, string> = {
  flagship: "bg-amber-100 text-amber-900",
  significant: "bg-emerald-100 text-emerald-800",
  standard: "bg-zinc-100 text-zinc-600",
  excluded: "bg-zinc-100 text-zinc-400",
};

export const KEY_DATE_TYPE_LABELS: Record<TenderKeyDate["type"], LocalizedText> = {
  publication: { en: "Publication", es: "Publicación", zh: "发布" },
  site_visit: { en: "Site Visit", es: "Visita a Sitio", zh: "现场踏勘" },
  questions_deadline: {
    en: "Questions Deadline",
    es: "Límite de Preguntas",
    zh: "提问截止" ,
  },
  clarification: {
    en: "Junta de Aclaraciones",
    es: "Junta de Aclaraciones",
    zh: "澄清会议",
  },
  submission: { en: "Submission", es: "Presentación", zh: "提交截止" },
  opening: { en: "Opening", es: "Apertura", zh: "开标" },
  award: { en: "Award", es: "Fallo", zh: "中标结果" },
  contract_signing: {
    en: "Contract Signing",
    es: "Firma de Contrato",
    zh: "合同签署",
  },
};

/**
 * Short, always-shown clarification under each key-date TYPE label — added
 * 2026-09-04 per a real user question ("'开标'是交标日期还是结果公示日期？
 * 不清晰"): "开标" alone doesn't say whether it's the submission deadline,
 * the results date, or something else. "opening" (开标) is the date
 * submitted bids are formally unsealed/reviewed — sometimes the exact same
 * timestamp as the submission deadline when a source's own field combines
 * both events (see compras-mx-open-tenders-mapper.ts's
 * "FECHA DE PRESENTACIÓN Y APERTURA DE PROPOSICIONES" column), sometimes a
 * separately scheduled session — but it is NEVER the results/award date,
 * which is its own distinct "award" type. Applies to every source (not
 * just the one that prompted this), since the same ambiguity exists
 * anywhere "opening" is shown regardless of which mapper produced it.
 */
export const KEY_DATE_TYPE_DESCRIPTIONS: Record<TenderKeyDate["type"], LocalizedText> = {
  publication: { en: "When this tender was published.", es: "Cuándo se publicó esta licitación.", zh: "标书正式发布的日期。" },
  site_visit: { en: "Optional/mandatory site visit for bidders.", es: "Visita al sitio, opcional u obligatoria para los oferentes.", zh: "投标人现场踏勘的时间（是否强制视具体项目而定）。" },
  questions_deadline: { en: "Last day to submit clarification questions.", es: "Último día para enviar preguntas de aclaración.", zh: "投标人提交澄清问题的截止时间。" },
  clarification: { en: "Buyer's clarification meeting/response session.", es: "Sesión de junta de aclaraciones del comprador.", zh: "采购方召开的澄清会议。" },
  submission: { en: "Deadline to submit your bid — after this, no more submissions are accepted.", es: "Fecha límite para presentar la oferta — después de esto no se aceptan más propuestas.", zh: "投标文件提交截止时间——过了这个时间就不能再交标了。" },
  opening: { en: "When submitted bids are formally opened/unsealed for review — NOT the results date (sometimes the same moment as the submission deadline, sometimes a separate scheduled session).", es: "Cuándo se abren formalmente las ofertas presentadas para su revisión — NO es la fecha de resultados (a veces coincide con la fecha límite de presentación, a veces es una sesión aparte).", zh: "投标文件正式拆封唱标的时间——不是中标结果公布时间（有的项目跟交标截止是同一时刻，有的项目是单独安排的）。" },
  award: { en: "When the award/results are announced — this is the outcome date.", es: "Cuándo se anuncia el fallo/resultado — esta es la fecha del resultado.", zh: "中标结果公布的时间——这才是真正的结果公示日期。" },
  contract_signing: { en: "When the winning bidder signs the contract.", es: "Cuándo el ganador firma el contrato.", zh: "中标方正式签署合同的时间。" },
};
