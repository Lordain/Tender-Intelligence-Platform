import type { LocalizedText, TenderRelevance } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";
import { convertToUsd } from "@/lib/currency";

/**
 * Relevance for Chile's public-works concessions
 * (lib/ingestion/connectors/chile-concesiones-live.ts).
 *
 * Own rules because two general Chilean rules were written for Mercado
 * Público rows and misread these. CHILE_SERVICE_TITLE excludes a title that
 * opens with "Concesión" — on Mercado Público that is a municipality letting
 * out a casino, a car park or waste collection — and it excluded "Segunda
 * Concesión Ruta 5 Tramo Collipulli – Temuco", a US$ 1.1bn motorway. The
 * upkeep words ("conservación", "mantención") a concession's description
 * always carries, because the concessionaire runs what it builds, excluded
 * the Calama prison as well (2026-10-10, first dry run).
 *
 * What the general rules are for still holds here:
 *
 *   advisory, study or inspection contracts (AIF, ATIF, estudio) → excluded
 *   official budget under the platform's US$ 1M floor              → excluded
 *   US$ 10M and up                                                   → 大型项目
 *   US$ 5M and up, or no budget stated                               → 中型项目
 *   the rest                                                         → 常规项目
 */

export const CHILE_CONCESIONES_SOURCE_NAME = "MOP Chile — Dirección General de Concesiones (Proyectos en Licitación)";

const MIN_VALUE_USD = 1_000_000;
const SIGNIFICANT_VALUE_USD = 5_000_000;
const FLAGSHIP_VALUE_USD = 10_000_000;

const NOT_A_WORKS_CONCESSION = /^\W*(?:asesoria|a\.?t?\.?i\.?f\b|aif\b|atif\b|estudio|consultoria|inspeccion|fiscalizacion)/;

const LABELS: Record<TenderRelevance["tier"], LocalizedText> = {
  flagship: { zh: "大型项目 · 建议中资企业重点关注", en: "Flagship Project", es: "Proyecto Insignia" },
  significant: { zh: "中型项目 · 中资出海相关度较高", en: "Significant Project", es: "Proyecto Significativo" },
  standard: { zh: "常规项目", en: "Standard Project", es: "Proyecto Estándar" },
  excluded: {
    zh: "日常服务类/小额标 · 默认不推荐",
    en: "Routine/Low-Value (filtered by default)",
    es: "Rutinario/Bajo Valor (filtrado por defecto)",
  },
};

const NOTE_ZH = "智利公共工程部特许经营总局（DGC）按《特许经营法》招标：中标方负责设计、建设、融资并在特许期内运营维护，国内外企业均可投标，需先购买招标文件。";
const NOTE_EN = "Tendered by the MOP's Dirección General de Concesiones under Chile's Concessions Law: the winner designs, builds, finances and runs the asset for the concession term. Open to domestic and foreign bidders, who must buy the bases.";
const NOTE_ES = "Licitada por la Dirección General de Concesiones del MOP bajo la Ley de Concesiones: el adjudicatario diseña, construye, financia y opera la obra durante la concesión. Abierta a oferentes nacionales y extranjeros, que deben adquirir las bases.";

const REASONS = {
  not_works: {
    zh: "该项目是特许经营项目的咨询、研究或监理合同，不属于工程建设，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "An advisory, study or inspection contract for a concession, not the works. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Un contrato de asesoría, estudio o inspección de una concesión, no la obra. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  small: {
    zh: "该特许经营项目的官方预算低于平台 100 万美元的门槛，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "The concession's official budget is under the platform's US$1M floor. Filtered from the default feed (metadata is kept, not deleted).",
    es: "El presupuesto oficial de la concesión está bajo el umbral de US$1M de la plataforma. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  flagship: {
    zh: `该项目是智利公共工程特许经营项目，官方预算超过 1,000 万美元，属于大型基础设施项目。${NOTE_ZH}`,
    en: `A Chilean public-works concession with an official budget over US$10M — a large infrastructure project. ${NOTE_EN}`,
    es: `Una concesión de obra pública con presupuesto oficial sobre US$10M — un proyecto de infraestructura de gran escala. ${NOTE_ES}`,
  },
  significant: {
    zh: `该项目是智利公共工程特许经营项目。${NOTE_ZH}`,
    en: `A Chilean public-works concession. ${NOTE_EN}`,
    es: `Una concesión de obra pública en Chile. ${NOTE_ES}`,
  },
} satisfies Record<string, LocalizedText>;

export function classifyChileConcesionRelevance(input: { title: string; estimatedValue?: number; currency?: string }): TenderRelevance {
  if (NOT_A_WORKS_CONCESSION.test(foldAccents(input.title).toLowerCase())) return { tier: "excluded", label: LABELS.excluded, reason: REASONS.not_works };
  const usd = input.estimatedValue !== undefined ? convertToUsd(input.estimatedValue, input.currency) : null;
  if (usd === null) return { tier: "significant", label: LABELS.significant, reason: REASONS.significant };
  if (usd < MIN_VALUE_USD) return { tier: "excluded", label: LABELS.excluded, reason: REASONS.small };
  if (usd >= FLAGSHIP_VALUE_USD) return { tier: "flagship", label: LABELS.flagship, reason: REASONS.flagship };
  if (usd >= SIGNIFICANT_VALUE_USD) return { tier: "significant", label: LABELS.significant, reason: REASONS.significant };
  return { tier: "standard", label: LABELS.standard, reason: REASONS.significant };
}
