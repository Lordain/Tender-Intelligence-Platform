import type { LocalizedText, TenderRelevance } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";

/**
 * Relevance for Petroperú's international competitions
 * (lib/ingestion/connectors/petroperu-live.ts).
 *
 * Only PCI rows reach this — "Proceso por Competencia Internacional", the
 * calls with Bases. The CAI rows on the same list are post-award notices
 * (informe técnico + orden de compra) and are never mapped. PCI calls are
 * rare (two in the twelve months to 2026-09-25) and never carry an amount,
 * so the general "no amount, no industry keyword" gate would drop every one:
 * a zeolite FCC catalyst for Talara was excluded by it.
 *
 *   software, licences, information, audit, legal, insurance → excluded
 *   services → excluded, unless they build something (EPC, obra, montaje)
 *   goods and works → 中型 (the state oil company buying abroad)
 */

export const PETROPERU_SOURCE_NAME = "Petroperú — Competencia internacional";

const NOT_TARGET = /software|licencia|informacion de|auditori|legal|apoderado|seguro|consultori|capacitacion|publicidad/;
const BUILDS = /\bepc\b|construccion|montaje|\bobras?\b|instalacion|puesta en marcha/;

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

const REASONS = {
  not_target: {
    zh: "该项目采购的是软件、许可、信息、审计、法律或咨询类服务，不属于石油工业设备、材料或工程，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "Software, licences, information, audit, legal or consulting — not oil-industry equipment, materials or works. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Software, licencias, información, auditoría, servicios legales o consultoría — no equipos, materiales ni obras petroleras. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  service: {
    zh: "该项目是服务类采购（不含工程建设），默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "A service contract with no construction scope. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Un contrato de servicios sin obra. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  international: {
    zh: "该项目是秘鲁国家石油公司 Petroperú 的国际竞争性招标（PCI），采购石油工业设备、材料或工程。Petroperú 不公布金额，交标日期和要求见招标文件（Bases）。",
    en: "An international competition (PCI) by Peru's state oil company for oil-industry equipment, materials or works. Petroperú publishes no amount; the bid date and requirements are in the Bases.",
    es: "Un Proceso por Competencia Internacional de Petroperú para equipos, materiales u obras petroleras. Petroperú no publica montos; la fecha de presentación y los requisitos están en las Bases.",
  },
} satisfies Record<string, LocalizedText>;

export function classifyPetroperuRelevance(input: { title: string; scopeType: string }): TenderRelevance {
  const text = foldAccents(input.title).toLowerCase();
  if (NOT_TARGET.test(text)) return { tier: "excluded", label: LABELS.excluded, reason: REASONS.not_target };
  if (input.scopeType === "services" && !BUILDS.test(text)) return { tier: "excluded", label: LABELS.excluded, reason: REASONS.service };
  return { tier: "significant", label: LABELS.significant, reason: REASONS.international };
}
