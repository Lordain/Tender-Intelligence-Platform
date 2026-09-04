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
 * water added on top since they're common, real categories in Mexican
 * public procurement (LOPSRM covers agua potable constantly, for one).
 * "energy" and "power" are deliberately separate, not one merged category:
 * "energy" is oil & gas / renewables (PEMEX-shaped), "power" is the
 * electricity grid itself (CFE-shaped) — different buyers, different
 * bidder pools, real enough of a distinction in Mexico that lumping them
 * together would blur exactly the signal a filter exists to give.
 *
 * "manufacturing" was removed entirely (2026-09-04, per explicit user
 * request: "把制造业这行业删除，我们不考虑") — not this platform's target
 * scope, so no future tender should ever be tagged with it. Not folded
 * into "general" via a compatibility shim, since removing the category
 * cleanly matches the "trust internal code, no unnecessary fallback"
 * project convention — any already-stored "manufacturing" tag on an
 * existing row is harmless leftover data, cleared the next time that row
 * is re-ingested or reclassified.
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
  | "mining"
  | "water"
  | "vehicles"
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
  "mining",
  "water",
  "vehicles",
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
  ["healthcare", /equipo m[ée]dico|equipamiento m[ée]dico|equipo de laboratorio|bomba de infusi[óo]n|ventilador pulmonar|hemodi[áa]lisis|hemodinamia|imagenolog[íi]a|radiolog[íi]a|tomograf[íi]a|resonancia magn[ée]tica|hospital\b|unidad m[ée]dica|servicios de salud|\bsalud\b/i],
  ["tax", /administraci[óo]n tributaria|fiscalizaci[óo]n|declaraci[óo]n fiscal|sistema de recaudaci[óo]n|\bsat\b|servicio de administraci[óo]n tributaria|padr[óo]n de contribuyentes|aduanas?\b|hacienda y cr[ée]dito p[úu]blico/i],
  // "\bducto\b" (2026-09-03, real bug found against a real Proyectos
  // Estratégicos MX export): was missing its leading \b, so it matched
  // as a bare substring of "acueducto" (aqueduct — CONAGUA's own
  // vocabulary for a water pipeline) too, wrongly tagging real water
  // projects "energy" (5/48 real rows in that export). "\bducto\b" alone
  // now only matches the standalone word.
  ["energy", /petr[óo]leo|petroqu[íi]mic[ao]|hidrocarburo|perforaci[óo]n|refiner[íi]a|gas natural|\bducto\b|oleoducto|gasoducto|\bpemex\b|petr[óo]leos mexicanos|yacimiento|pozo petrolero|energ[íi]a renovable|planta solar|e[óo]lic[ao]|fotovoltaic[ao]|geot[ée]rmic[ao]|biocombustible|resistividad/i],
  ["power", /energ[íi]a el[ée]ctrica|electricidad|subestaci[óo]n|transmisi[óo]n el[ée]ctrica|generaci[óo]n el[ée]ctrica|red el[ée]ctrica|distribuci[óo]n el[ée]ctrica|\bcfe\b|comisi[óo]n federal de electricidad|transformador(es)?|casa de m[áa]quinas/i],
  // The second half of this alternation (ran/bts/ruteador/wdm/...) is the
  // same real ICT/telecom equipment whitelist added to
  // INCLUDE_OVERRIDE_KEYWORDS in lib/relevance.ts (a real batch of 29
  // CFE TEIT-style tender titles) — kept in sync so these also get
  // tagged "ict_telecom" for filtering, not just protected from exclusion.
  ["ict_telecom", /telecomunicaci|datacenter|centro de datos|fibra [óo]ptica|red de comunicaciones|software|sistema inform[áa]tico|\btic\b|\b5g\b|ciberseguridad|\bran\b|\bbts\b|ruteador(es)?|\brouter(es)?\b|\bmifi\b|nube privada|red metropolitana|red de agregaci[óo]n|red terrestre core|\bwdm\b|\bdwdm\b|microondas|antiddos|caseta(s)? integral(es)? de comunicaciones|torres? (arriostrad|autosoportad)|\baicc\b|firewall|\bixp\b|internet gratuito/i],
  ["transportation", /transporte p[úu]blico|movilidad urbana|vialidad\b|sistema de transporte|autob[úu]s|tren de pasajeros|metro\b|log[íi]stica de transporte|se[ñn]alizaci[óo]n vial|comunicaciones y transportes/i],
  // The "\bkm\s*\d+\+\d{3}\b" alternative is a real kilometer-marker
  // notation ("DEL KM 150+000 AL KM 170+000") — standard Mexican federal
  // highway-alignment notation, seen on a real road-engineering-study
  // title ("ELABORACIÓN DEL PROYECTO RAMO: DEL KM 150+000 AL KM
  // 170+000 CAMPECHE") that mentions no other road/carretera keyword at
  // all — this notation alone is a strong, narrowly-scoped real signal.
  // "carreter[ao]" (2026-09-03, real gap found against the same export):
  // "carretera" alone missed several real SICT titles that use the
  // adjective form instead ("EJE CARRETERO..."), landing them on the
  // "general" fallback instead of "construction".
  ["construction", /construcci[óo]n|obra p[úu]blica|carreter[ao]|puente\b|ferrocarril|puerto\b|aeropuerto|edificaci[óo]n|pavimentaci[óo]n|infraestructura vial|\bkm\s*\d+\+\d{3}\b/i],
  ["mining", /miner[íi]a|mineral(?!es de construcci)|yacimiento minero|concesi[óo]n minera/i],
  // "\bptar\b" (2026-09-03, real gap): CONAGUA's own titles overwhelmingly
  // abbreviate "Planta de Tratamiento de Aguas Residuales" as "PTAR"
  // rather than spelling it out (many real rows in the same export) —
  // "planta de tratamiento de agua" alone missed all of them.
  ["water", /agua potable|saneamiento|drenaje|alcantarillado|planta de tratamiento de agua|planta potabilizadora|\bptar\b/i],
  // Real batch the user flagged as legitimate opportunities: bulk vehicle
  // and heavy-machinery acquisitions ("ADQS. DE 22 VEHS. CISTERNA...",
  // "ADQUISICION DE VEHICULOS PARA EL CONVENIO CONASAMA 2026",
  // "ADQUISICIÓN DE 'CAMIÓN COSTERO...'", "ADQUISICIÓN DE MAQUINARIA
  // PESADA") — a genuine, common Mexican government procurement
  // category (vehicle fleets, buses, tanker trucks) distinct enough
  // from "transportation" (which here means transit *infrastructure/
  // services*, not buying the vehicles themselves) to need its own tag.
  // "vehs\.?\b" is the real abbreviation seen in the cistern-truck title.
  // Widened (2026-09-04, per the user's explicit request) to also match
  // camioneta/pick up/SUV/furgoneta — real Mexican government fleet
  // purchases this pattern previously missed entirely (an SUV or pickup
  // acquisition title never says the bare word "vehículo").
  ["vehicles", /veh[íi]culo(s)?|vehs\.?\b|cami[óo]n(es)?\b|autob[úu]s(es)?|maquinaria pesada|camioneta(s)?|pick\s?-?up(s)?|\bsuv(s)?\b|furgoneta(s)?/i],
];

/** Matches against real Spanish-language text (title/description, plus any real category field a source provides) — never guesses from a buyer name alone. Falls back to ["general"] rather than an empty array, so every tender has at least one tag to display/filter by. */
export function classifyIndustries(...texts: (string | undefined)[]): IndustryKey[] {
  const haystack = texts.filter(Boolean).join(" ");
  const matched = INDUSTRY_KEYWORDS.filter(([, pattern]) => pattern.test(haystack)).map(([key]) => key);
  return matched.length > 0 ? matched : ["general"];
}
