import type { LocalizedText, TenderRelevance } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";

/**
 * Relevance for Cemig's e-Compras processes (lib/ingestion/connectors/cemig-live.ts).
 *
 * Own rules, for two reasons the general classifier cannot know about:
 *
 *  - The pregão exception. Everywhere else on this site a pregão eletrônico
 *    is excluded as a small, price-only purchase. Cemig buys its GRID
 *    EQUIPMENT by pregão — transmission towers up to 550 kV, 345/500 kV post
 *    insulators, power transformers — 15 of the 22 processes open on
 *    2026-09-25 were pregões. The user's call (2026-09-25, 要不要对 Cemig 单独
 *    放行电子竞价，只保留设备和材料类 ← OK): for this source, a pregão for
 *    goods is kept; a pregão for services is not.
 *  - No amounts. Cemig publishes none (Lei 13.303 lets it keep the budget
 *    confidential), so the general "no amount, no industry keyword" gate
 *    would drop most of these. What the process does say is WHAT kind of
 *    process it is (the rule: "Pregão Eletrônico - Material", "Licitação
 *    Eletrônica – Soluções Integradas", "Credenciamento") and which supply
 *    segment it is for ("ESTRUTURA METÁLICA P/LINHA TRANSMISSÃO ATÉ 550kV").
 *    Both are stored — the rule in procedureType, the segments in the
 *    summary — so reclassifying a stored row gives the same answer.
 *
 *   credenciamento / pré-qualificação → excluded (not a purchase)
 *   services → excluded, unless they build grid (subestação, linha, montagem)
 *   goods: office, IT, air conditioning, hand tools, instruments → excluded
 *   goods or integrated solutions at transmission voltage → 中型
 *   other goods (distribution transformers, connectors, bus bars…) → 常规
 */

export const CEMIG_SOURCE_NAME = "Cemig — e-Compras (Lei 13.303)";

const NOT_A_PURCHASE = /credenciamento|pre-?qualificacao/;
const SERVICES_RULE = /servico/;
const INTEGRATED_RULE = /solucoes integradas/;
const BUILDS_GRID = /\bsubestac|linhas? de (?:transmissao|distribuicao)|\bmontagem\b|\bimplantacao\b|\bconstrucao\b/;
const NOT_TARGET =
  /ar-?condicionad|condicionador (?:de )?ar|informatica|\binf-|tecnologia da operacao|ferramenta|termovisor|instrumento|mobiliario|escritorio|uniforme|vestuario|calcado|\bepi\b|protecao individual|limpeza|aliment|papel|toner|\bveiculos?\b|impressao/;
const TRANSMISSION_GRADE = /transmiss|\b(?:230|345|440|500|525|550|765) ?kv\b|ate 550 ?kv|maior ou igual a 230/;

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

const NOTE_ZH = "Cemig 不公布预算金额；招标文件（Edital）可在 e-Compras 平台公开下载，投标需先在 Cemig 注册为供应商。";
const NOTE_EN = "Cemig publishes no budget; the edital is a public download on e-Compras, and bidding requires registering as a Cemig supplier.";
const NOTE_ES = "Cemig no publica presupuesto; el edital se descarga libremente en e-Compras y para ofertar hay que registrarse como proveedor de Cemig.";

const REASONS = {
  not_a_purchase: {
    zh: "该流程是供应商资格登记（Credenciamento / Pré-qualificação），不是具体采购，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "A supplier accreditation or pre-qualification, not a purchase. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Una acreditación o precalificación de proveedores, no una compra. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  service: {
    zh: "该项目是服务类采购（不含电网工程建设），需要在巴西本地常驻的服务团队，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "A service contract with no grid construction scope — it needs a resident team in Brazil. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Un contrato de servicios sin obra de red — requiere un equipo residente en Brasil. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  not_target: {
    zh: "该项目采购的是办公、IT、空调、手工具或仪器等，不属于电网设备或大宗材料，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "Office, IT, air conditioning, hand tools or instruments — not grid equipment or bulk material. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Oficina, TI, aire acondicionado, herramientas o instrumentos — no equipos de red ni materiales a granel. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  transmission: {
    zh: `该项目是 Cemig（米纳斯吉拉斯州电力公司）输电等级（230 kV 以上或输电线路）的设备、材料或整体解决方案采购。${NOTE_ZH}`,
    en: `Transmission-grade (230 kV and above, or transmission line) equipment, material or integrated solution for Cemig. ${NOTE_EN}`,
    es: `Equipos, materiales o solución integrada de nivel de transmisión (230 kV o más, o línea de transmisión) para Cemig. ${NOTE_ES}`,
  },
  grid: {
    zh: `该项目是 Cemig（米纳斯吉拉斯州电力公司）的电网设备或材料采购。${NOTE_ZH}`,
    en: `Grid equipment or material for Cemig. ${NOTE_EN}`,
    es: `Equipos o materiales de red para Cemig. ${NOTE_ES}`,
  },
} satisfies Record<string, LocalizedText>;

function tier(tierName: TenderRelevance["tier"], reason: LocalizedText): TenderRelevance {
  return { tier: tierName, label: LABELS[tierName], reason };
}

export function classifyCemigRelevance(input: { title: string; summary?: string; procedureType: string | undefined }): TenderRelevance {
  const rule = foldAccents(input.procedureType ?? "").toLowerCase();
  const text = foldAccents(`${input.title} ${input.summary ?? ""}`).toLowerCase();

  if (NOT_A_PURCHASE.test(rule)) return tier("excluded", REASONS.not_a_purchase);
  if (SERVICES_RULE.test(rule) && !INTEGRATED_RULE.test(rule) && !BUILDS_GRID.test(text)) return tier("excluded", REASONS.service);
  if (NOT_TARGET.test(text)) return tier("excluded", REASONS.not_target);
  if (TRANSMISSION_GRADE.test(text)) return tier("significant", REASONS.transmission);
  return tier("standard", REASONS.grid);
}
