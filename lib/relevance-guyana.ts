import type { IndustryKey } from "@/lib/industry";
import type { LocalizedText, TenderRelevance, TenderScopeType } from "@/types/tender";

/**
 * Relevance for Guyana's eprocure.gov.gy (lib/ingestion/connectors/guyana-eprocure-live.ts).
 *
 * The user's rule, 2026-09-27: 小项目不要，只要大型工程项目或者采购项目 —
 * large works and large purchases only. The source publishes no amount
 * (estimated_value is 0 on every row), so size is read from what the notice
 * does state:
 *
 *   International Competitive Bidding (ICB), or the World Bank's "international
 *   competitive procurement" → the contract is above the national threshold
 *   and open to foreign firms. Works → 大型 when it is a road, bridge,
 *   pipeline, plant, hospital or grid project, else 中型; goods → 中型.
 *   National Competitive Bidding (NCB) or a Request for Quotation → below
 *   that threshold, and reserved in practice to local contractors — kept
 *   only when the engineer's estimate printed in the title ("EE$36,086,600",
 *   Guyana dollars) reaches US$1 million.
 *   Services and consultancies, office goods and consumables → excluded.
 *
 * Measured on the 35 notices open on 2026-09-27: 6 kept — the World Bank
 * Mahaica–Abary road corridor and five CDB-financed transmission-main lots —
 * and 29 excluded (wells, drainage structures, calculators, lubricants,
 * security guards, GPL's NCB material purchases).
 */

export const GUYANA_SOURCE_NAME = "Guyana — NPTAB eProcurement (eprocure.gov.gy)";

export type GuyanaCompetition = "international" | "national" | null;

export type GuyanaNoticeFacts = {
  competition: GuyanaCompetition;
  /** "World Bank", "Caribbean Development Bank", … — who finances it, when the notice says. */
  financier: string | null;
};

/** 1 USD ≈ 209 GYD (lib/currency.ts). US$1M, the national-bidding keep line. */
export const GUYANA_LARGE_NATIONAL_GYD = 209_000_000;

const FINANCIERS: [RegExp, string][] = [
  [/\bWorld Bank\b|International Development Association|\bIDA[- ]?\d{3,}/i, "World Bank"],
  [/Inter-American Development Bank|\bIDB\b|\bIADB\b/, "Inter-American Development Bank"],
  [/Caribbean Development Bank|\bCDB\b/, "Caribbean Development Bank"],
  [/Islamic Development Bank|\bIsDB\b/, "Islamic Development Bank"],
  [/Export[- ]Import Bank|\bEXIM\b|\bExim Bank\b/i, "Export-Import Bank"],
  [/\bCAF\b|Development Bank of Latin America/, "CAF"],
  [/OPEC Fund/i, "OPEC Fund"],
  [/European Union|\bEU[- ]funded/i, "European Union"],
];

/** What a notice says about competition and financing; both null for a notice with no text. */
export function readGuyanaNotice(noticeText: string | null): GuyanaNoticeFacts {
  if (!noticeText) return { competition: null, financier: null };
  const international = /international competitive (?:procurement|bidding|tender)|\bICB\b|international (?:open )?(?:tender|bidding)/i.test(noticeText);
  const national = /national competitive (?:procurement|bidding|tender)|\bNCB\b|request for quotations?\b|\bRFQ\b|\bshopping\b/i.test(noticeText);
  const financier = FINANCIERS.find(([pattern]) => pattern.test(noticeText))?.[1] ?? null;
  // A World Bank RFQ says "national competitive procurement using a Request for
  // Quotation" — national. An ICB notice never calls itself national.
  return { competition: international ? "international" : national ? "national" : null, financier };
}

/** The engineer's estimate printed in a title, in Guyana dollars: "(EE$36,086,600)". */
export function guyanaTitleEstimateGyd(title: string): number | null {
  const match = /\bEE\s?\$\s?([\d,]{5,})(?:\.\d+)?/i.exec(title);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

const NOT_TARGET =
  /calculator|computer|laptop|printer|toner|stationery|furniture|lubricant|grease|uniform|cleaning|janitorial|security services|catering|food|meals|drug|pharmaceutical|vehicle|motorcycle|boat engine|air[- ]condition|operator'?s house|insurance|unmanned aerial/i;
const BIG_WORKS =
  /\broad\b|highway|corridor|bridge|transmission mains?|pipeline|treatment plant|water supply|hospital|power (?:plant|station)|substation|transmission line|sea defen[cs]e|river defen[cs]e|\bport\b|wharf|airport|runway|\bdam\b|gas[- ]to[- ]energy/i;
const MINOR_WORKS = /timber bridge|foot ?bridge|culvert|fence|shed|latrine/i;

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

function financed(facts: GuyanaNoticeFacts): { zh: string; en: string } {
  if (!facts.financier) return { zh: "", en: "" };
  const zhName: Record<string, string> = {
    "World Bank": "世界银行",
    "Inter-American Development Bank": "美洲开发银行",
    "Caribbean Development Bank": "加勒比开发银行",
    "Islamic Development Bank": "伊斯兰开发银行",
    "Export-Import Bank": "进出口银行",
    CAF: "拉美开发银行（CAF）",
    "OPEC Fund": "欧佩克基金",
    "European Union": "欧盟",
  };
  return { zh: `资金来自${zhName[facts.financier] ?? facts.financier}；`, en: `Financed by the ${facts.financier}. ` };
}

/** How the mapper writes the two notice facts into stored fields, and reads them back. */
export const GUYANA_ICB_LABEL = "International Competitive Bidding (ICB)";
export const GUYANA_NCB_LABEL = "National Competitive Bidding (NCB)";

/**
 * The notice facts again, from what a stored row keeps: the competition in
 * procedure_type, the lender in the summary's "Financed by the …" sentence.
 * This is what lets classifyStoredTender() — and so reclassify and the
 * import's own parity check — give a stored Guyanese row the tier it was
 * imported with, without the notice PDF.
 */
export function guyanaFactsFromStoredFields(procedureType: string | undefined, summary: string): GuyanaNoticeFacts {
  const competition = procedureType?.includes(GUYANA_ICB_LABEL) ? "international" : procedureType?.includes(GUYANA_NCB_LABEL) ? "national" : null;
  const financier = /Financed by the ([^.]+)\./.exec(summary)?.[1]?.trim() ?? null;
  return { competition, financier };
}

export function classifyGuyanaRelevance(input: {
  title: string;
  scopeType: TenderScopeType;
  facts: GuyanaNoticeFacts;
}): TenderRelevance {
  const { title, facts } = input;
  const nature = input.scopeType === "works" ? "works" : input.scopeType === "equipment" ? "goods" : input.scopeType;
  const estimateGyd = guyanaTitleEstimateGyd(title);
  const money = financed(facts);

  if (NOT_TARGET.test(title)) {
    return {
      tier: "excluded",
      label: LABELS.excluded,
      reason: {
        zh: "该项目采购的是办公用品、耗材、车辆或日常服务，不属于大型工程或大宗设备采购，不导入。",
        en: "Office goods, consumables, vehicles or routine services — not large works or a large purchase. Not imported.",
        es: "Artículos de oficina, consumibles, vehículos o servicios rutinarios. No se importa.",
      },
    };
  }
  if (nature.startsWith("services") || nature.startsWith("consult")) {
    return {
      tier: "excluded",
      label: LABELS.excluded,
      reason: {
        zh: "该项目是服务或咨询类采购，不属于工程或设备采购，不导入。",
        en: "A service or consultancy contract, not works or goods. Not imported.",
        es: "Un contrato de servicios o consultoría. No se importa.",
      },
    };
  }

  if (facts.competition === "international") {
    const works = nature.startsWith("works");
    const flagship = works && BIG_WORKS.test(title) && !MINOR_WORKS.test(title);
    return {
      tier: flagship ? "flagship" : "significant",
      label: flagship ? LABELS.flagship : LABELS.significant,
      reason: {
        zh: `该项目采用国际竞争性招标（ICB），外国企业可以投标；${money.zh}${flagship ? "属于公路、桥梁、管网、水厂、医院或电网等大型基础设施工程。" : works ? "属于工程类项目。" : "属于设备或物资采购。"}`,
        en: `International Competitive Bidding — open to foreign firms. ${money.en}${flagship ? "Large infrastructure works (road, bridge, pipeline, plant, hospital or grid)." : works ? "A works contract." : "A supply contract."}`,
        es: `Licitación competitiva internacional, abierta a empresas extranjeras. ${money.en}`,
      },
    };
  }

  if (estimateGyd !== null && estimateGyd >= GUYANA_LARGE_NATIONAL_GYD && !MINOR_WORKS.test(title)) {
    return {
      tier: "significant",
      label: LABELS.significant,
      reason: {
        zh: `该项目为国内招标，但工程师估价约 ${Math.round(estimateGyd / 209 / 10_000) / 100} 百万美元（${estimateGyd.toLocaleString("en-US")} 圭亚那元），规模较大；外国企业通常需与当地公司组成联合体或在当地注册后参与。${money.zh}`,
        en: `National bidding, but the engineer's estimate is GY$${estimateGyd.toLocaleString("en-US")} (about US$${(estimateGyd / 209 / 1e6).toFixed(1)}M). ${money.en}`,
        es: `Licitación nacional con un presupuesto estimado de GY$${estimateGyd.toLocaleString("en-US")}.`,
      },
    };
  }

  return {
    tier: "excluded",
    label: LABELS.excluded,
    reason:
      facts.competition === null
        ? {
            zh: "招标公告没有写明是国际招标还是国内招标（或是扫描件读不出文字），无法确认为大型项目，按小型项目处理，不导入。",
            en: "The notice does not say whether bidding is international or national (or could not be read), so it cannot be confirmed as large. Treated as small; not imported.",
            es: "El aviso no indica si la licitación es internacional o nacional; se trata como pequeña y no se importa.",
          }
        : {
            zh: "该项目为国内招标（NCB）或询价采购，金额低于国际招标门槛，属于面向当地企业的小型项目，不导入。",
            en: "National Competitive Bidding or a Request for Quotation — below the international threshold and aimed at local firms. Not imported.",
            es: "Licitación nacional o solicitud de cotización, por debajo del umbral internacional. No se importa.",
          },
  };
}

/**
 * Industry tags from an English title. lib/industry.ts reads Spanish and
 * lib/relevance-pt.ts Portuguese; neither matches "transmission mains" or
 * "electrification", so without this every Guyanese row would be 综合.
 */
export function guyanaIndustries(title: string): IndustryKey[] {
  const tags = new Set<IndustryKey>();
  if (/electri|transformer|substation|transmission line|\bpower\b|solar|generator|insulator|distribution materials|\bGPL\b/i.test(title)) tags.add("power");
  if (/water|\bwells?\b|drainage|irrigation|sewer|transmission mains?|treatment plant|conservancy|sluice|koker|sea defen/i.test(title)) tags.add("water");
  if (/\broad\b|highway|bridge|corridor|airport|runway|\bport\b|wharf|stelling/i.test(title)) tags.add("transportation");
  if (/hospital|health|clinic|medical/i.test(title)) tags.add("healthcare");
  if (/\bICT\b|network|telecom|fib(?:re|er)|data cent/i.test(title)) tags.add("ict_telecom");
  if (/\boil\b|\bgas\b|mining|petroleum/i.test(title)) tags.add("energy_mining");
  if (/construct|rehabilitat|upgrade|building|school|install/i.test(title)) tags.add("construction");
  if (tags.size > 1) tags.delete("construction");
  return tags.size > 0 ? [...tags] : ["general"];
}
