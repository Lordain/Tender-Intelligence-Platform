import type { LocalizedText, TenderRelevance, TenderScopeType } from "@/types/tender";

/**
 * Pre-Screening / relevance classification (rule-based, not AI — see
 * lib/ingestion/README.md for why: this is a Layer 1 cost-control filter,
 * deciding how much analysis depth a tender is worth, not a qualification
 * judgment). Keyword lists are intentionally not purely "keyword = exclude":
 * a routine-service word like "seguridad" (security) would wrongly exclude
 * genuine opportunities (video surveillance, cybersecurity, access
 * control) if matched blindly, so INCLUDE_OVERRIDE is checked first.
 */

const EXCLUDE_KEYWORDS = [
  /limpieza/i,
  /conserjer[íi]a|conserje/i,
  /guardia de seguridad|vigilante/i,
  /catering|banquete/i,
  /jardiner[íi]a/i,
  /control de plagas|fumigaci[óo]n/i,
  /mensajer[íi]a local|paqueter[íi]a/i,
  /personal temporal|staffing temporal/i,
  /recolecci[óo]n de basura|residuos s[óo]lidos urbanos/i,
  /estacionamiento/i,
  /papeler[íi]a de oficina|art[íi]culos de oficina/i,
  /impresi[óo]n rutinaria|fotocopiado/i,
];

const INCLUDE_OVERRIDE_KEYWORDS = [
  /videovigilancia|video surveillance/i,
  /control de acceso|access control/i,
  /ciberseguridad|cybersecurity/i,
  /centro de comando|command center/i,
  /seguridad electr[óo]nica|electronic security/i,
  /datacenter|centro de datos/i,
  /fibra [óo]ptica|fiber optic/i,
  /\b5g\b/i,
  /subestaci[óo]n|substation/i,
  /transmisi[óo]n el[ée]ctrica|power transmission/i,
  /\bepc\b/i,
];

const FLAGSHIP_INDUSTRY_KEYWORDS = [
  /energ[íi]a|el[ée]ctric|power/i,
  /infraestructura|construcci[óo]n|carretera|puente|ferrocarril|puerto|aeropuerto/i,
  /telecom|comunicaciones|datacenter/i,
  // Medical/health goods. Added deliberately after measuring the real
  // open-tenders export: of the 82 of 515 procedures open to foreign
  // bidders at all, the large majority are health-sector goods (health
  // institutions buy internationally, infrastructure almost never does),
  // so excluding them would hide most of what a foreign bidder can
  // actually bid on. Matches the goods/services themselves, NOT the word
  // "salud" — that appears as the buyer's Ramo on every health-ministry
  // tender including the routine cleaning ones EXCLUDE_KEYWORDS drops.
  /equipo m[ée]dico|medical equipment|equipo de laboratorio/i,
  /osteos[íi]ntesis|endopr[óo]tesis|pr[óo]tesis|implante|ortopedia/i,
  /bomba de infusi[óo]n|ventilador pulmonar|hemodi[áa]lisis|hemodinamia/i,
  /imagenolog[íi]a|radiolog[íi]a|tomograf[íi]a|resonancia|ultrasonido|rayos x/i,
  /laboratorio cl[íi]nico|reactivo/i,
  /medicamento|f[áa]rmaco|insumo m[ée]dico|material de curaci[óo]n/i,
];

// MXN-scale thresholds; a non-MXN value is normalized with a rough
// static rate rather than left uncompared — good enough for a v1 filter,
// not a precise FX conversion.
const FLAGSHIP_VALUE_MXN = 40_000_000;
const SIGNIFICANT_VALUE_MXN = 5_000_000;
const USD_TO_MXN_RATE = 20;

function normalizeToMxn(value: number, currency: string | undefined): number {
  if (currency === "USD") return value * USD_TO_MXN_RATE;
  return value;
}

const LABELS: Record<TenderRelevance["tier"], LocalizedText> = {
  flagship: {
    zh: "旗舰项目 · 建议中资企业重点关注",
    en: "Flagship Project",
    es: "Proyecto Insignia",
  },
  significant: {
    zh: "重点项目 · 中资出海相关度较高",
    en: "Significant Project",
    es: "Proyecto Significativo",
  },
  standard: {
    zh: "常规项目",
    en: "Standard Project",
    es: "Proyecto Estándar",
  },
  excluded: {
    zh: "日常服务类 · 默认不推荐",
    en: "Routine Service (filtered by default)",
    es: "Servicio Rutinario (filtrado por defecto)",
  },
};

function reasonFor(
  tier: TenderRelevance["tier"],
  signal: "value" | "scope" | "industry" | "keyword" | "none",
): LocalizedText {
  if (tier === "excluded") {
    return {
      zh: "该项目属于日常性服务采购，通常不属于中资企业出海投标的重点范围，默认不进入推荐列表（数据仍保留，可用于统计）。",
      en: "This is a routine service procurement, not typically the kind of opportunity worth deep review — filtered from the default feed (metadata is kept, not deleted).",
      es: "Esta es una contratación de servicios rutinarios, no del tipo de oportunidad que suele valer una revisión a fondo — filtrada de la vista predeterminada (los metadatos se conservan).",
    };
  }
  if (tier === "flagship") {
    return {
      zh: "预估金额较大或属于电力/基建/通信等重点行业的工程或设备类项目，属于值得优先分析的大型标。",
      en: "A large-scale opportunity — high estimated value and/or a works/equipment project in a priority sector (energy, infrastructure, telecom).",
      es: "Una oportunidad de gran escala — valor estimado alto y/o un proyecto de obra/equipo en un sector prioritario (energía, infraestructura, telecomunicaciones).",
    };
  }
  if (tier === "significant") {
    return {
      zh: "项目规模或行业属性显示具备一定参与价值，建议纳入常规关注范围。",
      en: "Meaningful scale or scope for a priority sector — worth keeping on your radar.",
      es: "Escala o alcance relevante para un sector prioritario — vale la pena tenerlo en el radar.",
    };
  }
  void signal;
  return {
    zh: "常规规模项目，未触发重点筛选条件。",
    en: "A standard-scale opportunity that didn't trigger any priority signal.",
    es: "Una oportunidad de escala estándar que no activó ninguna señal prioritaria.",
  };
}

export function classifyRelevance(input: {
  title: string;
  summary?: string;
  industry: string;
  scopeType: TenderScopeType;
  estimatedValue?: number;
  currency?: string;
}): TenderRelevance {
  const haystack = [input.title, input.summary, input.industry].filter(Boolean).join(" ");
  const hasIncludeOverride = INCLUDE_OVERRIDE_KEYWORDS.some((pattern) => pattern.test(haystack));

  if (!hasIncludeOverride && EXCLUDE_KEYWORDS.some((pattern) => pattern.test(haystack))) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  const normalizedValue =
    input.estimatedValue !== undefined ? normalizeToMxn(input.estimatedValue, input.currency) : undefined;

  const matchesFlagshipIndustry = FLAGSHIP_INDUSTRY_KEYWORDS.some((pattern) => pattern.test(haystack));
  const isWorksLike = input.scopeType === "works" || input.scopeType === "equipment_services";

  if (
    hasIncludeOverride ||
    (normalizedValue !== undefined && normalizedValue >= FLAGSHIP_VALUE_MXN) ||
    (normalizedValue === undefined && isWorksLike)
  ) {
    return { tier: "flagship", label: LABELS.flagship, reason: reasonFor("flagship", "value") };
  }

  // A target-industry match counts on its own, not only for works-like
  // scope. It used to be gated behind `isWorksLike`, which made
  // FLAGSHIP_INDUSTRY_KEYWORDS dead for every equipment/services tender —
  // and since the open-tenders export carries no value at all, that meant
  // an ICT, power or medical-equipment purchase could never rank above
  // "standard" no matter how well it matched the target sectors.
  if (
    (normalizedValue !== undefined && normalizedValue >= SIGNIFICANT_VALUE_MXN) ||
    matchesFlagshipIndustry
  ) {
    return { tier: "significant", label: LABELS.significant, reason: reasonFor("significant", "scope") };
  }

  return { tier: "standard", label: LABELS.standard, reason: reasonFor("standard", "none") };
}
