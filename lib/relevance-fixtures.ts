/**
 * Permanent regression fixtures for lib/relevance.ts's classifyRelevance().
 *
 * This is the "growing whitelist" the user asked for (2026-09-02): a rule-
 * based Pre-Screening filter (see relevance.ts's own header comment for why
 * this stays rule-based rather than ML — it's a cheap Layer 1 cost-control
 * pass that has to run before any paid AI call) can't literally "train" on
 * new data, but it CAN remember every real, human-confirmed example
 * permanently and re-verify all of them on every future rule change. That's
 * what this file is: every real tender title/case the user has explicitly
 * confirmed the correct tier for, across this whole session, kept as a
 * permanent test case rather than a one-off verification script that gets
 * thrown away.
 *
 * Workflow going forward: when the user pastes new real examples with a
 * stated expected tier, append them here (with a `note` explaining the
 * source/reasoning) and run `npm run test:relevance`. A failure means
 * either the new case needs a rule change, or an existing rule regressed —
 * exactly the check that would have caught the "puertos" plural gap
 * immediately instead of by chance.
 */

import type { Tender, TenderScopeType } from "@/types/tender";

export type RelevanceFixture = {
  title: string;
  expectedTier: "flagship" | "significant" | "standard" | "excluded";
  note: string;
  summary?: string;
  industries?: string[];
  scopeType?: TenderScopeType;
  estimatedValue?: number;
  currency?: string;
  buyer?: string;
  country?: string;
  governmentLevel?: Tender["governmentLevel"];
  isNationalPriorityProject?: boolean;
  structuredDurationDays?: number;
};

export const RELEVANCE_FIXTURES: RelevanceFixture[] = [

  // --- Mexico + undisclosed value: keyword-only logic (2026-09-07) ---
  // Every one of these is a real title from the 2026-09-07 Compras MX
  // import that put 619 new Mexican tenders in the list, 597 of them
  // "standard". Compras MX obra pública publishes no amount, so the value
  // floor — the strongest filter here — never ran on any of them, and they
  // fell through on an industry tag alone. Per the user: the keyword rules
  // must decide these outright.
  {
    title: "REHABILITACIÓN DEL SISTEMA DE AGUA POTABLE BERMEJILLO",
    expectedTier: "excluded",
    note: "Real 2026-09-07 import title. Municipal water-main repair, no disclosed value, matches no MAJOR_PROJECT/INCLUDE_OVERRIDE keyword. Water industry tag alone used to keep it as 'standard'.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "PAVIMENTACIÓN CON CONCRETO HIDRÁULICO DEL CAMINO LOCAL",
    expectedTier: "excluded",
    note: "Real 2026-09-07 import title. One local road surfacing job, no value.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "PERFORACIÓN DE POZO A 300 METROS DE PROFUNDIDAD",
    expectedTier: "excluded",
    note: "Real 2026-09-07 import title. A single village well, no value.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "PREMIO IMSS A LA COMPETITIVIDAD 2025 EN LA ESCUELA DE ENFERMERIA",
    expectedTier: "excluded",
    note: "Real 2026-09-07 import title, and not a procurement at all — an award. Nothing in the keyword rules describes it, which under keyword-only logic is now enough.",
    scopeType: "services",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE PLANTA HIDROELÉCTRICA",
    expectedTier: "flagship",
    note: "The case the Mexico rule must NOT break: a genuine major project with NO disclosed value, kept by MAJOR_PROJECT_KEYWORDS alone. The flagship gate returns before the undisclosed-value gate, so keyword-only logic still promotes it — this is what stops the Mexico rule from being a blanket 'no value means gone'.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DEL SEGUNDO TRAMO DEL ACUEDUCTO",
    expectedTier: "standard",
    note: "Recorded because it was assumed wrong (2026-09-07): a production row with this title shows as 大型项目, so this title was taken to be a MAJOR_PROJECT_KEYWORDS match. It is not — 'acueducto' appears in no keyword list in this file, and this title alone classified as 'standard' even before the Mexico rule. Whatever makes that real row flagship is elsewhere in its full text or its value. Left here as an open question rather than a silent keyword addition: adding 'acueducto' would also promote every municipal 'rehabilitación de acueducto' repair job to flagship. Kept as 'standard' because 'construcción' does match FLAGSHIP_INDUSTRY_KEYWORDS, which the Mexico rule treats as a real (if non-promoting) signal.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "REHABILITACIÓN DEL SISTEMA DE AGUA POTABLE BERMEJILLO",
    expectedTier: "standard",
    note: "The SAME title as the first fixture above, as a Colombian tender. Proves the undisclosed-value rule is scoped to Mexico and did not quietly become global — SECOP II does publish values, so a blank one there is unusual rather than routine, which is why 'absence isn't evidence of smallness' still holds for Colombia.",
    scopeType: "works",
    country: "Colombia",
  },
  {
    title: "IA-N-182-2026 MTTO PLANTAS DE EMERGENCIA HOSPITALES",
    expectedTier: "excluded",
    note: "Real 2026-09-07 import title. MTTO is how Compras MX writes mantenimiento; MAINTENANCE_ONLY_KEYWORDS listed only the full word, so this reached the tiers below and was excluded (when it was) by the unrelated no-industry/no-value gate — meaning the same title WITH an industry tag survived as a maintenance job.",
    industries: ["energy"],
    scopeType: "services",
    estimatedValue: 4_000_000,
    currency: "USD",
    country: "Mexico",
  },
  {
    title: "ADQUISICIÓN DE SOFTWARE ESPECIALIZADO",
    expectedTier: "excluded",
    note: "Bare 'software' as the object of purchase. Every existing licensing pattern required the word licencia/licenciamiento/suscripción beside it, so this phrasing went through. A disclosed, above-floor value is set deliberately so this tests the keyword, not the value floor.",
    industries: ["ict"],
    scopeType: "equipment",
    estimatedValue: 3_000_000,
    currency: "USD",
    country: "Mexico",
  },

  {
    title: "ADQUISICIÓN DE EXCAVADORA HIDRÁULICA PARA USARSE EN LA REFINERÍA MADERO Y ADQUISICIÓN DE CAMIÓN CON PLATAFORMA Y BRAZO ARTICULADO PARA USARSE EN LA REFINERÍA MADERO.",
    expectedTier: "standard",
    note: "Real title the user caught being wrongly excluded by the 2026-09-07 Mexico undisclosed-value rule. A PEMEX heavy-equipment purchase — the category this platform exists to surface. It DOES match FLAGSHIP_INDUSTRY_KEYWORDS' anchored purchase pattern; it reached the gate only because that match promotes to 'significant' only once a value is disclosed. The gate now skips anything that matched a positive keyword, however weakly.",
    scopeType: "equipment",
    buyer: "PEMEX",
    country: "Mexico",
  },
  {
    title: "ADQUISICIÓN DE EXCAVADORA HIDRÁULICA",
    expectedTier: "standard",
    note: "The machine named directly rather than as 'maquinaria pesada', which was the only heavy-machinery phrasing on the whitelist. No disclosed value, so this also pins that the Mexico rule keeps it.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "ARRENDAMIENTO DE EXCAVADORA HIDRÁULICA Y RETROEXCAVADORA",
    expectedTier: "excluded",
    note: "The other side of adding 'excavadora': renting machinery is not buying it. The whitelist pattern is anchored on a purchase verb, so a rental has no positive signal and the Mexico undisclosed-value rule takes it — the same treatment vehicle rental already got.",
    scopeType: "services",
    country: "Mexico",
  },

  // --- 2026-09-07: titles the user confirmed should never have been
  // excluded, one fixture per distinct mechanism that was missing them ---
  {
    title: "ADQUISICIÓN DE “CAMIÓN COSTERO MÍNIMO 41 PASAJEROS CON EQUIPO DE SEÑALIZACIÓN VIAL",
    expectedTier: "standard",
    note: "Missed on a typographic quote. The anchored gap allowed ASCII ' and \" but not the curly “ Compras MX pastes in, so the vehicle noun right after it never counted.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "ADQUISICION DE PATRULLAS PICK UPS, AUTOMOVILES Y MOTOCICLETAS.",
    expectedTier: "standard",
    note: "Missed because the gap only ever looks at the noun IMMEDIATELY after the verb: 'patrullas' was not on the vehicle list, and the 'pick ups' further along was never reachable. patrulla/automóvil/motocicleta now join it.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "ADQUISICION DE EQUIPO MEDIO Y DE LABORATORIO PARA LAS UNIDADES MÉDICAS",
    expectedTier: "standard",
    note: "'equipo medio' is a real recurring typo for 'equipo médico'. Listed explicitly rather than loosening the stem to 'medi…', which would also catch 'medicamento' — a consumable this platform deliberately excludes.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "MODERNIZACION DEL KM 0+000 AL KM 3+500 CON UNA LONGITUD DE 3.5 KM",
    expectedTier: "standard",
    note: "Highway work whose title contains no word for road at all — only chainage. Anchored on modernización/ampliación directly before a KM marker so a 'modernización' of anything else can't match.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "PAV CAM MANUEL CRESCEN REJON LOS ALACRANES, LOC PIONEROS DEL RÍO XNOHÁ, CALAKMUL",
    expectedTier: "standard",
    note: "Pavimentación de camino in the abbreviated form Compras MX uses. Both tokens are required together, so neither abbreviation alone can match something unrelated.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "ADQUISICIÓN DE UN SISTEMA DE RESISTIVIDAD",
    expectedTier: "standard",
    note: "Two separate misses in one title: the gap rejected the article 'un', and no pattern covered geophysical survey equipment. Both fixed.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "ADQUISICIÓN DE COMBUSTIBLES Y LUBRICANTES PARA VEHÍCULOS Y EQUIPOS TERRESTRES",
    expectedTier: "excluded",
    note: "The control for widening that gap. This is the 2026-09-04 false positive the gap was tightened for — a FUEL purchase matching on 'vehículos' as a trailing modifier. Allowing a leading article must not reopen it: 'combustibles' is not an article, so the noun still has to be the immediate object of the verb.",
    scopeType: "equipment",
    country: "Mexico",
  },

  // --- 2026-09-07: Colombian titles the user confirmed should have been
  // excluded and were not ---
  {
    title: "REALIZAR LA RENOVACIÓN DEL LICENCIAMIENTO DE LA PLATAFORMA DE SEGURIDAD PERIMETRAL EXISTENTE Y ADQUIRIR LA SOLUCIÓN LAN; WIFI Y FIREWALL COMPATIBLE CON LA INFRAESTRUCTURA TECNOLÓGICA ACTUAL DE LA SECRETARÍA",
    expectedTier: "excluded",
    note: "Came out FLAGSHIP, the worst possible answer for a licence renewal. The licensing patterns live in EXCLUDE_KEYWORDS, which hasIncludeOverride bypasses — and firewall/perimeter security ARE override keywords, so the override waved the exclusion away and then, with no disclosed value, promoted it to the top tier. Renewal patterns now sit in RENEWAL_ONLY_KEYWORDS, checked before the override and not bypassable by it, the same treatment maintenance already gets.",
    scopeType: "services",
    country: "Colombia",
  },
  {
    title: "SUMINISTRO E INSTALACIÓN DE UN SISTEMA DE VIDEOVIGILANCIA Y CONTROL DE ACCESO PARA EL DISTRITO",
    expectedTier: "significant",
    note: "The control for that change: an override-flagged security project with no renewal wording in it must still be promoted, not dropped. 'significant' rather than 'flagship' because videovigilancia is in EQUIPMENT_SCALE_CAPPED_KEYWORDS, which caps an undisclosed-value match there on purpose — the point of this fixture is that RENEWAL_ONLY_KEYWORDS is narrow enough to leave it alone, taking renewal of an existing licence/subscription/platform rather than security work as a category.",
    scopeType: "equipment_services",
    country: "Colombia",
  },
  {
    title: "PRESTACIÓN INTEGRAL DE SERVICIOS DE SALUD EN ONCOLOGÍA",
    expectedTier: "excluded",
    note: "Health SERVICE delivery, not the medical EQUIPMENT this platform targets. The equipment whitelist correctly did not match it, but nothing dropped it either, so its healthcare industry tag alone carried it to standard.",
    scopeType: "services",
    country: "Colombia",
  },
  {
    title: "CONTRATAR LA CONSTRUCCION Y SOCIALIZACION DEL ANÁLISIS DE SITUACIÓN DE SALUD 2026; APLICANDO METODOLOGIAS CUALITATIVAS DE PARTICIPACIÓN SOCIAL Y COMUNITARIA EN EL MUNICIPIO DE ESPINAL - TOLIMA",
    expectedTier: "excluded",
    note: "'Construcción' of a DOCUMENT — a public-health study written with qualitative methodologies — matching the bare 'construcción' in FLAGSHIP_INDUSTRY_KEYWORDS. Excluded on the abstract noun that follows it, which runs before that whitelist is computed.",
    scopeType: "services",
    country: "Colombia",
  },

  // --- 2026-09-07: settlement-scale siting, and "Puerto" as a place name ---
  {
    title: "“CONSTRUCCIÓN DEL SISTEMA DE RED DE ALCANTARILLADO EN LA COMUNIDAD DE EL CARMEN",
    expectedTier: "excluded",
    note: "Real title from the kept export. The shape the user pointed at — 'CONSTRUCCIÓN xxxx en la COMUNIDAD'. A sewer line in one village and a highway between two cities are the same word to the bare 'construcción' whitelist; the administrative unit the source itself names is what separates them.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE LA PRIMERA ETAPA DE LA PTAR DE LA LOCALIDAD DE LOS PLANES",
    expectedTier: "excluded",
    note: "Same rule via 'localidad'. Note this is a PTAR, like a title the user wants kept — the difference is only that this one names the village it serves.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "MODERNIZACIÓN DE LA CARRETERA: VILLAHERMOSA - FRANCISCO ESCÁRCEGA, TRAMO: KM 220+000",
    expectedTier: "standard",
    note: "The control: a real inter-city highway from the same export, no settlement marker, must survive the settlement rule.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE PRESA EN LA COMUNIDAD DE SAN JUAN",
    expectedTier: "flagship",
    note: "A dam is a dam wherever it is. The settlement rule is checked only after every promotion has returned, so a MAJOR_PROJECT match is never reached by it.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "PAVIMENTACION CON CONCRETO HIDRAULICO EN AVENIDA FELIPE CARRILLO PUERTO",
    expectedTier: "excluded",
    note: "Kept by MAJOR_PROJECT_KEYWORDS' bare 'puerto' — Felipe Carrillo Puerto is an avenue, named after a person. One of nine such rows in a real export; the place-name stripper in industry.ts now removes it before any pattern sees the text.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "PRESERVACION INTEGRAL DEL ACCESO A PLAYA PUERTO MARQUES 1",
    expectedTier: "excluded",
    note: "Same false positive via a beach in Acapulco.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "AMPLIACIÓN DEL PUERTO DE VERACRUZ, NUEVA TERMINAL DE CONTENEDORES",
    expectedTier: "flagship",
    note: "The control for stripping those names: a real port must still match. Only the three confirmed place names are removed, not the word.",
    scopeType: "works",
    country: "Mexico",
  },

  // --- 2026-09-07: titles that name no procurement, kept on value alone ---
  {
    title: "IRON MOUNTAIN COLOMBIA S.A.S.",
    expectedTier: "excluded",
    note: "A company name and nothing else, held in by a disclosed value. A value says how much, never on what, so it cannot be the only thing keeping a row that says nothing.",
    scopeType: "services",
    estimatedValue: 3_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "SUMINISTRO DE TRANSFORMADORES PARA SUBESTACIÓN ELÉCTRICA S.A.S.",
    expectedTier: "significant",
    note: "The control for that pattern: a real description that merely ENDS in a company name must survive. Any procurement verb in the title means it says what is being bought.",
    scopeType: "equipment",
    estimatedValue: 3_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "CONTRATO DE OBRA",
    expectedTier: "excluded",
    note: "A generic noun standing alone. 'OBRA' and 'SERVICIOS' appeared the same way in the same export.",
    scopeType: "works",
    estimatedValue: 3_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "OBRA DE CONSTRUCCIÓN DEL PUENTE VEHICULAR SOBRE EL RÍO MAGDALENA",
    expectedTier: "flagship",
    note: "The control for that one: 'obra' as the first word of a real description is not a bare title. The pattern is anchored to the whole string.",
    scopeType: "works",
    country: "Colombia",
  },
  {
    title: "EP 0058-2026",
    expectedTier: "excluded",
    note: "A bare reference code, same export.",
    scopeType: "works",
    estimatedValue: 8_000_000,
    currency: "USD",
    country: "Colombia",
  },

  // --- 2026-09-07: government level, and major-project keywords that name
  // the site rather than the job ---
  {
    title: "CONSTRUCCION DE TANQUE",
    expectedTier: "excluded",
    note: "Real title from a kept export. Municipal tier, no disclosed value, and nothing holding it in but the broadest works word there is. Wording could not separate this from a federal highway — both are just 'construcción' — but who is buying can, and the source states it.",
    scopeType: "works",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "CONSTRUCCION DE TANQUE",
    expectedTier: "standard",
    note: "The same title at federal level, to pin that the rule keys on the government tier and not on the words.",
    scopeType: "works",
    country: "Mexico",
    governmentLevel: "federal",
  },
  {
    title: "ADQUISICIÓN DE VEHÍCULOS TIPO SEDÁN PARA LOS PROGRAMAS SSYRA Y SNSP",
    expectedTier: "standard",
    note: "A municipality buying vehicles is untouched: the rule fires only when the ONLY whitelist match is the bare works word, and an anchored purchase pattern matched here instead.",
    scopeType: "equipment",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "CONSTRUCCIÓN DE PRESA MUNICIPAL",
    expectedTier: "flagship",
    note: "A dam is a dam whoever buys it. Every promotion returns above the municipal gate.",
    scopeType: "works",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "REPARACIÓN DE JUNTAS DE CALZADA EN PSV DEL PUERTO ALTAMIRA",
    expectedTier: "significant",
    note: "Per the user (2026-09-07): 改中型项目. Resurfacing joints at a port is real infrastructure work at real scale, but it is not a port project, and MAJOR_PROJECT_KEYWORDS' 'puerto' had it at the top tier.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "TRABAJOS DE URBANIZACIÓN BAJO PUENTE COMPRENDIDO ENTRE EL FRENTE 1, 13, 17, 19",
    expectedTier: "standard",
    note: "Per the user (2026-09-07): 改常规项目. The bridge is the address, not the work.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "RECONSTRUCCIÓN DEL PUENTE “XUCHIPANTLA”",
    expectedTier: "flagship",
    note: "The control for both demotions: rebuilding a bridge outright stays flagship. 'reparación' demotes, 'reconstrucción' deliberately does not, and several real titles of this shape are in the same export.",
    scopeType: "works",
    country: "Mexico",
  },

  // --- 2026-09-07: Colombian rows kept by a large value alone ---
  // All real titles from one export's "value ≥ $1M" bucket. The bucket was
  // mixed, so these are the shapes that were confirmed removable — a
  // refinery tower, boiler tubing and energy meters were in the same
  // bucket and are deliberately untouched.
  {
    title: "SERVICIO DE SOPORTE PARA EL PROCESO DE ABASTECIMIENTO",
    expectedTier: "excluded",
    note: "Back-office support for a procurement PROCESS, not a procurement.",
    scopeType: "services",
    estimatedValue: 3_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "SERVICIO DE ALOJAMIENTO Y ALIMENTACIÓN PARA EL PERSONAL DE LA DIRECCIÓN DE ANTINARCÓTICOS",
    expectedTier: "excluded",
    note: "Housing and feeding staff.",
    scopeType: "services",
    estimatedValue: 4_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "FORTALECIMIENTO DEL CONTROL TERRITORIAL",
    expectedTier: "excluded",
    note: "A programme name with no procurement object. Anchored on the two abstract objects seen, so 'FORTALECIMIENTO A LOS SERVICIOS DE HEMODINAMIA' — real hospital equipment, in the same export — is untouched.",
    scopeType: "services",
    estimatedValue: 2_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "FORTALECIMIENTO A LOS SERVICIOS DE HEMODINAMIA DEL HOSPITAL GENERAL DE CHETUMAL",
    expectedTier: "standard",
    note: "The control for that: the same first word, a real object after it, must not be excluded. 'standard' rather than 'significant' because the medical whitelist only promotes once a value is disclosed and this one has none — the point here is that it survives.",
    scopeType: "equipment",
    country: "Mexico",
    governmentLevel: "federal",
  },
  {
    title: "LP-013-2026 (Fase de Selección (Presentación de ofertas))",
    expectedTier: "excluded",
    note: "SECOP II appends the procurement's current phase to the title. It says nothing about what is bought, and it was enough to stop a bare reference code from looking bare.",
    scopeType: "works",
    estimatedValue: 6_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "AHLPOB05-026 (Fase de Selección (Presentación de ofertas))",
    expectedTier: "excluded",
    note: "Same, with a code the earlier letter-count-based pattern could not match. Codes are now judged by shape: one token, no spaces, containing a digit — a real description always has spaces.",
    scopeType: "works",
    estimatedValue: 6_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "UNIÓN TEMPORAL SUMINISTROS ENTORNOS DIGITALES 2026",
    expectedTier: "excluded",
    note: "A consortium's own name — a bidder, not a purchase.",
    scopeType: "equipment",
    estimatedValue: 2_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "ACTA DE TRANSFERENCIA A TÍTULO GRATUITO DE LOS BIENES ADQUIRIDOS EN VIRTUD DEL CONTRATO DE COMPRAVENTA",
    expectedTier: "excluded",
    note: "A record of a transaction already made.",
    scopeType: "services",
    estimatedValue: 2_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "COMPRA DE TORRE PARA EL PROYECTO MEJORAS UNIDAD HIDROTRATAMIENTO U-107 DE LA REFINERIA DE CARTAGENA",
    expectedTier: "significant",
    note: "The reason this bucket was not removed wholesale: a refinery tower, exactly what the platform exists to surface, sat in it alongside the back-office services.",
    scopeType: "equipment",
    estimatedValue: 4_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "COMPRAVENTA DE LAS TUBERÍAS DEL HOGAR DE LA CALDERA DE LA UNIDAD 1 DE TERMOPAIPA; INCLUIDA LA INSTALACIÓN",
    expectedTier: "significant",
    note: "Same: boiler tubing for a thermal power unit.",
    scopeType: "equipment",
    estimatedValue: 3_000_000,
    currency: "USD",
    country: "Colombia",
  },

  // --- Flagship: real MAJOR_PROJECT_KEYWORDS matches ---
  {
    title: "CONSTRUCCIÓN DE PRESA Y RED DE RIEGO",
    expectedTier: "flagship",
    note: "Dam construction — MAJOR_PROJECT_KEYWORDS 建水库/水坝.",
    industries: ["construction"],
    scopeType: "works",
  },
  {
    title: "CONSTRUCCIÓN DE PUENTE VEHICULAR SOBRE EL RÍO",
    expectedTier: "flagship",
    note: "Bridge construction — MAJOR_PROJECT_KEYWORDS 建桥.",
    industries: ["construction"],
    scopeType: "works",
  },
  {
    title: "AMPLIACIÓN DE AEROPUERTO INTERNACIONAL",
    expectedTier: "flagship",
    note: "Airport expansion — MAJOR_PROJECT_KEYWORDS 建机场.",
    industries: ["construction"],
    scopeType: "works",
  },
  {
    title: "DRAGADO DE DESAZOLVE DE LOS PUERTOS DE CHUBURNA Y CHABIHAU",
    expectedTier: "flagship",
    note: "Real title (2026-09-02 export) — port dredging. Used PLURAL 'puertos', which \\bpuerto\\b (singular only) missed until the pluralization fix.",
    industries: ["general"],
    scopeType: "works",
  },
  {
    title: "Macro RAN 4G LTE para sitios rurales",
    expectedTier: "flagship",
    note: "Real ICT/telecom equipment batch — INCLUDE_OVERRIDE_KEYWORDS (RAN).",
    industries: ["ict_telecom"],
    scopeType: "equipment",
  },
  {
    title: "OBRA CIVIL",
    expectedTier: "flagship",
    note: "Synthetic — value >= FLAGSHIP_VALUE_USD alone should promote regardless of title content.",
    industries: ["construction"],
    scopeType: "works",
    estimatedValue: 5_000_000,
    currency: "USD",
  },
  {
    title: "Central de Generación Co-Localizada Los Cabos",
    expectedTier: "flagship",
    note: "Real proyectosmexico.gob.mx row (2026-09-02, project 1117, buyer Comisión Federal de Electricidad) — isNationalPriorityProject alone must force flagship even with no estimatedValue in this fixture (the real row had one; this checks the flag works standalone).",
    industries: ["energy", "power"],
    scopeType: "works",
    buyer: "Comisión Federal de Electricidad",
    isNationalPriorityProject: true,
  },

  // --- Significant: real examples the user confirmed as "keep" (2026-09-02) ---
  {
    title: "CONSTRUCCIÓN DE EDIFICIO H PARA LA FACULTAD DE ENFERMERÍA Y OBSTETRICIA 2A ETAPA",
    expectedTier: "standard",
    note: "User-confirmed keep list — building construction (FLAGSHIP_INDUSTRY_KEYWORDS construcción).",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO MÉDICO Y DE LABORATORIO",
    expectedTier: "standard",
    note: "User-confirmed keep list — medical/lab equipment.",
  },
  {
    title: "ADQUISICIÓN DE EQUIPOS DE RAYOS X PARA DIVERSAS UNIDADES MEDICAS",
    expectedTier: "standard",
    note: "User-confirmed keep list — imaging equipment (rayos x).",
  },
  {
    title: "EQUIPO MÉDICO DE IMAGENOLOGÍA 2026, MASTÓGRAFOS Y RESONANCIA",
    expectedTier: "standard",
    note: "User-confirmed keep list — imaging equipment (imagenología/resonancia).",
  },
  {
    title: "ADQUISICIÓN DE 39 PARTIDAS DE EQUIPO ASOCIADO A OBRA - EQUIPAMIENTO MÉDICO INST",
    expectedTier: "standard",
    note: "User-confirmed keep list — bulk medical equipment tied to a works project.",
  },
  {
    title: "CONSTRUCCIÓN DE PLANTA DE TRATAMIENTO DE  AGUAS RESIDUALES",
    expectedTier: "standard",
    note: "User-confirmed keep list — wastewater treatment plant construction.",
  },
  {
    title: "ADQUISICION DE 204 PARTIDAS DE EQUIPO ASOCIADO A OBRA - EQUIPAMIENTO MÉDICO P&P",
    expectedTier: "standard",
    note: "User-confirmed keep list — bulk medical equipment tied to a works project.",
  },
  {
    title: "CONSTRUCCIÓN DE EDIFICIO ADMINISTRATIVO EN LA ESCUELA PREPARATORIA NO. UNO 3A E",
    expectedTier: "standard",
    note: "User-confirmed keep list — building construction, deliberately kept despite being its 3rd phase (per the earlier decision NOT to encode phase-count as an exclude signal).",
  },
  {
    title: "CONSTRUCCIÓN DE LA PLANTA DE TRATAMIENTO DE AGUAS RESIDUALES, STA. ANA DEL VALLE",
    expectedTier: "standard",
    note: "User-confirmed keep list — wastewater treatment plant construction.",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE LABORATORIO PARA CENTROS DE ACOPIO EN SINALOA",
    expectedTier: "standard",
    note: "User-confirmed keep list — lab equipment.",
  },
  {
    title: "REHABILITACIÓN DE LA CARRETERA",
    expectedTier: "standard",
    note: "User-confirmed keep list — highway rehab (bare 'carretera' match; not 'construcción de la carretera' so stays significant, not flagship).",
  },
  {
    title: "CONSTRUCCIÓN Y DISEÑO DE 68.00 KM DEL TRAMO I FERROVIARIO DEL TREN DE PASAJEROS",
    expectedTier: "standard",
    note: "User-confirmed keep list — passenger railway construction. Matches via bare 'construcción', not the MAJOR_PROJECT_KEYWORDS railway pattern (ferrocarril/tren de carga|eléctrico|interurbano) — 'ferroviario' and 'tren de pasajeros' don't match that pattern's exact wording.",
  },
  {
    title: "CONSTRUCCIÓN Y DISEÑO DE 82.00 KM DEL TRAMO II FERROVIARIO DEL TREN DE PASAJERO",
    expectedTier: "standard",
    note: "User-confirmed keep list — passenger railway construction, same pattern gap as above.",
  },
  {
    title: "Mantenimiento, rehabilitación y/o construcción de ductos y líneas de descarga en los Activos de la Subdirección de Extracción Región Terrestre Norte",
    expectedTier: "excluded",
    note: "Was in the user's first (18-title) whitelist, then deliberately dropped from the narrower 13-title version without comment — confirmed intentional (2026-09-02) when asked directly. \\bductos?\\b exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Ingeniería, Procura y Construcción de ductos marinos en el Golfo de México, Paquete 2",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group as above, confirmed intentional. \\bductos?\\b exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Construcción, rehabilitación y/o sustitución de líneas de descarga y de inyección de agua congénita con tubería no metálica para los activos de la Subdirección de Extracción Región Terrestre Norte",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group, confirmed intentional. Doesn't say 'ducto' literally — caught by the separate 'líneas de descarga' exclude pattern added alongside it.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Mantenimiento, rehabilitación e infraestructuras complementarias en instalaciones de las Regiones Marinas. (Paquete 2)",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group, confirmed intentional. Doesn't say 'ducto' either — caught by the separate 'infraestructuras complementarias' exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "Construcción de ductos terrestres para recolección y transporte de hidrocarburos en Instalaciones de Exploración y Extracción de Petróleos Mexicanos",
    expectedTier: "excluded",
    note: "Same PEMEX-drop group as above, confirmed intentional. \\bductos?\\b exclude pattern.",
    buyer: "Pemex Exploración y Producción",
  },
  {
    title: "ADQUISICIÓN DE TRANSFORMADORES DE POTENCIA",
    expectedTier: "standard",
    note: "Was excluded since the Seventh pass removed the old bare 'energía|eléctrico|power' signal, with nothing replacing it for power equipment specifically. Restored to significant (2026-09-04) per the user's explicit request to whitelist power-grid key equipment (变压器/发电机/继电保护器/UPS) — via the same anchored purchase-verb pattern as vehicles, not the old broad bare-word match.",
    industries: ["power"],
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE LABORATORIO",
    expectedTier: "standard",
    note: "Earlier-approved real batch — lab equipment.",
    industries: ["healthcare"],
  },

  // --- "standard" tier reactivated (2026-09-05, per the user's explicit
  // request — see relevance.ts's final-return comment): these fixtures
  // were briefly "excluded" under the 2026-09-02 elimination and are back
  // to "standard" now that classifyRelevance() produces that tier again. ---
  {
    title: "Servicio de calibración a equipos patrones para instrumentos de control y medición de las instalaciones de Petróleos Mexicanos",
    expectedTier: "standard",
    note: "Real PEMEX title with genuine hydrocarbon-facility content in the TITLE itself, not just buyer name (deliberately NOT caught by the buyer-tag-contamination fix since this is real content) — no value disclosed, but a real industry tag, so it lands 'standard' rather than 'excluded'.",
    scopeType: "services",
    buyer: "Pemex Exploración y Producción",
  },

  // --- Vehicle-fleet purchases restored to the whitelist (2026-09-04, per
  // the user's explicit request) — a genuine ACQUISITION of vehicles now
  // promotes to "significant" via FLAGSHIP_INDUSTRY_KEYWORDS's new
  // vehicle-purchase pattern, while routine vehicle services (maintenance,
  // fuel) stay excluded exactly as before — see relevance.ts's comment on
  // that pattern for why the two can't collide. ---
  {
    title: "ADQUISICIÓN DE VEHÍCULOS PARA EL CONVENIO CONASAMA 2026",
    expectedTier: "standard",
    note: "Real title, same one the 2026-09-02 'standard' elimination had moved to excluded — restored per the user's 2026-09-04 explicit ask to whitelist government vehicle purchases.",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE AUTOBUSES PARA TRANSPORTE ESCOLAR",
    expectedTier: "standard",
    note: "Bus purchase — 公交车, one of the user's named examples (2026-09-04).",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE CAMIONES DE VOLTEO PARA OBRAS PÚBLICAS",
    expectedTier: "standard",
    note: "Dump-truck purchase — 货车, one of the user's named examples (2026-09-04).",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE CAMIONETAS TIPO SUV PARA SEGURIDAD PÚBLICA",
    expectedTier: "standard",
    note: "SUV purchase — SUV, one of the user's named examples (2026-09-04); also exercises industry.ts's widened 'vehicles' pattern (SUV/camioneta weren't matched at all before this change).",
    industries: ["vehicles"],
  },
  {
    title: "SERVICIO DE MANTENIMIENTO PREVENTIVO Y CORRECTIVO AL PARQUE VEHICULAR",
    expectedTier: "excluded",
    note: "Regression check for the user's explicit 2026-09-04 concern ('避免触发...加油和保养'): vehicle MAINTENANCE, not a purchase — caught by the existing broad 'servicio de mantenimiento' EXCLUDE_KEYWORDS pattern before the new vehicle-purchase whitelist entry is ever reached.",
    industries: ["vehicles"],
  },
  {
    title: "SUMINISTRO DE GASOLINA Y DIÉSEL PARA EL PARQUE VEHICULAR",
    expectedTier: "excluded",
    note: "Regression check for the same 2026-09-04 concern: vehicle FUEL, not a purchase — caught by the existing 'combustible para el parque vehicular|suministro de gasolina y diésel' EXCLUDE_KEYWORDS pattern.",
    industries: ["vehicles"],
  },
  {
    title: "ARRENDAMIENTO DE VEHÍCULOS PARA EL PERSONAL ADMINISTRATIVO",
    expectedTier: "excluded",
    note: "Vehicle RENTAL, not a purchase — caught by the existing 'arrendamiento de vehículos|renta de vehículos' EXCLUDE_KEYWORDS pattern before the new whitelist entry, confirming the anchored purchase-verb pattern doesn't accidentally match this.",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE MAQUINARIA PESADA",
    expectedTier: "standard",
    note: "Was 'standard' until the 2026-09-02 elimination moved it to excluded — restored per the user's 2026-09-04 follow-up ask (\"'maquinaria pesada' 也加回白名单\") to the SAME anchored purchase-verb pattern as the vehicle purchases above, not a separate rule.",
    industries: ["vehicles"],
  },
  {
    title: "ARRENDAMIENTO DE MAQUINARIA PESADA PARA OBRAS PÚBLICAS",
    expectedTier: "standard",
    note: "Heavy-machinery RENTAL, not a purchase — no EXCLUDE_KEYWORDS pattern names machinery specifically, but the anchored whitelist pattern requires a purchase verb (adquisición/adqs./compra/suministro), which 'arrendamiento' isn't, so this falls through to the bottom of the pipeline; a real 'vehicles' industry tag with no disclosed value lands it 'standard' (was 'excluded' while that tier was eliminated, 2026-09-02–09-05).",
    industries: ["vehicles"],
  },
  {
    title: "ADQUISICIÓN DE COMBUSTIBLES Y LUBRICANTES PARA VEHÍCULOS Y EQUIPOS TERRESTRES",
    expectedTier: "excluded",
    note: "Real title (2026-09-04) that exposed a real bug: 'vehículos' appears only 32 chars after 'adquisición de', inside the OLD whitelist pattern's 40-char loose gap, matching via the 'para vehículos' trailing modifier even though the actual object being purchased is fuel/lubricants, not vehicles. Fixed by tightening the gap to digits/quotes/whitespace only (a real quantity prefix, not arbitrary words) and adding an explicit belt-and-suspenders EXCLUDE_KEYWORDS pattern.",
    industries: ["vehicles", "energy"],
  },

  // --- Hemodiálisis/hemodinamia SERVICES and consumables, not equipment
  // (2026-09-04, real titles the user flagged) — same class of bug as the
  // earlier osteosíntesis/reactivo/medicamento fixes: the bare
  // "hemodiálisis|hemodinamia" FLAGSHIP_INDUSTRY_KEYWORDS term is meant for
  // genuine EQUIPMENT purchases, but these three are an outsourced service
  // and a consumables purchase respectively. ---
  {
    title: "ADQUISICIÓN Y/O SUMINISTRO DE INSUMOS PARA EL SERVICIO DE HEMODINAMIA, 2026",
    expectedTier: "excluded",
    note: "Consumables ('insumos') for the hemodinamia service, not equipment — would otherwise hit the bare 'hemodinamia' FLAGSHIP_INDUSTRY_KEYWORDS match.",
    industries: ["healthcare"],
  },
  {
    title: "SERVICIOS MEDICO DE HEMODIALISIS SUBROGADA",
    expectedTier: "excluded",
    note: "Outsourced ('subrogada') hemodiálisis service — word order didn't match the existing 'servicio médico subrogado' pattern ('subrogada' separated from 'medico' by 'de hemodialisis'), so it would otherwise hit the bare 'hemodiálisis' FLAGSHIP_INDUSTRY_KEYWORDS match.",
    scopeType: "services",
  },
  {
    title: "SERVICIO DE HEMODIÁLISIS EXTRAMUROS",
    expectedTier: "excluded",
    note: "Off-site ('extramuros') hemodiálisis service contract, real procedure number LA-50-GYR-050GYR033-T-91-2026 — same class of bug as the subrogada title above.",
    scopeType: "services",
  },

  // --- Power-grid key equipment restored to the whitelist (2026-09-04, per
  // the user's explicit request: "白名单加入电力相关的关键设备：变压器、
  // 发电机、继电保护器等" then "还有UPS") — same anchored purchase-verb
  // mechanism as vehicles, reusing the same tightened gap. ---
  {
    title: "ADQUISICIÓN DE GENERADORES DE EMERGENCIA PARA HOSPITALES",
    expectedTier: "standard",
    note: "Generator purchase — 发电机, one of the user's named examples (2026-09-04). Deliberately avoids the word 'subestación' — that already triggers INCLUDE_OVERRIDE_KEYWORDS straight to flagship on its own, which would test that rule instead of this one.",
    industries: ["power"],
  },
  {
    title: "ADQUISICIÓN DE RELEVADORES DE PROTECCIÓN PARA LÍNEAS DE TRANSMISIÓN",
    expectedTier: "standard",
    note: "Protection-relay purchase — 继电保护器, one of the user's named examples (2026-09-04). Mexican Spanish 'relevador' variant, not just 'relé'.",
    industries: ["power"],
  },
  {
    title: "ADQUISICIÓN DE UPS PARA EQUIPO DE CÓMPUTO",
    expectedTier: "standard",
    note: "UPS purchase, one of the user's named examples (2026-09-04, follow-up \"还有UPS\"). Deliberately avoids 'centro de datos' — that already triggers MAJOR_PROJECT_KEYWORDS straight to flagship on its own, which would test that rule instead of this one.",
    industries: ["power", "ict_telecom"],
  },
  {
    title: "MANTENIMIENTO PREVENTIVO A TRANSFORMADORES DE POTENCIA",
    expectedTier: "excluded",
    note: "Power-equipment MAINTENANCE, not a purchase — regression check mirroring the vehicle/machinery rental checks above: no purchase verb, so this falls through to the existing broad 'mantenimiento preventivo' EXCLUDE_KEYWORDS pattern before the whitelist entry is ever reached.",
    industries: ["power"],
  },

  // --- Excluded: real noise confirmed this session ---
  {
    title: "REHABILITACIÓN DE POZO PROFUNDO NO. 5",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 只聚焦一个区的小工程 (single-well rehab).",
    scopeType: "works",
  },
  {
    title: "CONSTRUCCIÓN DE BARDA PERIMETRAL EN LA UABJO 2A. ETAPA",
    expectedTier: "excluded",
    note: "Real counter-example for why '多期项目(2期以上)' was NOT encoded as a major-project signal — a small fence job on its 2nd phase.",
    scopeType: "works",
  },
  {
    title: "SUPERVISIÓN DE LA CONSTRUCCIÓN DEL PASO SUPERIOR FERROVIARIO",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 只是监理 (inspection/oversight only, not the actual works contract).",
    scopeType: "consulting",
  },
  {
    title: "ANÁLISIS DE AGUAS RESIDUALES DE LA PLANTA",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 分析服务 (analysis service, not equipment/works).",
    scopeType: "services",
  },
  {
    title: "MANTENIMIENTO PREVENTIVO A TORRES DE ENFRIAMIENTO, UNIDADES PAQUETE",
    expectedTier: "excluded",
    note: "Real exclusion-review batch — 维护类服务 (routine HVAC/industrial-unit maintenance).",
    scopeType: "services",
  },
  {
    title: "COLGATE TRIPLE ACCION EXTRA, PAPEL HIGIENICO REGIO RINDE",
    expectedTier: "excluded",
    note: "Real title from ALIMENTACIÓN PARA EL BIENESTAR (Mexico's federal food/hygiene program) — 207 of 208 of this buyer's kept tenders were bare retail product names. EXCLUDE_BUYER_KEYWORDS fix.",
    scopeType: "equipment",
    estimatedValue: 139220,
    buyer: "ALIMENTACIóN PARA EL BIENESTAR, S.A. DE C.V.",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE COMPUTO",
    expectedTier: "excluded",
    note: "Real title (SECADMONZAC buyer) — generic office equipment, no industry match, no value. Confirms the isEquipmentPurchase fallback removal (was previously kept as 'standard' purely for having scopeType='equipment').",
    scopeType: "equipment",
  },
  {
    title: "REQ 2026-0294 ADQ MONEDAS 10 PESOS ORO",
    expectedTier: "excluded",
    note: "Real title (ININ buyer) — commemorative coin purchase, same isEquipmentPurchase-fallback-removal confirmation as above.",
    scopeType: "equipment",
  },
  {
    title: "REHAB. PAVIM. CON MEZCLA ASFALT. EN CALIENTE CALLE S/N RA. CHICOZAPOTE",
    expectedTier: "excluded",
    note: "Real title — single-street asphalt patch, 'works' scope with no value. Confirms the isWorksLike flagship-fallback removal (was previously auto-flagship purely for scopeType='works').",
    scopeType: "works",
  },
  {
    title: "MANTENIMIENTO EN EDIFICIOS DE LA TERMINAL DE TRANSBORDADORES, MAZATLÁN",
    expectedTier: "excluded",
    note: "Real title — a maintenance job, 'works' scope with no value. Same isWorksLike-removal confirmation.",
    scopeType: "works",
  },

  // --- "咨询" (consulting) scopeType excluded outright, per the user's
  // explicit request (2026-09-04) after filtering the tender list by
  // 项目类型=咨询 and finding these real examples. ---
  {
    title: "ELABORACIÓN DE ESTUDIOS Y PROYECTOS PARA LA MODERNIZACIÓN CARRETERA FEDERA",
    expectedTier: "excluded",
    note: "Real title (SICT buyer) — a study/planning contract, not the actual highway construction, despite 'carretera' otherwise matching MAJOR_PROJECT_KEYWORDS.",
    scopeType: "consulting",
  },
  {
    title: "INSPECCION ULTRASONICA VIA FERREA",
    expectedTier: "excluded",
    note: "Real title (FIT buyer) — a railway inspection SERVICE, not the actual railway construction, despite 'ferrocarril'-adjacent wording otherwise matching MAJOR_PROJECT_KEYWORDS.",
    scopeType: "consulting",
  },
  {
    title: "SERVICIO ADMINISTRADO DE SEGURIDAD PERIMETRAL PARA INSTALACIONES ESTRATÉGICAS",
    expectedTier: "flagship",
    note: "Regression check — a consulting-scope tender that matches INCLUDE_OVERRIDE_KEYWORDS ('seguridad perimetral') must still bypass the new blanket consulting exclusion, same as every other exclude check in this file (hasIncludeOverride promotes straight to flagship, confirmed by the test run rather than assumed).",
    scopeType: "consulting",
  },

  // --- Colombia's own, higher MIN_VALUE_USD_BY_COUNTRY floor ($500,000,
  // vs. the platform-wide $100,000) — added 2026-09-04 after the user
  // reviewed a real SECOP II import and found the shared floor let too
  // many small Colombia tenders through. ---
  {
    title: "PRESTAR APOYO EN LA EJECUCIÓN DEL PROYECTO",
    expectedTier: "excluded",
    note: "Real Colombia value range from the live import (~$300k–$450k USD equivalent) — clears the platform-wide $100,000 floor but not Colombia's own $500,000 one, so this must be excluded on the value signal specifically. estimatedValue is a real-magnitude COP figure (colombia-mapper.ts always stores the raw precio_base in COP): 1,200,000,000 COP / 3140 ≈ $382,000 USD (COP rate refreshed 2026-09-05; the original 1,680,000,000 figure was calibrated to the old 1/4200 rate and would clear $500,000 at the current one).",
    scopeType: "works",
    estimatedValue: 1_200_000_000,
    currency: "COP",
    country: "Colombia",
  },
  {
    title: "CONSTRUCCIÓN DE INFRAESTRUCTURA VIAL EN EL MUNICIPIO",
    expectedTier: "significant",
    note: "Regression check — a Colombia tender genuinely at/above the $500,000 country-specific floor must still clear it (and 'construcción' also matches FLAGSHIP_INDUSTRY_KEYWORDS on its own, but this confirms the value path alone works too). 2,520,000,000 COP / 3140 ≈ $802,548 USD (COP rate refreshed 2026-09-05), a real-magnitude COP figure same as the fixture above.",
    scopeType: "works",
    estimatedValue: 2_520_000_000,
    currency: "COP",
    country: "Colombia",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO MÉDICO PARA HOSPITAL REGIONAL",
    expectedTier: "significant",
    note: "Repurposed (2026-09-05): used to test that a per-country value floor override didn't leak onto a country-unset tender — that override (MIN_VALUE_USD_BY_COUNTRY) is gone now that Mexico's floor was unified to Colombia's $500,000 (see MIN_VALUE_USD's own comment). Now tests the companion rule instead: a FLAGSHIP_INDUSTRY_KEYWORDS match (equipo médico) combined with ANY disclosed value above the floor — even one that doesn't clear SIGNIFICANT_VALUE_USD ($1,000,000) on its own — still promotes to significant, only a completely undisclosed value caps it at standard.",
    scopeType: "equipment",
    estimatedValue: 600_000,
    currency: "USD",
  },

  // --- Batch #4 fixtures (2026-09-04): a real annotated review the user
  // marked up on live browse-page screenshots. See the matching
  // EXCLUDE_KEYWORDS/BRIDGE_LENGTH_ANCHOR comments in relevance.ts for the
  // full reasoning per pattern. ---
  {
    title: "ADQUISICIÓN DE MATERIAL ELÉCTRICO PARA LA INFRAESTRUCTURA HOSPITALARIA",
    expectedTier: "excluded",
    note: "Real title (ISSSTE buyer) — 材料项目 (a materials purchase, not equipment).",
    scopeType: "equipment",
  },
  {
    title: "ADQUISICIÓN DE MATERIAL DE CONSTRUCCIÓN PARA CAMPAMENTOS DE CONSERVACIÓN Y DERECHO DE VÍA",
    expectedTier: "excluded",
    note: "Real title (CAPUFE buyer) — 建筑材料 (raw construction materials, not a works contract).",
    scopeType: "equipment",
  },
  {
    title: "CONSTRUCCIÓN DE 20 MICROSECTORES",
    expectedTier: "excluded",
    note: "Real title (SOP buyer) — 小项目 (20 small distributed sectors).",
    scopeType: "works",
  },
  {
    title: "IA-50-GYR-050GYR036-N-39-2026 SERVICIO MED SUBROGADO TOMOGRAFIA PET (3ER VUELTA)",
    expectedTier: "excluded",
    note: "Real title (IMSS buyer) — 医疗服务 (outsourced medical service, abbreviated 'MED' not 'MÉDICO' — the original servicio médico subrogado pattern required the full word and missed this).",
    scopeType: "services",
  },
  {
    title: "EQUIPAMIENTO ELECTROMECÁNICO DE 2 POZOS DE AGUA POTABLE (POZO 1: CARRETERA ESTATAL)",
    expectedTier: "excluded",
    note: "Real title (INAGUA buyer) — 2口井，小项目 (a 1-2 well job).",
    scopeType: "equipment",
  },
  {
    title: "ADQUISICIÓN DE CONSUMIBLES PARA EQUIPO MEDICO CON PRESTAMO DE EQUIPO",
    expectedTier: "excluded",
    note: "Real title (IMSS buyer) — 医疗消耗品 (medical consumables, not the equipment itself).",
    scopeType: "equipment",
  },
  {
    title: "CONSERVACIÓN PERIÓDICA DE PUENTES DE LA RED FEDERAL LIBRE DE PEAJE EN NAYARIT",
    expectedTier: "excluded",
    note: "Real title (SICT buyer) — 长期维护类项目 (periodic maintenance, not new bridge construction — 'puentes' would otherwise promote straight to flagship via MAJOR_PROJECT_KEYWORDS regardless of maintenance-vs-new-build framing).",
    scopeType: "works",
  },
  {
    title: "TRABAJOS DE CONSERVACIÓN EN LA CARRETERA",
    expectedTier: "excluded",
    note: "Real title (SOP buyer) — 道路维护 (road maintenance, not new highway construction — bare 'carretera' would otherwise match FLAGSHIP_INDUSTRY_KEYWORDS regardless).",
    scopeType: "works",
  },
  {
    title: "DETERMINACIÓN DEL ANÁLISIS TÉCNICO Y CONSTRUCCIÓN, EN EL ESTADO DE TLAXCALA",
    expectedTier: "excluded",
    note: "Real title (CONAGUA buyer) — 咨询服务 (a technical study/determination, not the works contract itself, despite 'construcción' appearing in the same title).",
    scopeType: "works",
  },
  {
    title: "CONSTRUCCIÓN DE COLECTOR ORIENTE EN LA LOCALIDAD DE NUEVA ITALIA DE RUÍZ, EN EL MUNICIPIO",
    expectedTier: "excluded",
    note: "Real title (CEAC buyer) — 单区域小项目 (one small locality's drainage collector).",
    scopeType: "works",
  },
  {
    title: "CONSTRUCCION DE PUENTE TUBULAR DE 18.00 MTS. DE LARGO X 4.00 MTS.",
    expectedTier: "excluded",
    note: "Real title (K0080080096 procedure) — 小项目，桥长度小于30M (an 18-meter tubular culvert, not the kind of bridge project 'puente' is meant to signal — new BRIDGE_LENGTH_ANCHOR/SHORT_BRIDGE_METERS check).",
    scopeType: "works",
  },
  {
    title: "CONSTRUCCIÓN DE PUENTE VEHICULAR DE 120 METROS DE LARGO",
    expectedTier: "flagship",
    note: "Regression check — a genuinely large bridge (well over SHORT_BRIDGE_METERS) must still promote via MAJOR_PROJECT_KEYWORDS's bare 'puente' match, confirming the new length check only excludes real small culverts, not real bridges.",
    scopeType: "works",
  },
  {
    title: "SERVICIO ADMINISTRADO DE SEGURIDAD PERIMETRAL",
    expectedTier: "excluded",
    note: "Real title (SHF buyer) — 管理服务项目 (a routine outsourced facility guard/fencing service, not the critical-infrastructure security system the confirmed 'PARA INSTALACIONES ESTRATÉGICAS' example was — the bare phrase without that qualifier no longer bypasses exclusion).",
    scopeType: "services",
  },
  {
    title: "SERVICIO ADMINISTRADO DE VIRTUALIZACIÓN EN NUBE PRIVADA Y COMPLEMENTOS OPERATIVO",
    expectedTier: "standard",
    note: "Real title (SEPOMEX buyer) — 维护管理服务 (routine ongoing IT-ops support, not the infrastructure backup/recovery service the confirmed 'Servicio de respaldo y recuperación para la Nube Privada' example was, so it doesn't bypass exclusion via INCLUDE_OVERRIDE_KEYWORDS). Real ict_telecom industry tag with no disclosed value lands it 'standard' now that tier is reactivated (was 'excluded' 2026-09-02–09-05).",
    scopeType: "services",
  },

  // --- "control de acceso" narrowed to require an equipment/system
  // qualifier (2026-09-04) after a real Colombia SECOP II example was
  // found live in production: a ~US$476 bundled janitorial/reception-desk
  // staffing contract wrongly promoted straight to flagship. ---
  {
    title: "ANDERSON DAVID PACHECO COLINA",
    expectedTier: "excluded",
    note: "Real Colombia title (ESE HOSPITAL LOCAL DE SITIONUEVO buyer, ~US$476/1,999,200 COP) — the process name IS a contractor's own name (a direct individual-services contract), and the real summary is 'PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL DESARROLLO DE ACTIVIDADES DE CONSERJERÍA, CONTROL DE ACCESO, APOYO LOGÍSTICO Y MANTENIMIENTO BÁSICO...' — a bundled janitorial/reception-desk staffing job, not an access-control equipment purchase. The bare 'control de acceso' phrase used to match INCLUDE_OVERRIDE_KEYWORDS and bypass both the exclude checks (including EXCLUDE_KEYWORDS' own 'conserjería' term, present in this same text) and the value floor, landing straight on flagship.",
    summary:
      "PRESTACIÓN DE SERVICIOS DE APOYO A LA GESTIÓN PARA EL DESARROLLO DE ACTIVIDADES DE CONSERJERÍA, CONTROL DE ACCESO, APOYO LOGÍSTICO Y MANTENIMIENTO BÁSICO DE LAS INSTALACIONES DE LA E.S.E. HOSPITAL LOCAL DE SITIONUEVO.",
    scopeType: "services",
    estimatedValue: 1_999_200,
    currency: "COP",
    buyer: "ESE HOSPITAL LOCAL DE SITIONUEVO",
    country: "Colombia",
  },
  {
    title: "ADQUISICIÓN DE SISTEMA DE CONTROL DE ACCESO BIOMÉTRICO PARA INSTALACIONES ESTRATÉGICAS",
    expectedTier: "flagship",
    note: "Regression check — a genuine access-control SYSTEM/equipment purchase must still promote via INCLUDE_OVERRIDE_KEYWORDS, confirming the narrowed pattern (now requiring 'sistema'/'equipo'/'dispositivo'/etc. near 'control de acceso') doesn't lose real matches, only the bare-word false positive above.",
    scopeType: "equipment",
  },

  // --- structuredDurationDays (2026-09-04): Colombia's real duracion/
  // unidad_de_duracion fields feed the duration signal directly now,
  // since Colombia's title/summary text never contains the Spanish
  // phrasing DURATION_ANCHOR scans for — without this the signal could
  // never fire for Colombia at all. See colombia-mapper.ts's
  // normalizeDurationDays() header comment for the "units unverified
  // against real data" caveat. ---
  {
    title: "SUMINISTRO DE ALGO GENERICO",
    expectedTier: "excluded",
    note: "Synthetic — a 45-day structured duration must trigger the same SHORT_DURATION_DAYS exclude as a text-anchored one would, confirming classifyRelevance() actually reads structuredDurationDays.",
    scopeType: "services",
    structuredDurationDays: 45,
    country: "Colombia",
  },
  {
    title: "SUMINISTRO DE ALGO GENERICO A LARGO PLAZO",
    expectedTier: "flagship",
    note: "Synthetic — a 400-day structured duration must trigger the same LONG_DURATION_DAYS flagship promotion as a text-anchored one would, independent of value/industry match.",
    scopeType: "services",
    structuredDurationDays: 400,
    country: "Colombia",
  },

  // --- "subestación" narrowed to require a construction/equipment
  // qualifier (2026-09-04) after a real CFE example was found live in
  // production: a fauna-protection materials purchase was wrongly
  // promoted straight to flagship. ---
  {
    title: "MATERIALES PROFAUNA PARA SUBESTACIONES",
    expectedTier: "excluded",
    note: "Real title (CFE buyer) — wildlife-protection fittings for substations (e.g. anti-perching mesh), a routine materials purchase where 'subestaciones' is only the delivery location, not the actual object of procurement. The bare 'subestación' phrase used to match INCLUDE_OVERRIDE_KEYWORDS and promote straight to flagship regardless of value; that was fixed 2026-09-04. Expected 'standard' from 2026-09-05, when that tier was reactivated and a Mexican tender with no disclosed value could still be kept on an industry tag alone. Back to 'excluded' 2026-09-07, per the user's explicit call that an undisclosed value must not keep a MEXICAN tender ('墨西哥不能这么做') — this title matches no priority keyword, so under keyword-only logic there is nothing left to keep it.",
    scopeType: "equipment",
    buyer: "COMISION FEDERAL DE ELECTRICIDAD",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE SUBESTACIÓN ELÉCTRICA DE POTENCIA",
    expectedTier: "flagship",
    note: "Regression check — a genuine substation construction project must still promote via INCLUDE_OVERRIDE_KEYWORDS, confirming the narrowed pattern (now requiring 'construcción'/'ampliación'/'equipo'/etc. near 'subestación') doesn't lose real matches.",
    scopeType: "works",
  },

  // --- MAINTENANCE_ONLY_KEYWORDS (2026-09-04): a bare "mantenimiento"
  // now excludes unconditionally, bypassing INCLUDE_OVERRIDE_KEYWORDS and
  // MAJOR_PROJECT_KEYWORDS both — real batch of ~28 confirmed Colombia/
  // Mexico examples the user marked "应排除", each wrongly promoted to
  // flagship/significant via a bare override-keyword match (CCTV,
  // videovigilancia, fibra óptica, 5G, seguridad electrónica, sistema de
  // alarma contra incendio, a passing "ferrocarril" reference) alongside
  // "mantenimiento". A representative sample, not the full batch. ---
  {
    title: "CONTRATAR EL MANTENIMIENTO DE LOS SISTEMAS DE CCTV; CONTROLES DE ACCESO Y SEGURIDAD ELECTRÓNICA EN DIFERENTES SEDES",
    expectedTier: "excluded",
    note: "Real title (Colombia, despachos judiciales de Córdoba) — a maintenance SERVICE contract on already-installed CCTV/access-control/electronic-security systems, not a new equipment purchase. Used to bypass exclusion via the bare 'seguridad electrónica' INCLUDE_OVERRIDE_KEYWORDS match.",
    scopeType: "services",
  },
  {
    title: "MANTENIMIENTO DE SISTEMA DE VIDEOVIGILANCIA",
    expectedTier: "excluded",
    note: "Real title — bare 'videovigilancia' INCLUDE_OVERRIDE_KEYWORDS match used to promote this straight to flagship despite being pure maintenance.",
    scopeType: "services",
  },
  {
    title: "PRESTACIÓN DE SERVICIOS DE APOYO EN EL ÁREA FUNCIONAL MANTENIMIENTO DE LA RED FIBRA ÓPTICA; MIGRACIÓN DE CLIENTES A LA RED FTTH",
    expectedTier: "excluded",
    note: "Real title (Colombia) — bare 'fibra óptica' INCLUDE_OVERRIDE_KEYWORDS match used to promote a network maintenance/support service straight to flagship.",
    scopeType: "services",
  },
  {
    title: "MANTENIMIENTO PREVENTIVO; CORRECTIVO Y ACTUALIZACIÓN DEL EQUIPO DE DETECCIÓN Y LOCALIZACIÓN DE EMISIONES 2G; 3G; 4G Y 5G RAPTOR",
    expectedTier: "excluded",
    note: "Real title (Colombia police) — bare '5G' INCLUDE_OVERRIDE_KEYWORDS match used to promote equipment maintenance straight to flagship.",
    scopeType: "services",
  },
  {
    title: "Mantenimiento a las Básculas Camioneras y de Ferrocarril (FFCC) en Terminales de Almacenamiento",
    expectedTier: "excluded",
    note: "Real title — a passing 'Ferrocarril (FFCC)' reference (naming what kind of scale is being maintained, not a railway construction project) matched MAJOR_PROJECT_KEYWORDS' bare 'ferrocarril' and promoted straight to flagship. Confirms MAINTENANCE_ONLY_KEYWORDS is checked before MAJOR_PROJECT_KEYWORDS too, not just INCLUDE_OVERRIDE_KEYWORDS.",
    scopeType: "services",
  },
  {
    title: "CONTRATACIÓN SERV. MANTENIMIENTO PREV. Y CORRECTIVO A EQUIPO MEDICO 2026",
    expectedTier: "excluded",
    note: "Real title — abbreviated 'MANT. PREV.' wasn't matched by the old narrower mantenimiento pattern (which required the unabbreviated 'mantenimiento preventivo'), so this fell through to a FLAGSHIP_INDUSTRY_KEYWORDS medical-equipment match and landed on significant instead of excluded. The new bare \\bmantenimiento\\b catch-all fixes this regardless of abbreviation.",
    scopeType: "services",
  },
  {
    title: "MANTENIMIENTO EQUIPO DE RAYOS X MARCA DRGEM DE LA ESPECIALIDAD DE IMAGENES DIAGNOSTICAS",
    expectedTier: "excluded",
    note: "Real title — bare 'mantenimiento equipo' with no preventivo/correctivo qualifier wasn't covered by the old pattern; fell through to a medical-equipment FLAGSHIP_INDUSTRY_KEYWORDS match (significant) despite being maintenance, not a purchase.",
    scopeType: "services",
  },
  {
    title: "NAC 13-1356/23 REQ 1884 OTROS MATERIALES Y ARTÍCULOS DE CONSTRUCCIÓN Y REPARACIÓN",
    expectedTier: "excluded",
    note: "Real title — a bare 'materiales y artículos de construcción' consumables purchase, not a works contract. Broadened the existing spare-parts/tools EXCLUDE_KEYWORDS entry to also catch this bare 'materiales y artículos de' phrasing.",
    scopeType: "equipment",
  },

  // --- Value floor no longer bypassable by hasIncludeOverride
  // (2026-09-04, explicit user rule: "如有金额，金额过了再用关键字，没有
  // 金额的直接用关键字"). Real batch of tiny-value Colombia tenders kept
  // surfacing as flagship because a bare INCLUDE_OVERRIDE_KEYWORDS match
  // hidden in the summary text bypassed the value floor entirely — the
  // same mechanism already fixed once for MAINTENANCE_ONLY_KEYWORDS. ---
  {
    title: "SERVICIO DE INTERNET",
    expectedTier: "excluded",
    note: "Synthetic (real shape) — a $571 tender whose summary happens to mention fibra óptica/5G must still be excluded on the value floor; a bare override keyword can no longer rescue a below-floor disclosed value.",
    summary: "SERVICIO DE INTERNET CON ENLACE DE FIBRA ÓPTICA DEDICADA Y SOPORTE 5G PARA LA INSTITUCIÓN",
    scopeType: "services",
    estimatedValue: 571 * 3140,
    currency: "COP",
    country: "Colombia",
  },
  {
    title: "QPAR S.A.S",
    expectedTier: "excluded",
    note: "Synthetic (real shape, mirrors the real 'ANDERSON DAVID PACHECO COLINA' pattern of a company/person name as title) — an $8,185 contract whose summary mentions videovigilancia/control de acceso must still be excluded on the value floor.",
    summary: "CONTRATO DE PRESTACIÓN DE SERVICIOS DE VIDEOVIGILANCIA Y CONTROL DE ACCESO",
    scopeType: "services",
    estimatedValue: 8185 * 3140,
    currency: "COP",
    country: "Colombia",
  },

  // --- NON_PROCUREMENT_RECORD_KEYWORDS / bare interadministrativo titles
  // (2026-09-05, real Colombia batch the user flagged as "都要排除") — records
  // that aren't real procurement opportunities at all: a bare inter-
  // administrative funds/logistics agreement, a labor union, a loan. ---
  {
    title: "CONTRATO INTERADMINISTRATIVO DE MANDATO SIN REPRESENTACIÓN PARA LA OPERACIÓN LOGÍSTICA RELACIONADA CON LAS FASES ZONAL REGIONAL Y FINAL NACIONAL DE LOS JUEGOS INTERCOLEGIADOS 2026.",
    expectedTier: "excluded",
    note: "Real title, buyer Instituto Departamental de Deportes de Antioquia, $0.8M USD (clears the Colombia value floor, so needed its own signal) — a 'mandato sin representación' contract is an administrative/logistics pass-through for a sports event, not a direct goods/works purchase.",
    scopeType: "services",
    estimatedValue: 800_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "CONVENIO INTERADMINISTRATIVO TRANSMILENIO",
    expectedTier: "excluded",
    note: "Real title, buyer Secretaría Distrital de Integración Social, $7.8M USD — a bare inter-administrative agreement title with no words describing what's actually being procured.",
    scopeType: "services",
    estimatedValue: 7_800_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "CONTRATO INTERADMINISTRATIVO",
    expectedTier: "excluded",
    note: "Real title, buyer Municipio de Dabeiba, tagged 土建/水务, $2.1M USD — the entire title is just the legal-instrument name, no content describing the actual scope.",
    scopeType: "works",
    estimatedValue: 2_100_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "CONVENIO INTERADMINISTRATIVO",
    expectedTier: "excluded",
    note: "Real title, buyer Santiago de Cali Distrito Especial - Secretaría de Desarrollo Económico, $0.6M USD — same bare-title pattern as the Dabeiba example above.",
    scopeType: "services",
    estimatedValue: 600_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "CONSTRUCCIÓN DE PUENTE VEHICULAR EN EL MARCO DEL CONVENIO INTERADMINISTRATIVO ENTRE EL DEPARTAMENTO Y EL MUNICIPIO DE EJEMPLO PARA LA CONECTIVIDAD VIAL REGIONAL",
    expectedTier: "flagship",
    note: "Synthetic regression check — a genuine, substantial construction project that happens to be funded via an inter-administrative agreement (a legitimate, common Colombian funding structure) must NOT be caught by the bare-interadministrativo-title pattern: the title is long and content-bearing (construcción de puente vehicular), unlike the real bare-title examples above.",
    scopeType: "works",
    country: "Colombia",
  },
  {
    title: "SINDICATO DE PROFESIONALES DE LA SALUD PROSALUD",
    expectedTier: "excluded",
    note: "Real title, buyer Empresa Social del Estado Hospital Marco Fidel Suarez, $0.8M USD — a labor union's name appearing as the record's title, not a procurement.",
    scopeType: "services",
    estimatedValue: 800_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "EMPRÉSTITO",
    expectedTier: "excluded",
    note: "Real title, buyer Municipio de Soacha — a loan/borrowing instrument, not a procurement of goods/works/services.",
    scopeType: "services",
    country: "Colombia",
  },

  // --- Two real industry.ts gaps found chasing the "standard" reactivation
  // + significant-tier no-value gate above (2026-09-05): once a no-value
  // FLAGSHIP_INDUSTRY_KEYWORDS match needed a real classifyIndustries() tag
  // to land "standard" instead of "excluded", two real terms turned out to
  // have no industry tag at all despite relevance.ts's own patterns already
  // recognizing them. Both fixed in lib/industry.ts's "healthcare"/"power"
  // patterns, not here. ---
  {
    title: "ADQUISICIÓN DE GENERADORES DE EMERGENCIA PARA HOSPITALES",
    expectedTier: "standard",
    note: "'hospital\\b' (no plural handling) never matched 'HOSPITALES' — same class of bug as the earlier 'unidad médica' plural gap. Fixed to 'hospital(es)?\\b'. Without any industry tag, this landed 'excluded' instead of 'standard' despite matching FLAGSHIP_INDUSTRY_KEYWORDS's own generador purchase pattern.",
    scopeType: "equipment",
  },
  {
    title: "ADQUISICIÓN DE UPS PARA EQUIPO DE CÓMPUTO",
    expectedTier: "standard",
    note: "'generador(es)?'/'\\bups\\b' were never in industry.ts's power pattern at all, even though relevance.ts's FLAGSHIP_INDUSTRY_KEYWORDS anchored purchase pattern already recognized both (2026-09-04, '白名单加入电力相关的关键设备...还有UPS'). Added to industry.ts's power pattern to match.",
    scopeType: "equipment",
  },
  {
    title: "ADQUISICIÓN DE RELEVADORES DE PROTECCIÓN PARA LÍNEAS DE TRANSMISIÓN",
    expectedTier: "standard",
    note: "Same gap — 'relevador(es)?'/'relé(s) de protección'/'líneas de transmisión' (without 'eléctrica') were never in industry.ts's power pattern, only in relevance.ts's own anchored purchase pattern. Added all three to industry.ts's power pattern.",
    scopeType: "equipment",
  },
];
