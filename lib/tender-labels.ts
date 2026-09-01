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
