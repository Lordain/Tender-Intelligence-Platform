import type { IndustryKey } from "@/lib/industry";
import type { LocalizedText, TenderRelevance, TenderScopeType } from "@/types/tender";
import { guyanaIndustries } from "@/lib/relevance-guyana";

/**
 * Relevance for Suriname's gov.sr 「Aanbestedingen」 (lib/ingestion/suriname-notice.ts).
 *
 * The user's rule, 2026-10-16 (A — 和圭亚那一样), Guyana's rule
 * (lib/relevance-guyana.ts) applied to Suriname. No post states an amount,
 * so the procedure is the size signal:
 *
 *   International Competitive Bidding (ICB) → open to foreign firms and above
 *   the national threshold. Works → 大型 when it is a road, bridge, pipeline,
 *   plant, hospital or grid project, else 中型; goods → 中型.
 *   National Competitive Bidding (NCB), a notice that does not say, an
 *   expression of interest for consultants → excluded.
 *   A purchase of only books, furniture, stationery, food, uniforms or
 *   vehicles → excluded, ICB or not.
 *
 * Unlike Guyana's list, furniture does not exclude a call that buys
 * equipment too: 「Supply and delivery of Medical Equipment and Furniture on
 * behalf of the Academic Hospital Paramaribo」 is critical-care and clinical
 * equipment with a furniture lot.
 *
 * Measured on the 15 posts of 3 June – 24 September 2026: 6 kept (hospital
 * equipment, the Reeberg design-and-build, school renovation equipment,
 * heavy machinery, fertilizer, the IDB data-centre equipment).
 */

export const SURINAME_SOURCE_NAME = "Suriname — gov.sr Aanbestedingen (Ministerie van Financiën en Planning)";

/** How suriname-mapper.ts writes the procedure into procedure_type, and how it is read back. */
export const SURINAME_ICB_LABEL = "International Competitive Bidding (ICB)";
export const SURINAME_NCB_LABEL = "National Competitive Bidding (NCB)";
export const SURINAME_EOI_LABEL = "Request for Expressions of Interest (consulting)";

const MINOR_GOODS =
  /\bbooks?\b|schoolbooks|furniture|stationery|office supplies|uniforms?|food|meals|catering|cleaning|janitorial|security services|vehicles?|\bcars?\b|motorcycles?|insurance/i;
/** Named next to a minor good, these make it a real equipment or works call. */
const REAL_SCOPE = /equipment|machinery|hardware|\bworks\b|construction|design and build|installation/i;
const BIG_WORKS =
  /\broads?\b|highway|corridor|bridge|transmission mains?|pipeline|treatment plant|water supply|hospital|power (?:plant|station)|substation|transmission line|sea defen[cs]e|\bport\b|wharf|airport|runway|\bdam\b/i;
const MINOR_WORKS = /turf|footbridge|culvert|fence|shed|latrine|toilet/i;

const LABELS: Record<TenderRelevance["tier"], LocalizedText> = {
  flagship: { zh: "大型项目 · 建议中资企业重点关注", en: "Flagship Project", es: "Proyecto Insignia" },
  significant: { zh: "中型项目 · 中资出海相关度较高", en: "Significant Project", es: "Proyecto Significativo" },
  standard: { zh: "常规项目", en: "Standard Project", es: "Proyecto Estándar" },
  excluded: { zh: "已过滤", en: "Filtered", es: "Filtrado" },
};

function excluded(zh: string, en: string): TenderRelevance {
  return { tier: "excluded", label: LABELS.excluded, reason: { zh, en, es: en } };
}

/** Who pays, from the summary the mapper writes ("Financed by the …."). */
function financier(summary: string): { zh: string; en: string } {
  const name = /Financed by the ([^.(]+)/.exec(summary)?.[1]?.trim();
  if (!name) return { zh: "", en: "" };
  const zhName: Record<string, string> = {
    "Republic of Suriname's February 2026 Social Bond": "苏里南政府 2026 年 2 月发行的社会债券",
    "Inter-American Development Bank": "美洲开发银行",
    "World Bank": "世界银行",
    "Caribbean Development Bank": "加勒比开发银行",
    "Islamic Development Bank": "伊斯兰开发银行",
    "European Union": "欧盟",
    "Agence Française de Développement": "法国开发署",
  };
  return { zh: `资金来自${zhName[name] ?? name}；`, en: `Financed by the ${name}. ` };
}

export function classifySurinameRelevance(input: { title: string; summary: string; scopeType: TenderScopeType; procedureType: string | undefined }): TenderRelevance {
  const { title, summary, scopeType, procedureType } = input;

  if (MINOR_GOODS.test(title) && !REAL_SCOPE.test(title)) {
    return excluded(
      "该项目采购的是书本、家具、文具、车辆或日常用品服务，不属于大型工程或设备采购，不导入。",
      "Books, furniture, stationery, vehicles or routine goods and services — not large works or equipment. Not imported.",
    );
  }
  if (scopeType === "consulting" || scopeType === "services" || procedureType?.includes(SURINAME_EOI_LABEL)) {
    return excluded("该项目是咨询或服务类采购（意向征询），不属于工程或设备采购，不导入。", "A consultancy or service contract (expression of interest), not works or goods. Not imported.");
  }
  if (procedureType?.includes(SURINAME_ICB_LABEL)) {
    const works = scopeType === "works";
    const flagship = works && BIG_WORKS.test(title) && !MINOR_WORKS.test(title);
    const money = financier(summary);
    return {
      tier: flagship ? "flagship" : "significant",
      label: flagship ? LABELS.flagship : LABELS.significant,
      reason: {
        zh: `该项目采用国际竞争性招标（ICB），外国企业可以投标；${money.zh}${flagship ? "属于公路、桥梁、管网、水厂、医院或电网等大型基础设施工程。" : works ? "属于工程类项目。" : "属于设备或物资采购。"}苏里南不公布预算金额。`,
        en: `International Competitive Bidding — open to foreign firms. ${money.en}${flagship ? "Large infrastructure works." : works ? "A works contract." : "A supply contract."} Suriname publishes no budget.`,
        es: `Licitación competitiva internacional, abierta a empresas extranjeras. ${money.en}`,
      },
    };
  }
  if (procedureType?.includes(SURINAME_NCB_LABEL)) {
    return excluded("该项目为国内招标（NCB），面向当地企业，且没有公布金额，按小型项目处理，不导入。", "National Competitive Bidding, aimed at local firms, with no amount published. Treated as small; not imported.");
  }
  return excluded(
    "招标公告没有写明是国际招标还是国内招标，无法确认为大型项目，不导入。",
    "The notice does not say whether bidding is international or national, so it cannot be confirmed as large. Not imported.",
  );
}

/**
 * Guyana's English keyword pass, plus what Suriname's titles name and it
 * does not: IT and data-storage equipment, excavators and tractors, and
 * housing or design-and-build works.
 */
export function surinameIndustries(title: string, scopeType: TenderScopeType): IndustryKey[] {
  if (/\bIT equipment\b|data storage|\bservers?\b|e-government|\bhardware\b|digitali[sz]ation/i.test(title)) return ["ict_telecom"];
  if (/machinery|excavators?|tractors?|bulldozers?/i.test(title)) return ["heavy_equipment"];
  const tags = guyanaIndustries(title);
  if (tags.length === 1 && tags[0] === "general" && (scopeType === "works" || /housing|design and build/i.test(title))) return ["construction"];
  return tags;
}
