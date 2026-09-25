import type { LocalizedText, TenderRelevance } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";

/**
 * Relevance for Codelco's public calls (lib/ingestion/connectors/codelco-live.ts).
 *
 * Own rules for the reason lib/relevance-petronect.ts gives: a state company
 * that never publishes an amount, where the general "no amount, no industry
 * keyword" gate would drop a corporate cable or pump contract. What Codelco
 * does say is WHO is buying: "Casa Matriz" calls are corporate category
 * contracts for every division at once (Suministros Químicos SX-EW "para
 * cubrir las necesidades multidivisionales de la Corporación"); a division's
 * own call is local.
 *
 *   office, events, household, hand tools, local materials → excluded
 *   services → excluded, unless they build something (construcción, montaje,
 *              "implementación y PEM" — puesta en marcha)
 *   industrial goods: Casa Matriz → 中型, a division → 常规
 */

export const CODELCO_SOURCE_NAME = "Codelco — Licitaciones en proceso";

const CORPORATE_PREFIX = "Licitación abierta Codelco — Casa Matriz";

/** The stored procedureType, carrying who buys — the one scale statement the table makes. */
export function codelcoProcedureType(operation: string): string {
  const where = operation.trim();
  return /casa matriz/i.test(where) ? `${CORPORATE_PREFIX}（全集团统一采购）` : `Licitación abierta Codelco — ${where || "División"}`;
}

const NOT_TARGET =
  /impreso|silla|escritorio|oficina|linea blanca|computador|tablet|agua purificada|evento|fiesta|navidad|aniversario|organizador|laboratorio|ferreteria|implementos de seguridad|hardware de seguridad|herramienta|madera|aridos|tambores|gas licuado|auditoria|transporte de|riesgos naturales/;
const BUILDS = /construccion|montaje|\bobras?\b|implementacion y pem|puesta en marcha/;

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

const NOTE_ZH = "Codelco 不公布金额；标书在 SAP Ariba 上，需先注册为 Codelco 供应商并在截止日前表达参与意向。";
const NOTE_EN = "Codelco publishes no amount; the bases are on SAP Ariba to registered suppliers who express interest by the deadline.";
const NOTE_ES = "Codelco no publica montos; las bases están en SAP Ariba para proveedores inscritos que manifiesten interés antes del plazo.";

const REASONS = {
  not_target: {
    zh: "该项目采购的是办公、活动、生活用品、手工具或本地建材等，不属于矿山工业设备或大宗材料，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "Office, events, household goods, hand tools or local building materials — not mining equipment or bulk industrial supply. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Oficina, eventos, artículos domésticos, herramientas manuales o materiales locales — no equipos mineros ni suministro industrial. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  service: {
    zh: "该项目是服务类采购（不含工程建设），需要在智利常驻的服务团队，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "A service contract with no construction scope — it needs a resident team in Chile. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Un contrato de servicios sin obra — requiere un equipo residente en Chile. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  corporate: {
    zh: `该项目是 Codelco 总部的全集团统一采购（多年期品类合同，供各矿区使用），采购标的为工业设备、材料或化学品。${NOTE_ZH}`,
    en: `A Codelco corporate category contract (multi-year, for every division) for industrial equipment, materials or chemicals. ${NOTE_EN}`,
    es: `Un contrato corporativo por categoría de Codelco (plurianual, para todas las divisiones) de equipos, materiales o químicos industriales. ${NOTE_ES}`,
  },
  division: {
    zh: `该项目是 Codelco 单个矿区的工业设备/材料采购或工程。${NOTE_ZH}`,
    en: `Industrial equipment, materials or works for one Codelco division. ${NOTE_EN}`,
    es: `Equipos, materiales u obras industriales para una división de Codelco. ${NOTE_ES}`,
  },
} satisfies Record<string, LocalizedText>;

export function classifyCodelcoRelevance(input: { title: string; procedureType: string | undefined; scopeType: string }): TenderRelevance {
  const text = foldAccents(input.title).toLowerCase();
  if (NOT_TARGET.test(text)) return { tier: "excluded", label: LABELS.excluded, reason: REASONS.not_target };
  if (input.scopeType === "services" && !BUILDS.test(text)) return { tier: "excluded", label: LABELS.excluded, reason: REASONS.service };
  if (input.procedureType?.startsWith(CORPORATE_PREFIX) && input.scopeType !== "services") {
    return { tier: "significant", label: LABELS.significant, reason: REASONS.corporate };
  }
  return { tier: "standard", label: LABELS.standard, reason: REASONS.division };
}
