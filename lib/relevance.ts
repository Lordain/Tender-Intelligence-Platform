import type { LocalizedText, TenderRelevance, TenderScopeType } from "@/types/tender";
import { convertToUsd } from "@/lib/currency";

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
  /guardia de seguridad|vigilante|servicio de vigilancia/i,
  /catering|banquete|comedor|servicio de alimentos|servicio de comida/i,
  /jardiner[íi]a|poda de [áa]rboles|[áa]reas verdes/i,
  /control de plagas|fumigaci[óo]n/i,
  /mensajer[íi]a local|paqueter[íi]a/i,
  /personal temporal|staffing temporal/i,
  /recolecci[óo]n de basura|residuos s[óo]lidos urbanos/i,
  /estacionamiento/i,
  /papeler[íi]a de oficina|art[íi]culos de oficina|material de oficina|consumibles de oficina/i,
  /impresi[óo]n rutinaria|fotocopiado/i,
  // Added without a real observed case yet (see lib/ingestion/README.md
  // for this project's normal "confirmed real, not guessed" bar) —
  // these are common, well-established routine-procurement categories
  // across Mexican/Colombian government tenders, added deliberately
  // conservative (specific phrases, not bare words) to keep the same
  // low-false-positive posture as the rest of this list.
  /uniformes/i,
  /arrendamiento de veh[íi]culos|renta de veh[íi]culos/i,
  /agua embotellada|garraf[óo]n(es)? de agua/i,
  /recarga de extintores/i,
  /art[íi]culos de aseo|insumos de aseo/i,
  /cafeter[íi]a|servicio de caf[ée]/i,
  /telefon[íi]a fija|l[íi]nea telef[óo]nica/i,
  // License/consumables batch — also added without a real observed case
  // (searched every fixture and every real finding documented in
  // README.md first; none of these terms appear in either). Deliberately
  // scoped to "for our own internal operations" phrasing rather than a
  // bare "combustible"/"gas"/"químicos", which would also catch a real
  // large-value fuel-supply-for-power-plant or industrial-process-
  // chemical contract — a genuinely different, potentially flagship-tier
  // category this list must not swallow. The chemicals pattern
  // deliberately avoids "reactivo" (already a FLAGSHIP_INDUSTRY_KEYWORDS
  // term for clinical lab reagents) so the two lists can't collide on
  // the same tender.
  /licencia(s)? de software|licenciamiento de software|renovaci[óo]n de licencia(s)?|suscripci[óo]n de software/i,
  /combustible para (el parque vehicular|veh[íi]culos)|suministro de gasolina y di[ée]sel/i,
  /gas lp para (cocina|oficinas|comedor)|suministro de gas dom[ée]stico/i,
  /qu[íi]micos de limpieza|productos qu[íi]micos para tratamiento de agua|insumos qu[íi]micos de limpieza/i,
  // Real observed titles the user flagged from the live site (confirmed
  // real, not guessed — the first batch this session grounded in actual
  // titles rather than domain knowledge alone). Each pattern is scoped to
  // the specific real phrase, not a broad generalization from it.
  /mantenimiento de camino(s)?/i, // MANTENIMIENTO DE CAMINO — routine road upkeep, not new road construction
  /gr[úu]a viajera/i, // PROYECTO GRÚA VIAJERA — a single overhead-crane purchase, not an infrastructure project
  /capacitaci[óo]n|adiestramiento/i, // training services — routine staff training, named as a category (no single title quoted)
  /refacciones y accesorios|refacciones para equipo/i, // ADQ. DE REFACCIONES Y ACCESORIOS PARA EQUIPO DE CÓMPUTO Y TELECOMUNICACIONES — spare parts, would otherwise hit the "telecom" FLAGSHIP_INDUSTRY_KEYWORDS match
  /torres? de enfriamiento|unidades? paquete/i, // SERVICIO DE MANTENIMIENTO PREVENTIVO A TORRES DE ENFRIAMIENTO, UNIDADES PAQUETE — routine HVAC/industrial-unit maintenance
  /sanitarios rurales|letrinas/i, // CONSTRUCCIÓN DE 53 SANITARIOS RURALES — small-scale rural sanitation, would otherwise hit the "construcción" FLAGSHIP_INDUSTRY_KEYWORDS match
  /adquisici[óo]n de alimentos|adquisici[óo]n alimentos|compra de alimentos/i, // ADQUISICIÓN ALIMENTOS PROGRAMA APOYO A ESPACIOS REFUGIO... — food supply for a social program, not a catering service (already covered) but still routine goods
  /soporte (t[ée]cnico )?(al |de )?hardware y software|mantenimiento de licencia(s)?/i, // SERVICIO DE SOPORTE AL HARDWARE Y SOFTWARE ORACLE — vendor IT support/maintenance, distinct from the license-renewal phrasing already covered above
  /apoyo log[íi]stico|servicio log[íi]stico/i, // SERVICIO INTEGRAL Y APOYO LOGÍSTICO PARA EL DESARROLLO DE ASAMBLEAS INFORMATIVAS — event logistics support
  // Medical consumables — moved from FLAGSHIP_INDUSTRY_KEYWORDS above,
  // not newly invented (see the comment there): implants/prosthetics,
  // lab reagents, drugs, and generic medical supplies are materials, not
  // the equipment this platform targets.
  /osteos[íi]ntesis|endopr[óo]tesis|pr[óo]tesis|implante|ortopedia/i, // ADQUISICIÓN Y SUMINISTRO DE INSUMOS DE OSTEOSÍNTESIS Y ENDOPRÓTESIS
  /reactivo/i,
  /medicamento|f[áa]rmaco|insumo m[ée]dico|material de curaci[óo]n/i,
  // Real observed titles, second batch. Two of these are the same class
  // of bug as "refacciones"/"sanitarios rurales" above — a SERVICE or
  // small-scale local work that happens to contain a word
  // FLAGSHIP_INDUSTRY_KEYWORDS or an industry tag treats as a positive
  // signal (imaging modality name; "construcción"; the "water"/"education"
  // industries.ts tag, which the allowlist gate — see README.md — would
  // otherwise let through since it only gates tenders with NO industry
  // tag at all).
  /consumibles y accesorios|tamizaje card[íi]aco/i, // ADQ CONSUMIBLES Y ACCESORIOS TAMIZAJE CARDIACO — medical consumables, not equipment
  /servicio m[ée]dico subrogado|servicio (m[ée]dico )?(para|de) tratamiento/i, // SERVICIO MÉDICO SUBROGADO DE RESONANCIA MAGNÉTICA; SERVICIO PARA TRATAMIENTO SAOS — an outsourced medical SERVICE, not an equipment purchase — would otherwise hit the "resonancia" FLAGSHIP_INDUSTRY_KEYWORDS match. Scoped to require "servicio" as the anchor so a genuine "equipo ... para tratamiento oncológico" (an equipment purchase) doesn't match.
  /actualizaci[óo]n,? mantenimiento preventivo y soporte|mantenimiento preventivo y soporte/i, // SERVICIO INTEGRAL PARA LA ACTUALIZACIÓN, MANTENIMIENTO PREVENTIVO Y SOPORTE — routine IT/systems support
  /mobiliario (y equipo )?para (equipar )?aula|equipar aula multisensorial/i, // ADQUISICIÓN DE MOBILIARIO Y EQUIPO PARA EQUIPAR AULA MULTISENSORIAL — routine classroom furniture, small-scale despite the real "education" industry tag
  /rehabilitaci[óo]n de (sistemas? de )?captaci[óo]n de agua|rehab\.? de sistemas? de captaci[óo]n/i, // REHAB. DE SISTEMAS DE CAPTACIÓN DE AGUA POTABLE — small rural water-system repair, not real water infrastructure, despite the real "water" industry tag
  /aire acondicionado|climatizaci[óo]n/i, // MTTO AIRE ACONDICIONADO — routine HVAC maintenance
  /embanquetado|banquetas?\b/i, // EMBANQUETADO EN CALLE PABLO GONZALEZ — one street's sidewalk work
  /productos alimenticios/i, // ADQUISICIÓN DE PRODUCTOS ALIMENTICIOS PARA PERSONAS — food supply, different phrasing from "alimentos" above
  /circuito hidr[áa]ulico/i, // CONSTRUCCIÓN CIRCUITO HIDRAULICO DEL SECTOR 3A — one small neighborhood's local pipe network, would otherwise hit the "construcción" FLAGSHIP_INDUSTRY_KEYWORDS match
  /alberca(s)?/i, // SV. MANTO. ALBERCAS — swimming pool maintenance
  // "ARTÍCULOS DE ASEO GRUPO DE SUMINISTRO 350" from this same batch is
  // already covered by the "artículos de aseo" pattern above — no new
  // entry needed.
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
  // Deliberately EQUIPMENT only — real observed data showed this list was
  // catching medical CONSUMABLES too (osteosíntesis/endoprótesis implants,
  // lab reagents, drugs, generic supplies), per explicit user direction:
  // "我们只做医疗设备" (this platform targets medical equipment, not
  // consumables/materials). Those terms moved to EXCLUDE_KEYWORDS below —
  // removed from here entirely rather than left duplicated, since a term
  // that's always caught by EXCLUDE_KEYWORDS first serves no purpose
  // staying in this list too and would misleadingly look like it still
  // does.
  /equipo m[ée]dico|medical equipment|equipo de laboratorio/i,
  /bomba de infusi[óo]n|ventilador pulmonar|hemodi[áa]lisis|hemodinamia/i,
  /imagenolog[íi]a|radiolog[íi]a|tomograf[íi]a|resonancia|ultrasonido|rayos x/i,
];

// USD-scale thresholds (the whole platform standardizes display and
// classification on USD — see lib/currency.ts). Any value is normalized
// through that shared, approximate rate table before comparing — without
// it, e.g. a real COP 57,333,333 tender (worth roughly USD 13,650) would
// be compared directly against a threshold sized for MXN/USD-scale
// figures and wildly over-classified.
const FLAGSHIP_VALUE_USD = 2_000_000;
const SIGNIFICANT_VALUE_USD = 250_000;

/**
 * A real, known contract value under this floor isn't worth a Chinese
 * enterprise's time to fly out and bid on, regardless of industry.
 * Raised from an initial 10,000 to 50,000 per the user's explicit call —
 * still well below SIGNIFICANT_VALUE_USD, so it only catches genuinely
 * small purchases, not the flagship/significant contracts those tiers
 * are meant to surface. Deliberately does NOT apply when estimatedValue
 * is missing (most Mexican open-tenders rows carry no value at all —
 * absence isn't evidence of smallness) or when hasIncludeOverride
 * matched (the same override that protects a flagged technical category
 * from EXCLUDE_KEYWORDS should also protect it from being dismissed on
 * value alone).
 */
const MIN_VALUE_USD = 50_000;

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
    zh: "日常服务类/小额标 · 默认不推荐",
    en: "Routine/Low-Value (filtered by default)",
    es: "Rutinario/Bajo Valor (filtrado por defecto)",
  },
};

const EXCLUDED_REASON_BY_SIGNAL: Record<"keyword" | "value" | "industry", LocalizedText> = {
  keyword: {
    zh: "该项目属于日常性服务采购，通常不属于中资企业出海投标的重点范围，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This is a routine service procurement, not typically the kind of opportunity worth deep review — filtered from the default feed (metadata is kept, not deleted).",
    es: "Esta es una contratación de servicios rutinarios, no del tipo de oportunidad que suele valer una revisión a fondo — filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  value: {
    zh: `该项目预估金额低于 $${MIN_VALUE_USD.toLocaleString("en-US")} 美元，规模过小，通常不值得中资企业专门出海投标，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `Estimated value is under $${MIN_VALUE_USD.toLocaleString("en-US")} — too small to be worth bidding on from abroad, filtered from the default feed (metadata is kept, not deleted).`,
    es: `El valor estimado es menor a $${MIN_VALUE_USD.toLocaleString("en-US")} — demasiado pequeño para justificar una oferta desde el extranjero, filtrada de la vista predeterminada (los metadatos se conservan).`,
  },
  industry: {
    zh: "该项目未匹配到任何重点行业，且没有可参考的预估金额，信息过少，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This tender doesn't match any priority industry and carries no estimated value — too little signal to surface by default (metadata is kept, not deleted).",
    es: "Esta licitación no coincide con ningún sector prioritario y no tiene valor estimado — muy poca señal para mostrarla por defecto (los metadatos se conservan).",
  },
};

function reasonFor(
  tier: TenderRelevance["tier"],
  signal: "value" | "scope" | "industry" | "keyword" | "none",
): LocalizedText {
  if (tier === "excluded") {
    return EXCLUDED_REASON_BY_SIGNAL[signal === "value" || signal === "industry" ? signal : "keyword"];
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
  industries: string[];
  scopeType: TenderScopeType;
  estimatedValue?: number;
  currency?: string;
}): TenderRelevance {
  const haystack = [input.title, input.summary, ...input.industries].filter(Boolean).join(" ");
  const hasIncludeOverride = INCLUDE_OVERRIDE_KEYWORDS.some((pattern) => pattern.test(haystack));

  if (!hasIncludeOverride && EXCLUDE_KEYWORDS.some((pattern) => pattern.test(haystack))) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  const normalizedValue =
    input.estimatedValue !== undefined ? (convertToUsd(input.estimatedValue, input.currency) ?? undefined) : undefined;

  if (!hasIncludeOverride && normalizedValue !== undefined && normalizedValue < MIN_VALUE_USD) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "value") };
  }

  const matchesFlagshipIndustry = FLAGSHIP_INDUSTRY_KEYWORDS.some((pattern) => pattern.test(haystack));
  const isWorksLike = input.scopeType === "works" || input.scopeType === "equipment_services";

  if (
    hasIncludeOverride ||
    (normalizedValue !== undefined && normalizedValue >= FLAGSHIP_VALUE_USD) ||
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
    (normalizedValue !== undefined && normalizedValue >= SIGNIFICANT_VALUE_USD) ||
    matchesFlagshipIndustry
  ) {
    return { tier: "significant", label: LABELS.significant, reason: reasonFor("significant", "scope") };
  }

  // Allowlist gate (hybrid with the EXCLUDE_KEYWORDS blocklist above — see
  // README.md "Allowlist gate", built after the user flagged that an
  // ever-growing blocklist can't be the whole strategy). Everything
  // reaching this point already failed every positive signal above: not
  // keyword-excluded, not below the value floor, didn't match
  // FLAGSHIP_INDUSTRY_KEYWORDS, didn't clear SIGNIFICANT_VALUE_USD. If it
  // ALSO carries no target-industry tag at all (industries is exactly
  // ["general"] — classifyIndustries()'s fallback for "no keyword
  // matched") and no known value, there is nothing distinguishing it from
  // noise, so it's excluded too rather than shown by default. A tender
  // with a real value (even below SIGNIFICANT_VALUE_USD) still shows as
  // "standard" — a concrete dollar figure is itself a legitimizing signal
  // even when the source text just doesn't use any INDUSTRY_KEYWORDS
  // phrasing. Deliberately NOT gating on FLAGSHIP_INDUSTRY_KEYWORDS here
  // (already checked above) — this uses input.industries, the multi-tag
  // classifyIndustries() result callers already computed, so a tender
  // tagged by a real source field (e.g. "Descripción Ramo") still counts
  // even if its title text alone wouldn't match FLAGSHIP_INDUSTRY_KEYWORDS.
  const hasTargetIndustry = input.industries.some((i) => i !== "general");
  if (!hasTargetIndustry && normalizedValue === undefined) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "industry") };
  }

  return { tier: "standard", label: LABELS.standard, reason: reasonFor("standard", "none") };
}
