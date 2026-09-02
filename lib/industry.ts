/**
 * Multi-tag industry classification (rule-based keyword matching, same
 * posture as lib/relevance.ts's Pre-Screening classifier — a Layer 1
 * heuristic, not an LLM call). A tender can genuinely belong to more than
 * one category (e.g. a railway project is both "transportation" and
 * "construction"; a power-plant SCADA upgrade is both "power" and
 * "ict_telecom"), so this returns an array rather than picking one.
 *
 * Built because most real connectors (PEMEX, DOF, DOF-search, CompraNet5,
 * Compras MX open tenders) never had a real industry field to begin with —
 * they hardcoded `industry = "General"`. Only compras-mx-contracts-mapper.ts
 * (real "Descripción Ramo" column) and ocds-mapper.ts (OCDS item
 * classification) had anything real, and even those are broad government-
 * branch labels, not the kind of category a bidder filters by. This
 * classifier runs uniformly across every source instead: callers pass
 * whatever real text they have (title + description, plus a real category
 * field like "Descripción Ramo" when one exists) and let keyword matching
 * do the rest — a source's own real field just becomes one more signal in
 * the haystack, not a special case.
 *
 * Category set: minimum required set is education/healthcare/tax/energy/
 * power/ict_telecom/transportation/construction (product decision); mining/
 * water/manufacturing added on top since they're common, real categories in
 * Mexican public procurement (LOPSRM covers agua potable constantly, for
 * one). "energy" and "power" are deliberately separate, not one merged
 * category: "energy" is oil & gas / renewables (PEMEX-shaped), "power" is
 * the electricity grid itself (CFE-shaped) — different buyers, different
 * bidder pools, real enough of a distinction in Mexico that lumping them
 * together would blur exactly the signal a filter exists to give.
 */

export type IndustryKey =
  | "education"
  | "healthcare"
  | "tax"
  | "energy"
  | "power"
  | "ict_telecom"
  | "transportation"
  | "construction"
  | "manufacturing"
  | "mining"
  | "water"
  | "general";

/** Every defined category, in the order the filter UI should list them (required-minimum set first, extras after, "general" last as the catch-all). */
export const ALL_INDUSTRIES: IndustryKey[] = [
  "education",
  "healthcare",
  "tax",
  "energy",
  "power",
  "ict_telecom",
  "transportation",
  "construction",
  "manufacturing",
  "mining",
  "water",
  "general",
];

const INDUSTRY_KEYWORDS: [IndustryKey, RegExp][] = [
  ["education", /educaci[óo]n|escuela\b|plantel educativo|universidad|instituto tecnol[óo]gico|mobiliario escolar|infraestructura educativa|centro educativo/i],
  // Deliberately equipment/facility only — osteosíntesis/endoprótesis/
  // prótesis/implante/ortopedia/reactivo/medicamento/fármaco/insumo
  // médico/material de curación are medical CONSUMABLES, not equipment;
  // removed to match lib/relevance.ts's same "equipment only, not
  // consumables" scope decision (see README.md) — a tender relevance.ts
  // now excludes shouldn't still carry a "healthcare" tag implying it's a
  // target opportunity.
  ["healthcare", /equipo m[ée]dico|equipo de laboratorio|bomba de infusi[óo]n|ventilador pulmonar|hemodi[áa]lisis|hemodinamia|imagenolog[íi]a|radiolog[íi]a|tomograf[íi]a|resonancia magn[ée]tica|hospital\b|unidad m[ée]dica|servicios de salud|\bsalud\b/i],
  ["tax", /administraci[óo]n tributaria|fiscalizaci[óo]n|declaraci[óo]n fiscal|sistema de recaudaci[óo]n|\bsat\b|servicio de administraci[óo]n tributaria|padr[óo]n de contribuyentes|aduanas?\b|hacienda y cr[ée]dito p[úu]blico/i],
  ["energy", /petr[óo]leo|petroqu[íi]mic[ao]|hidrocarburo|perforaci[óo]n|refiner[íi]a|gas natural|ducto\b|oleoducto|gasoducto|\bpemex\b|petr[óo]leos mexicanos|yacimiento|pozo petrolero|energ[íi]a renovable|planta solar|e[óo]lic[ao]|fotovoltaic[ao]|geot[ée]rmic[ao]|biocombustible/i],
  ["power", /energ[íi]a el[ée]ctrica|electricidad|subestaci[óo]n|transmisi[óo]n el[ée]ctrica|generaci[óo]n el[ée]ctrica|red el[ée]ctrica|distribuci[óo]n el[ée]ctrica|\bcfe\b|comisi[óo]n federal de electricidad/i],
  ["ict_telecom", /telecomunicaci|datacenter|centro de datos|fibra [óo]ptica|red de comunicaciones|software|sistema inform[áa]tico|\btic\b|\b5g\b|ciberseguridad/i],
  ["transportation", /transporte p[úu]blico|movilidad urbana|vialidad\b|sistema de transporte|autob[úu]s|tren de pasajeros|metro\b|log[íi]stica de transporte|se[ñn]alizaci[óo]n vial|comunicaciones y transportes/i],
  ["construction", /construcci[óo]n|obra p[úu]blica|carretera|puente\b|ferrocarril|puerto\b|aeropuerto|edificaci[óo]n|pavimentaci[óo]n|infraestructura vial/i],
  ["manufacturing", /maquinaria industrial|equipo industrial|planta industrial|l[íi]nea de producci[óo]n|manufactura/i],
  ["mining", /miner[íi]a|mineral(?!es de construcci)|yacimiento minero|concesi[óo]n minera/i],
  ["water", /agua potable|saneamiento|drenaje|alcantarillado|planta de tratamiento de agua|planta potabilizadora/i],
];

/** Matches against real Spanish-language text (title/description, plus any real category field a source provides) — never guesses from a buyer name alone. Falls back to ["general"] rather than an empty array, so every tender has at least one tag to display/filter by. */
export function classifyIndustries(...texts: (string | undefined)[]): IndustryKey[] {
  const haystack = texts.filter(Boolean).join(" ");
  const matched = INDUSTRY_KEYWORDS.filter(([, pattern]) => pattern.test(haystack)).map(([key]) => key);
  return matched.length > 0 ? matched : ["general"];
}
