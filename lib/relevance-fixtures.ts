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
    note: "Real 2026-09-07 import title. Municipal water-main repair; now excluded by the water-network keywords added later the same day as well as by the undisclosed-value rule.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "PRUEBA SINTÉTICA DE ENERGÍA ELÉCTRICA SIN OBJETO REAL",
    expectedTier: "excluded",
    note: "The Mexican half of the country-scoping pair below. Synthetic on purpose — see that fixture's note.",
    scopeType: "works",
    country: "Mexico",
  },
  // Both real, from the 212-row kept export of 2026-09-08. A village in
  // Municipio Carmen, Campeche is named Puerto Rico, and the bare "puerto"
  // (seaport) keyword matched the village — these two came out FLAGSHIP,
  // the top tier, for paving a locality's streets. Fixed by naming the
  // place in stripKnownFalsePositivePlaceNames(); kept here so a later
  // "simplification" of that list has to fail a test to remove it. The
  // third fixture is the control: the same job in a town with an ordinary
  // name was already excluded, which is what proves the town's name — and
  // nothing about the work — was doing the promoting.
  // Synthetic controls for PORT_WORKS_SOURCE, in the same spirit as the
  // "PRUEBA SINTÉTICA…" fixture above: the point is the port-vs-place-name
  // rule, and a synthetic pair states it more sharply than waiting for each
  // town to show up in a real export. The real titles that motivated the
  // rule are the two Puerto Rico paving rows directly below, plus the
  // PUERTO ALTAMIRA fixture earlier in this file.
  {
    title: "SUMINISTRO DE ALIMENTOS EN PUERTO ESCONDIDO",
    expectedTier: "excluded",
    note: "Synthetic. Catering, in a town called Puerto Escondido — the bare 'puerto' keyword used to make this FLAGSHIP. A town name is not a port project.",
    scopeType: "services",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "SUMINISTRO DE ALIMENTOS EN EL PUERTO DE VERACRUZ",
    expectedTier: "excluded",
    note: "Synthetic. 'El puerto de Veracruz' is also what people call the CITY, so a named port needs a works verb beside it — otherwise every contract in a port city is a port project.",
    scopeType: "services",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "AMPLIACION DEL PUERTO LAZARO CARDENAS",
    expectedTier: "flagship",
    note: "Synthetic. The positive half: a real port written bare as 'PUERTO <name>', which is why PORT_WORKS_SOURCE carries a list of actual ports rather than only 'puerto de'. Dropping that list would have overturned the PUERTO ALTAMIRA tier the user set on 2026-09-07.",
    scopeType: "works",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "PAV CAM LA ANTORCHA - PUERTO RICO, LOCALIDAD PUERTO RICO, MUNICIPIO CARMEN",
    expectedTier: "excluded",
    note: "Real 2026-09-08 kept-export title. Rural road paving in the village of Puerto Rico, Campeche — not a seaport.",
    scopeType: "works",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "PAV DIVERSAS CALLES EN LA LOCALIDAD DE PUERTO RICO, MUNICIPIO CARMEN (BLOQUE 1)",
    expectedTier: "excluded",
    note: "Real 2026-09-08 kept-export title, same village. Street paving, no value.",
    scopeType: "works",
    country: "Mexico",
    governmentLevel: "municipal",
  },
  {
    title: "PAV DIVERSAS CALLES EN LA LOCALIDAD DE SAN JUAN, MUNICIPIO CARMEN",
    expectedTier: "excluded",
    note: "Control for the two above — identical job, ordinary town name. Was already excluded before the fix; must stay excluded after it.",
    scopeType: "works",
    country: "Mexico",
    governmentLevel: "municipal",
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
    title: "PRUEBA SINTÉTICA DE ENERGÍA ELÉCTRICA SIN OBJETO REAL",
    expectedTier: "standard",
    note: "Deliberately SYNTHETIC, not a real tender. This control proves the undisclosed-value rule is scoped to Mexico and did not quietly become global: the same string is excluded as a Mexican tender (fixture above) and kept as a Colombian one. It has been rewritten twice because each real title used for it — a water main, then concrete poles — later turned up on the user's own exclude list, which would have made the control pass for the wrong reason. A string that names nothing real cannot be disputed as data.",
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
    expectedTier: "excluded",
    note: "Pavimentación de camino in the abbreviated form Compras MX uses. Was \"standard\" until 2026-09-08, kept by a dedicated /pav\\s+cam/ whitelist entry. That entry is gone: the fixture two above it — \"PAVIMENTACIÓN CON CONCRETO HIDRÁULICO DEL CAMINO LOCAL\", the same work spelled out, from the user's review of a real export — is excluded, and one job cannot have two tiers depending on whether the clerk abbreviated it. A camino is not a carretera, which stays whitelisted.",
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
    expectedTier: "significant",
    note: "The control for that one: 'obra' as the first word of a real description is not a bare title. The pattern is anchored to the whole string. 2026-09-12 — 中型 now, not 大型: bridges are capped at significant unless a disclosed value clears FLAGSHIP_VALUE_USD (user: 把桥的等级最多改成中级，除非金额很大的项目). Peru's SEACE feed is mostly single-span village crossings, and the word alone was promoting all of them.",
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
    expectedTier: "significant",
    note: "The control for both demotions: rebuilding a bridge outright stays flagship. 'reparación' demotes, 'reconstrucción' deliberately does not, and several real titles of this shape are in the same export. 2026-09-12 — 中型 now, not 大型: bridges are capped at significant unless a disclosed value clears FLAGSHIP_VALUE_USD (user: 把桥的等级最多改成中级，除非金额很大的项目). Peru's SEACE feed is mostly single-span village crossings, and the word alone was promoting all of them. Supersedes the earlier 'reconstrucción stays flagship' carve-out — the cap is by class now, and a big rebuild still reaches 大型 on its own value.",
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
    expectedTier: "excluded",
    note: "REVERSED 2026-09-07, later the same day. This was written as the control showing 'fortalecimiento' with a real object survives — and the user then marked this exact title, and every other hemodinamia/hemodiálisis row, as one to exclude: they are SERVICE contracts, and this platform targets medical equipment. Those two words came off the medical whitelist and went into the exclusions.",
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
    expectedTier: "excluded",
    note: "REVERSED 2026-09-07, later the same day. Kept earlier as the argument against removing the large-value bucket wholesale — a refinery tower read as exactly what this platform exists to surface. The user's own review of the 400 rows put it on the exclude list, so their reading of it governs. Recorded rather than quietly flipped, because the earlier reasoning was explicit.",
    scopeType: "equipment",
    estimatedValue: 4_000_000,
    currency: "USD",
    country: "Colombia",
  },
  {
    title: "COMPRAVENTA DE LAS TUBERÍAS DEL HOGAR DE LA CALDERA DE LA UNIDAD 1 DE TERMOPAIPA; INCLUIDA LA INSTALACIÓN",
    expectedTier: "excluded",
    note: "REVERSED the same way and on the same day, for the same reason.",
    scopeType: "equipment",
    estimatedValue: 3_000_000,
    currency: "USD",
    country: "Colombia",
  },

  // --- 2026-09-07: the user's review of a 400-row kept export. One fixture
  // per rule, not per title — the full corpus was 91 titles. ---
  {
    title: "CONSTRUCCIÓN DE 968.91 M DE DRENAJE SANITARIO POLIETILENO CORRUGADO DE 25 CM.",
    expectedTier: "excluded",
    note: "Municipal sewer pipework. The plants stay — 'CONSTRUCCIÓN DE PLANTA DE TRATAMIENTO DE AGUAS RESIDUALES' is on the keep list — but the pipes, manholes, tanks and collectors around them do not.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE COLECTORES PARA PLANTA DE TRATAMIENTO, SAN MARTÍN HIDALGO, JAL.",
    expectedTier: "excluded",
    note: "Names a treatment plant but buys collectors. Exclusion runs before the works whitelist, so naming the plant cannot rescue the pipework.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE LA PRIMERA ETAPA DE LOS COLECTORES DE PRESA GUADALUPE",
    expectedTier: "standard",
    note: "The control for that: collectors OF A DAM are dam infrastructure, and the user asked for this one at 常规 rather than excluded. The collector pattern is anchored on what the collector is or feeds — sanitario/pluvial/para — never on the bare word.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE TECHUMBRE Y OBRAS COMPLEMENTARIAS EN LA ESCUELA PREPARATORIA NUM 5",
    expectedTier: "excluded",
    note: "A school roof. Small community and school buildings — techumbre, módulo sanitario, aulas, cancha, salón de usos múltiples — all excluded.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "RECONSTRUCCIÓN DEL TEMPLO DE SAN CRISTÓBAL LACHIRIOAG, OAXACA.",
    expectedTier: "excluded",
    note: "Per the user: 全部TEMPLO 和IGLESIA和PARROQUIA 宗教相关都不要. Templo, iglesia, parroquia, capilla, convento, basílica, santuario.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "SERVICIOS MEDICOS DE ESPECIALIZACION (HEMODIALISIS)",
    expectedTier: "excluded",
    note: "Health service delivery. hemodinamia and hemodiálisis came OFF the medical whitelist the same day — every real title carrying them was a service contract, and this platform targets medical equipment.",
    scopeType: "services",
    country: "Mexico",
  },
  {
    title: "ADQUISICIÓN DE GRUPO DE SUMINISTRO 379 (CONSUMIBLES PARA BOMBA DE INFUSIÓN)",
    expectedTier: "excluded",
    note: "Consumables for a pump, not the pump. 'bomba de infusión' stays on the whitelist; 'consumibles para' excludes ahead of it.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "SERVICIO MENSUAL DE ARRENDAMIENTO DE 170 CÁMARAS DE VIDEOVIGILANCIA CON MONITOREO",
    expectedTier: "excluded",
    note: "Renting is not buying, and videovigilancia is an override keyword that was rescuing rentals. Rental joined the non-bypassable class for exactly that reason.",
    scopeType: "services",
    country: "Mexico",
  },
  {
    title: "ADQUISICION DE MOTOCICLETAS Y ACCESORIOS",
    expectedTier: "excluded",
    note: "motocicleta was added to the vehicle whitelist earlier the same day and removed hours later when the user marked this title. The police-fleet title that motivated the addition matches on 'patrullas', the noun immediately after the verb, so it is unaffected.",
    scopeType: "equipment",
    country: "Colombia",
  },
  {
    title: "ADQUISICION DE PATRULLAS PICK UPS, AUTOMOVILES Y MOTOCICLETAS.",
    expectedTier: "standard",
    note: "The control for that removal.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "ESTUDIO DE ORDENAM P/LA AMPLIACIÓN Y MODERNIZAC DEL PUERTO DE PROGRESO, YUCATÁN",
    expectedTier: "excluded",
    note: "Was standard (2026-09-07: 从大型项目改常规项目 — the port is the SUBJECT of a study, not the work). Superseded 2026-09-11: asked directly whether port planning studies should go too, the user answered 要排除, so any title leading with the study is now excluded whatever it studies. Kept rather than deleted — it is the case that forced the question, and it pins the wider rule.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "ADQUISICIÓN DE EQUIPOS DE SEGURIDAD PARA REVISIÓN DE EQUIPAJE EN EL AEROPUERTO INTERNACIONAL",
    expectedTier: "standard",
    note: "Per the user: 建机场才是大型. Equipment bought for the facility is not the facility.",
    scopeType: "equipment",
    country: "Mexico",
  },
  {
    title: "SISTEMA DE ALARMA, DETECCIÓN Y SUPRESIÓN DE INCENDIO DE LA GCRNE",
    expectedTier: "standard",
    note: "An override keyword that protects from exclusion must not also force the top tier on an undisclosed value. Fire alarm, firewall and cybersecurity are single systems or services; videovigilancia and fibra óptica keep forcing flagship. Demoting these first turned them into deletions — the late gates had to learn that an override is a positive signal too.",
    scopeType: "equipment",
    country: "Mexico",
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
    expectedTier: "significant",
    note: "Bridge construction — MAJOR_PROJECT_KEYWORDS 建桥. 2026-09-12 — 中型 now, not 大型: bridges are capped at significant unless a disclosed value clears FLAGSHIP_VALUE_USD (user: 把桥的等级最多改成中级，除非金额很大的项目). Peru's SEACE feed is mostly single-span village crossings, and the word alone was promoting all of them.",
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
    expectedTier: "standard",
    note: "Real title (2026-09-02 export) — port dredging. Used PLURAL 'puertos', which the singular-only pattern missed until the pluralization fix; that half still holds, the tier does not. Demoted 2026-09-07 per the user: dredging silt out of a working port is upkeep, not a port project. The keep-listed \"DRAGADO DE CONSTRUCCIÓN Y CONFORMACIÓN DE LA PLATAFORMA NORTE\" is dredging TO BUILD and does not say desazolve.",
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
    expectedTier: "significant",
    note: "Synthetic — value >= FLAGSHIP_VALUE_USD alone should promote regardless of title content. 2026-09-12 — the value bands moved (大型 now $6M, was $5M), so this $5,000,000 row lands one tier lower. Still the same check: value alone decides when the title says nothing.",
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
    expectedTier: "excluded",
    note: "Heavy-machinery RENTAL, not a purchase. It used to reach 'standard' by falling through: the whitelist needs a purchase verb, which 'arrendamiento' isn't, but nothing excluded it either. Renting is now excluded outright and non-bypassably (2026-09-07), after CCTV and videovigilancia override keywords were found rescuing real rental contracts.",
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
    expectedTier: "excluded",
    note: "Repurposed (2026-09-05): used to test that a per-country value floor override didn't leak onto a country-unset tender — that override (MIN_VALUE_USD_BY_COUNTRY) is gone now that Mexico's floor was unified to Colombia's $500,000 (see MIN_VALUE_USD's own comment). Now tests the companion rule instead: a FLAGSHIP_INDUSTRY_KEYWORDS match (equipo médico) combined with ANY disclosed value above the floor — even one that doesn't clear SIGNIFICANT_VALUE_USD ($1,000,000) on its own — still promotes to significant, only a completely undisclosed value caps it at standard. 2026-09-12 — $600,000 is now under the floor (MIN_VALUE_USD 500,000 → 800,000, user: 感觉500,000以上的太多了).",
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
    expectedTier: "significant",
    note: "Regression check — a genuinely large bridge (well over SHORT_BRIDGE_METERS) must still promote via MAJOR_PROJECT_KEYWORDS's bare 'puente' match, confirming the new length check only excludes real small culverts, not real bridges. 2026-09-12 — 中型 now, not 大型: bridges are capped at significant unless a disclosed value clears FLAGSHIP_VALUE_USD (user: 把桥的等级最多改成中级，除非金额很大的项目). Peru's SEACE feed is mostly single-span village crossings, and the word alone was promoting all of them.",
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
    expectedTier: "significant",
    note: "Synthetic regression check — a genuine, substantial construction project that happens to be funded via an inter-administrative agreement (a legitimate, common Colombian funding structure) must NOT be caught by the bare-interadministrativo-title pattern: the title is long and content-bearing (construcción de puente vehicular), unlike the real bare-title examples above. 2026-09-12 — 中型 now, not 大型: bridges are capped at significant unless a disclosed value clears FLAGSHIP_VALUE_USD (user: 把桥的等级最多改成中级，除非金额很大的项目). Peru's SEACE feed is mostly single-span village crossings, and the word alone was promoting all of them.",
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

  // ---- 2026-09-08 review round: 10 titles the user marked "exclude" and
  // 2 they re-tiered. Values are set on several of these deliberately, to
  // prove the rule excludes them even at a value that would otherwise
  // promote to significant/flagship — the real rows carry disclosed
  // values, which is why the user was seeing them at all. ----
  {
    title: "SUMINISTRO E INSTALACIÓN DE SISTEMA DE ALARMA CONTRA INCENDIO EN LAS GUARDERÍAS",
    expectedTier: "excluded",
    note: "Childcare facility. The regression guard for CHILDCARE_FACILITY_KEYWORDS being checked BEFORE hasIncludeOverride: this title matches INCLUDE_OVERRIDE_KEYWORDS' industrial fire-alarm pattern, so an EXCLUDE_KEYWORDS entry would have been bypassed and this classified 'standard' (verified before the fix).",
    scopeType: "equipment_services",
    country: "Mexico",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "CONSTRUCCION DEL COMPLEJO CAIC'S XOCHIQUÉTZAL - ENCINOS 2026",
    expectedTier: "excluded",
    note: "CAIC = Centro de Atención Infantil Comunitario — a childcare complex, same out-of-scope facility class as the guarderías above.",
    scopeType: "works",
    country: "Mexico",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "CONSTRUCCIÓN Y REHABILITACION DE ESCUELAS",
    expectedTier: "excluded",
    note: "School buildings as the object of the work (the user reported many rows of this shape). Must NOT regress 'CONSTRUCCIÓN DE EDIFICIO ADMINISTRATIVO EN LA ESCUELA PREPARATORIA NO. UNO', which is on the confirmed keep list at standard — hence the '<verb> ... de (la|las) escuela(s)' anchor rather than the bare word.",
    scopeType: "works",
    country: "Mexico",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "SERVICIOS DE MEDICINA ESPECIALIZADA EN NEUMOLOGÍA",
    expectedTier: "excluded",
    note: "Specialist medical services — the doctors, not a hospital build or medical equipment.",
    scopeType: "services",
    country: "Colombia",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "PRESTAR SERVICIOS ESPECIALIZADOS PARA EJECUTAR EL MODELO DE ATENCIÓN DE LA SECRETARÍA DE HACIENDA DE BOGOTÁ; EN EL MARCO DE LA ESTRATEGIA DE RELACIONAMIENTO Y CULTURA TRIBUTARIA",
    expectedTier: "excluded",
    note: "Taxpayer-relations consulting program. Anchored on 'cultura tributaria'/'estrategia de relacionamiento', not on 'modelo de atención' — that phrase also appears in real health-infrastructure titles.",
    scopeType: "services",
    country: "Colombia",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "ADQUIRIR DIADEMAS E INSUMOS DE SONIDO PARA ACTIVIDADES A REALIZAR EN MODALIDAD EXTRAMURAL EN DESARROLLO DEL CONVENIO EQUIPO MAS BIENESTAR EN SU HOGAR DE LA SUBRED INTEGRADA DE SERVICIOS DE SALUD NORTE",
    expectedTier: "excluded",
    note: "Headsets and AV consumables for outreach activities.",
    scopeType: "equipment",
    country: "Colombia",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "Servicio de horas de consultoría para configuración y ajuste de servicios necesarios para la operación de la herramienta; soporte técnico y atención de incidentes al Sistema de Gestión Documental Papi",
    expectedTier: "excluded",
    note: "Hourly consulting plus helpdesk on software already in production — not equipment, not a build.",
    scopeType: "services",
    country: "Colombia",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "CONTRATAR LA PRESTACION DE SERVICIOS PARA EJECUTAR ACTIVIDADES E INTERVENCIONES COLECTIVAS DIRIGIDO A PROMOVEER EL BIENESTAR INTEGRAL DE NIÑOS NIÑAS ADOLESCENTES JOVENES Y ADULTOS DE LAS COMUNICADES I",
    expectedTier: "excluded",
    note: "Collective social-welfare program delivered by staff; no goods or works.",
    scopeType: "services",
    country: "Colombia",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "IMPLEMENTACIÓN DE UN SISTEMA INTEGRAL DE BOMBEO CENTRALIZADO Y RECUPERACIÓN DE PRODUCTO PARA LAS LÍNEAS DE PRODUCTO DE LA FÁBRICA DE LICORES Y ALCOHOLES DE ANTIOQUIA EICE",
    expectedTier: "excluded",
    note: "A state liquor monopoly's own production plant. Anchored on 'fábrica de licores', NOT on 'bombeo' — 'CONSTRUCCIÓN DE PLANTA DE BOMBEO' is on the user's keep list.",
    scopeType: "equipment_services",
    country: "Colombia",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "Proveer el acceso a los servicios para la consulta en listas restrictivas y de control conforme a la normatividad aplicable al FNG mediante la consulta web y de integración con los aplicativos del FNG",
    expectedTier: "excluded",
    note: "Compliance-screening web data subscription, sold by access.",
    scopeType: "services",
    country: "Colombia",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "CONSTRUCCIÓN PLANTA POTABILIZADORA, DE LA PRESA TUNAL II DURANGO, DURANGO.",
    expectedTier: "significant",
    note: "2026-09-08, user: 大型项目改成中型. The bare 'presa' entry in MAJOR_PROJECT_KEYWORDS was forcing flagship, but the dam is the water source here, not the build. Significant (not standard) because the potabilization plant itself is real infrastructure the user keeps.",
    scopeType: "works",
    country: "Mexico",
  },
  {
    title: "CONSTRUCCIÓN DE TANQUES, DISTRIBUCIÓN Y ALCANTARILLADO, M. COMPOSTELA, NAYARIT",
    expectedTier: "excluded",
    note: "2026-09-08. The user first listed this under 大型项目改成常规, but the 2026-09-07 municipal-network rules already exclude it outright (it hits 'alcantarillado', 'tanque de almacenamiento' and 'línea de conducción' — the 水厂要、周边管网不要 principle). Excluded is stricter than standard, so it was left excluded and put back to the user, who confirmed: 可以排除. The row showing as 大型 in admin is a pre-2026-09-07 stored tier; npm run reclassify:tenders realigns it. Fixture exists so a future carve-out to any of those three patterns can't silently re-admit this shape.",
    scopeType: "works",
    country: "Mexico",
    estimatedValue: 3_000_000,
    currency: "USD",
  },
  {
    title: "IA-N-188-226 SERVICIO DE MASTOGRAFIAS Y ULTRASONIDO MAMARIO UNIDAD MOVIL",
    expectedTier: "excluded",
    note: "2026-09-11 round. Outsourced diagnostic imaging bought as a service. Anchored on the service/study wording, not on 'unidad móvil' — a mobile unit can be a real vehicle purchase, which stays on the keep list.",
    scopeType: "services",
    country: "Mexico",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "\"ESTUDIOS PROYECTO CONSTRUCCIÓN Y EQUIPO PARA POZO HGZ TULA Y UMF 37 HIDALGO",
    expectedTier: "excluded",
    note: "2026-09-11 round. 'Estudios y proyectos' is a design-and-engineering package, not the build. Deliberately narrower than a leading-'estudios' rule: that would also have excluded the Progreso port study the user put at 常规 on 2026-09-07 — the regression suite caught it. The leading stray quote is real, hence the \\W* in the pattern.",
    scopeType: "works",
    country: "Mexico",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  {
    title: "CONSTRUCCIÓN DE RETORNO TIPO \"HERRADURA\"",
    expectedTier: "excluded",
    note: "2026-09-11 round. A single highway U-turn lane — same small-scale roadworks class as the community buildings.",
    scopeType: "works",
    country: "Mexico",
    estimatedValue: 2_000_000,
    currency: "USD",
  },
  // --- 2026-09-11 Colombia round. Real titles from the first import after
  // the modalidad gate opened Colombia up: 155 of the 180 kept rows were
  // kept on value alone, so these are what the content rules had to learn. ---
  {
    title: "PRESTAR LOS SERVICIOS MÉDICO-VETERINARIOS PARA LA ATENCIÓN DE CANINOS Y FELINOS; MEDIANTE JORNADAS DE ESTERILIZACIÓN",
    expectedTier: "excluded",
    note: "Real Colombia title, user marked 排除. Veterinary field service.",
    country: "Colombia",
    scopeType: "services",
    estimatedValue: 1_200_000,
    currency: "USD",
  },
  {
    title: "ADQUISICIÓN DE EQUIPO DE ESTERILIZACIÓN DE INSTRUMENTAL QUIRÚRGICO PARA EL HOSPITAL DEPARTAMENTAL",
    expectedTier: "standard",
    note: "Guards the veterinary rule: 'esterilización' also describes sterilizing surgical instruments, which is real hospital equipment spend. Excluding on the bare word would have taken this with it. Lands in significant on the Colombia value band, as every kept row at this amount does; what it pins is that it is kept at all. 2026-09-12 — $1.2M sits in the new 常规 band (800k–3M); 中型 starts at $3M.",
    country: "Colombia",
    scopeType: "equipment",
    estimatedValue: 1_200_000,
    currency: "USD",
  },
  {
    title: "CONTRATAR A UN INTERMEDIARIO DE SEGUROS; LEGALMENTE CONSTITUIDO EN COLOMBIA; QUE REALICE LA INTERMEDIACIÓN EN LA CONTRATACIÓN DE LAS PÓLIZAS",
    expectedTier: "excluded",
    note: "Real Colombia title, user marked 排除. A financial intermediary's commission.",
    country: "Colombia",
    scopeType: "services",
    estimatedValue: 1_500_000,
    currency: "USD",
  },
  {
    title: "EJECUTAR ESTRATEGIAS DE REHABILITACIÓN Y REVEGETALIZACIÓN EN ÁREAS CON PRESENCIA DE ESPECIES PIONERAS COLONIZADORAS",
    expectedTier: "excluded",
    note: "Real Colombia title, user marked 排除. Ecological revegetation.",
    country: "Colombia",
    scopeType: "services",
    estimatedValue: 6_000_000,
    currency: "USD",
  },
  {
    title: "ADECUACIÓN DEL CENTRO DE TRASLADO POR PROTECCIÓN (CTP) PARA EL FORTALECIMIENTO DE LA CONVIVENCIA Y SEGURIDAD CIUDADANA",
    expectedTier: "excluded",
    note: "Real Colombia title, user marked 排除. Anchored on the full phrase — the bare acronym CTP collides with too much else.",
    country: "Colombia",
    scopeType: "works",
    estimatedValue: 1_100_000,
    currency: "USD",
  },
  {
    title: "IMPLEMENTACIÓN DE ACCIONES PARA MEJORAS EN INFRAESTRUCTURA Y DOTACIÓN DE LAS INSTITUCIONES EDUCATIVAS ESCOLARES",
    expectedTier: "excluded",
    note: "Why the school rule was widened on 2026-09-11: Colombia says 'institución educativa' where Mexico says 'escuela', and frames it as mejoras/dotación rather than construcción.",
    country: "Colombia",
    scopeType: "works",
    estimatedValue: 1_300_000,
    currency: "USD",
  },
  {
    title: "IMPLEMENTACIÓN DE SISTEMAS DE ENERGÍA FOTOVOLTAICA EN INSTITUCIONES EDUCATIVAS DEL MUNICIPIO DE TAME; DEPARTAMENTO DE ARAUCA",
    expectedTier: "standard",
    note: "The is-vs-where line the school rule deliberately draws, now on the Colombian wording: this is a solar installation that happens to sit AT schools ('en'), not a school being built or fitted out ('de'). Flagged to the user as the one arguable case in this round. 2026-09-12 — $1.4M sits in the new 常规 band (800k–3M).",
    country: "Colombia",
    scopeType: "works",
    estimatedValue: 1_400_000,
    currency: "USD",
  },
  {
    title: "CONSTRUCCION DE VIVIENDA DE INTERES PRIORITARIO; VIP; VIVIENDA BIFAMILIAR EN EL MUNICIPIO DE SALAMINA",
    expectedTier: "significant",
    note: "User decided 不排除 in the 2026-09-11 Colombia round — social housing is real construction. Pinned so a later housing exclusion cannot take it silently.",
    country: "Colombia",
    scopeType: "works",
    estimatedValue: 1_600_000,
    currency: "USD",
  },
  // --- 2026-09-11, second round. The user reviewed the full kept list for
  // both countries; these pin the rules that came out of it, and — more
  // importantly — the near misses each one had to avoid. ---
  {
    title: "DESARROLLAR EL PROCESO DE SELECCIÓN PARA LA PROVISIÓN DEFINITIVA EN LA MODALIDAD DE INGRESO DE LOS EMPLEOS VACANTES DEL MUNICIPIO",
    expectedTier: "excluded",
    note: "Civil-service recruitment, and at $9.8M it was sitting at flagship.",
    country: "Colombia", scopeType: "services", estimatedValue: 40_000_000_000, currency: "COP",
  },
  {
    title: "FORTALECIMIENTO DE PEQUEÑOS Y MEDIANOS PRODUCTORES",
    expectedTier: "excluded",
    note: "Capacity-building programme. The rule only fires on a LEADING 'fortalecimiento'.",
    country: "Colombia", scopeType: "services", estimatedValue: 26_000_000_000, currency: "COP",
  },
  {
    title: "FORTALECIMIENTO DE LA INFRAESTRUCTURA VIAL DEL MUNICIPIO DE SOACHA",
    expectedTier: "flagship",
    note: "Guards the leading-fortalecimiento rule: the same word introduces real roadworks, which is why it carries a lookahead for the infrastructure nouns.",
    country: "Colombia", scopeType: "works", estimatedValue: 26_000_000_000, currency: "COP",
  },
  {
    title: "ADQUISICIÓN DE VEHÍCULO TIPO VAN UNIFORMADA CON DESTINO A LA ESTACION DE POLICIA NOBSA Y FORTALECIMIENTO DEL SISTEMA DE VIDEOVIGILANCIA",
    expectedTier: "excluded",
    note: "Second guard on the same rule — 'fortalecimiento' trailing a real equipment purchase the user keeps. Plural-less 'VEHÍCULO' here is deliberate too: this one is a marked van with a CCTV package, not a bare single-car buy, and it survives because the title does not start with 'adquisición de vehículo'. 2026-09-12 — 2.4B COP ≈ $764k, now under the $800,000 floor.",
    country: "Colombia", scopeType: "equipment", estimatedValue: 2_400_000_000, currency: "COP",
  },
  {
    title: "PRESTAR LOS SERVICIOS DE VIGILANCIA Y SEGURIDAD PRIVADA, COMPRENDIDOS POR VIGILANCIA FÍSICA, SERVICIO DE ESCOLTA, MONITOREO",
    expectedTier: "excluded",
    note: "Outsourced guards. Was kept by the CCTV equipment rule.",
    country: "Colombia", scopeType: "services", estimatedValue: 2_200_000_000, currency: "COP",
  },
  {
    title: "CONSTRUCCIÓN DE CENTRO DE ALTO RENDIMIENTO DEPORTIVO EN LA CIUDAD DE MONTERÍA; DEPARTAMENTO DE CÓRDOBA; FASE II",
    expectedTier: "flagship",
    note: "The row that produced the municipal-amenity value exception (user's call, 2026-09-11). Real value, COP 28,037,383,178 ≈ USD 8.9M — a structural works contract at a scale a foreign contractor bids on, which the flat amenity rule was excluding alongside a USD 2.5M skating rink. The three fixtures below are its guards: the exception must not widen the class.",
    country: "Colombia", scopeType: "works", estimatedValue: 28_037_383_178, currency: "COP",
  },
  {
    title: "CONSTRUCCIÓN DEL PARQUE ECOLÓGICO DE LOS DEPORTES DEL MUNICIPIO DE SOGAMOSO PARQUE RECREACIONAL DEL SUR DEPARTAMENTO DE BOYACA",
    expectedTier: "excluded",
    note: "The near-miss that pins the floor. Real row from the same reviewed export, COP 14,166,534,845 ≈ USD 4.5M — just under FLAGSHIP_VALUE_USD, so it stays excluded. If the floor is ever lowered this fixture is what catches it.",
    country: "Colombia", scopeType: "works", estimatedValue: 14_166_534_845, currency: "COP",
  },
  {
    title: "CONSTRUCCION DE PISTA DE PATINAJE - MUNICIPIO DE ARACATACA - DEPARTAMENTO DEL MAGDALENA",
    expectedTier: "excluded",
    note: "Real row, COP 7,948,700,039 ≈ USD 2.5M. The small municipal amenity the class is actually for — unaffected by the exception.",
    country: "Colombia", scopeType: "works", estimatedValue: 7_948_700_039, currency: "COP",
  },
  {
    title: "CONSTRUCCIÓN DE CENTRO DE ALTO RENDIMIENTO DEPORTIVO EN LA CIUDAD DE MONTERÍA; DEPARTAMENTO DE CÓRDOBA; FASE II",
    expectedTier: "excluded",
    note: "Same real title and real value as the flagship fixture above, with only scopeType varied to 'services' — the real row is 'works'. Deliberately synthetic in that one field, to pin the scopeType half of isLargeAmenityBuild(): running or programming an amenity is the human/social class the exclusion is for however large the budget, and only construction gets the exception.",
    country: "Colombia", scopeType: "services", estimatedValue: 28_037_383_178, currency: "COP",
  },
  {
    title: "OTORGAR EN CONCESIÓN, LA OPERACIÓN Y EXPLOTACIÓN DE LAS ÁREAS QUE COMPONEN LA ESTRUCTURA FÍSICA DEL CENTRO DE ATENCION AL VISITANTE",
    expectedTier: "excluded",
    note: "The state leasing out an asset it already owns, not buying anything.",
    country: "Colombia", scopeType: "services",
  },
  {
    title: "CONCESIÓN PARA LA CONSTRUCCIÓN, OPERACIÓN Y MANTENIMIENTO DE LA DOBLE CALZADA BUCARAMANGA - PAMPLONA",
    expectedTier: "flagship",
    note: "Guards the concession rule: a build-and-operate highway concession is exactly what this platform exists to surface, which is why that rule anchors on 'otorgar en concesión ... explotación' and not on the word concesión. It also pins the maintenance carve-out added the same day: 'construcción, operación y mantenimiento' is the standard naming of a DBOM road concession, and the bare mantenimiento catch-all was excluding every one of them.",
    country: "Colombia", scopeType: "works", estimatedValue: 900_000_000_000, currency: "COP",
  },
  {
    title: "ADMINISTRACIÓN, OPERACIÓN Y MANTENIMIENTO DEL SISTEMA DE ACUEDUCTO Y ALCANTARILLADO MUNICIPAL",
    expectedTier: "excluded",
    note: "Guards the concession carve-out from the other side: a pure O&M contract names no construction and no concession, so it stays excluded — which is the 2026-09-04 decision the maintenance rule exists to enforce.",
    country: "Colombia", scopeType: "services", estimatedValue: 40_000_000_000, currency: "COP",
  },
  {
    title: "MANTENIMIENTO Y REHABILITACIÓN DE LA VÍA TERCIARIA DEL MUNICIPIO DE GUATAVITA",
    expectedTier: "excluded",
    note: "Second guard: a build verb alone must not reopen the rule. Without the concession framing this is still routine road upkeep.",
    country: "Colombia", scopeType: "works", estimatedValue: 8_000_000_000, currency: "COP",
  },
  {
    title: "IMPLEMENTACIÓN DE ACCIONES DE RESTAURACIÓN Y REHABILITACIÓN ECOLÓGICA PARA LA PRESERVACIÓN DE LOS ECOSISTEMAS",
    expectedTier: "excluded",
    note: "Why the ecological rule stopped requiring the two words to be adjacent — a second noun sits between them here.",
    country: "Colombia", scopeType: "services", estimatedValue: 108_000_000_000, currency: "COP",
  },
  {
    title: "Centro de desarrollo Infantil",
    expectedTier: "excluded",
    note: "Colombia's wording for a daycare, added under the user's existing childcare decision.",
    country: "Colombia", scopeType: "works", estimatedValue: 17_000_000_000, currency: "COP",
  },
  {
    title: "SEGUIMIENTO Y CONTROL DE LOS TRABAJOS DE RECONSTRUCCIÓN LA ZONA SUR (PAQ. 1)",
    expectedTier: "excluded",
    note: "Supervision of someone else's build — 5 real rows in the 2026-09-11 Mexico list.",
    country: "Mexico", scopeType: "services",
  },
  {
    title: "CONSTRUCCIÓN PUENTE PEATONAL ESTACIÓN 3 SIST.INTERCONECTADO ELECTROMOVILIDAD L-5",
    expectedTier: "excluded",
    note: "User excluded pedestrian bridges outright (2026-09-11). The bridge rule already refused to PROMOTE them; the construcción whitelist was still keeping them.",
    country: "Mexico", scopeType: "works",
  },
  {
    title: "ADQUISICIÓN DE UN VEHICULO TIPO PICK UP, PATRONATO",
    expectedTier: "excluded",
    note: "The 单台下限 the user asked for: a one-car purchase.",
    country: "Mexico", scopeType: "equipment",
  },
  {
    title: "ADQUISICIÓN DE VEHÍCULOS TIPO SEDÁN PARA LOS PROGRAMAS SSYRA Y SNSP SANAS 2026",
    expectedTier: "standard",
    note: "Guards the single-vehicle floor: a fleet buy stays in, at the low priority the user set for vehicles.",
    country: "Mexico", scopeType: "equipment",
  },
  {
    title: "ADQS. DE 22 VEHS. CISTERNA CAP. 10,000 LTS. PARA TURBOCINA",
    expectedTier: "standard",
    note: "Second guard on the same floor — an abbreviated, numbered fleet buy.",
    country: "Mexico", scopeType: "equipment",
  },
  {
    title: "SERVICIOS TECNOLÓGICOS DE GEOLOCALIZACIÓN Y SOPORTE EN CIBERSEGURIDAD",
    expectedTier: "standard",
    note: "User decided 保留 in this round. Pinned so a later services sweep cannot take it silently.",
    country: "Mexico", scopeType: "services",
  },
  // --- Four real open INFOTEC procedures the user found missing 2026-09-12 --
  // All four are on Compras MX right now and all four were excluded: the rows
  // carry no value, Mexico is in UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL, and
  // not one of them said "ciberseguridad" or the singular "centro de datos" —
  // the only two ICT terms that could have rescued them.
  //
  // All four are kept now, and all four are pinned here rather than trusted
  // to the keyword list: the whole failure was that an ICT term nobody had
  // thought to write down silently cost four live opportunities, and a
  // keyword list cannot tell you what is missing from it. A fixture can.
  {
    title: "SERVICIO INTEGRAL DE SEGURIDAD PARA DATOS CRÍTICOS Y CUENTAS PRIVILEGIADAS",
    expectedTier: "standard",
    note: "LA-55-91M-05591M001-N-25-2026. Privileged access management — kept by 'cuentas privilegiadas', at the same tier as any other cybersecurity service (OVERRIDE_NOT_FLAGSHIP).",
    country: "Mexico", scopeType: "services",
  },
  {
    title: "SERVICIO INTEGRAL DE PROTECCIÓN CONTRA AMENAZAS CIBERNÉTICAS",
    expectedTier: "standard",
    note: "LA-55-91M-05591M001-N-26-2026. Cybersecurity without the word ciberseguridad — the gap these two terms close.",
    country: "Mexico", scopeType: "services",
  },
  {
    title: "SERVICIO PARA EL FORTALECIMIENTO DE LOS CENTROS DE DATOS DE INFOTEC",
    expectedTier: "flagship",
    note: "LA-55-91M-05591M001-N-24-2026. Excluded on the plural alone before 2026-09-12 (the list said 'centro de datos'). Flagship confirmed by the user 2026-09-12 when asked whether the 2026-09-05 Modernización-datacenter precedent should demote an UPGRADE service too: it should not. A data centre is flagship here whether it is being built or strengthened.",
    country: "Mexico", scopeType: "services",
  },
  {
    title: "SERVICIO INTEGRAL DE PROTECCIÓN DE LA INFORMACIÓN Y GESTIÓN DE RIESGOS",
    expectedTier: "standard",
    note: "LA-55-91M-05591M001-N-27-2026. Held out on the first pass on the theory that 'protección de la información' also names archival/privacy work; the user confirmed all four are live on Compras MX and wants all four kept, and the theory cost nothing to test — adding the term flips none of the other fixtures here.",
    country: "Mexico", scopeType: "services",
  },
  {
    title: "RECONSTRUCCIÓN DEL PALACIO MUNICIPAL, GUEVEA DE HUMBOLDT, OAXACA",
    expectedTier: "standard",
    note: "User decided 保留 in this round, unlike the other small municipal buildings.",
    country: "Mexico", scopeType: "works",
  },
  // --- Peru's first real import (2026-09-11, 8620 OECE records) ------------
  // Every title below is verbatim from that run's kept/excluded export.
  {
    title: "ADQUISION DE DIESEL B5 S50 PARA EL PROYECTO MEJORAMIENTO DE LA TRANSITABILIDAD VEHICULAR DE LA CARRETERA PAUCARTAMBO",
    expectedTier: "excluded",
    note: "purchaseSubject(): the contract is for diesel. Before the cut, 'carretera' in the project name matched the bare works whitelist and this came in as a road project. No estimatedValue on purpose — with the project name gone there is no flagship-industry match left, so this also pins the Peru undisclosed-value gate.",
    country: "Peru", scopeType: "equipment",
  },
  {
    title: "ADQUISICION DE DIVERSOS MUEBLES DE MELAMINE Y OTROS SEGÚN EE.TT. PARA LA OBRA CONSTRUCCION INFRAESTRUCTURA DEPORTIVA",
    expectedTier: "excluded",
    note: "Same cut through the other connector ('para la obra'). Melamine furniture, named after the works it furnishes.",
    country: "Peru", scopeType: "equipment",
  },
  {
    title: "SERVICIO DE ALQUILER DE EXCAVADORA SOBRE ORUGA SEGUN REQUERIMIENTO Y TERMINOS DE REFERENCIA, PARA EL PROYECTO MEJORAMIENTO DE LA CARRETERA",
    expectedTier: "excluded",
    note: "Equipment RENTAL for someone else's road project — the third supply head purchaseSubject() recognises.",
    country: "Peru", scopeType: "services",
  },
  {
    title: "CONTRATACIÓN PARA EJECUCIÓN DE LA OBRA: MEJORAMIENTO DE LA CARRETERA DEPARTAMENTAL EMP. PE-3N",
    expectedTier: "flagship",
    note: "The guard on purchaseSubject(): this title's head is CONTRATACIÓN, not a purchase, so 'obra' being a connector word must NOT cut it. A real departmental highway from the same run.",
    country: "Peru", scopeType: "works", governmentLevel: "state", estimatedValue: 170_000_000, currency: "PEN",
  },
  {
    title: "ADQUISICIÓN DE EQUIPAMIENTO MEDICO DE ESPECIALIDADES SEGÚN REQUERIMIENTO PARA EL PROYECTO MEJORAMIENTO DEL SERVICIO DE SALUD",
    expectedTier: "significant",
    note: "The other side of the guard: the cut fires, and the row still promotes — because what is left, 'EQUIPAMIENTO MEDICO', is itself a flagship industry. The rule removes borrowed signal, not real signal. 2026-09-12 — 20M PEN ≈ $5.97M, just under the new $6M 大型 line. Kept as a fixture precisely because it is the case that killed the first draft of the construction-input rule: 'PARA EL PROYECTO' is not evidence that goods are a materials order.",
    country: "Peru", scopeType: "equipment", governmentLevel: "state", estimatedValue: 20_000_000, currency: "PEN",
  },
  {
    title: "CONTRATACIÓN DE SERVICIO DE TÉCNICAS EN ENFERMERÍA PARA LOS DIFERENTES SERVICIOS DEL CENTRO DE SALUD LA OROYA",
    expectedTier: "excluded",
    note: "Peru undisclosed-value gate: nursing-agency staffing, tagged healthcare, no amount. 571 of 1295 kept rows were this shape before the gate covered Peru.",
    country: "Peru", scopeType: "services",
  },
  {
    title: "ADQUISICION DE PUERTAS DE MADERA INCLUYE ACCESORIOS E INSTALACION SEGÚN REQUERIMIENTO Y ESPECIFICACIONES TECNICAS",
    expectedTier: "excluded",
    note: "Same gate, no 'para el proyecto' involved — wooden doors with no amount.",
    country: "Peru", scopeType: "equipment",
  },
  {
    title: "SUMINISTRO DE MEDICAMENTOS NO PNUME - INMUNOGLOBULINA HUMANA NORMAL 5g/100 mL INY 100 mL",
    expectedTier: "excluded",
    note: "The /\\b5g\\b/ telecom pattern was matching a gram dosage and rescuing drug supply as an include-override. Guarded in both relevance.ts and industry.ts.",
    country: "Peru", scopeType: "equipment",
  },
  {
    title: "EJECUCION DE LA OBRA AMPLIACION DEL SERVICIO DE PRÁCTICA DEPORTIVA Y/O RECREATIVA EN COMPLEJO DEPORTIVO MULTIUSOS",
    expectedTier: "excluded",
    note: "'complejo deportivo' / 'práctica deportiva' joined MUNICIPAL_AMENITY_KEYWORDS. Value is under the class's ≥$5M works exception, so the exception is not what decides this one.",
    country: "Peru", scopeType: "works", estimatedValue: 4_000_000, currency: "PEN",
  },
  {
    title: "CONTRATACION DE LA EJECUCION DE LA IOARR: RENOVACION DE PUENTE; EN EL(LA) SAN MIGUEL EN LA LOCALIDAD SAN MIGUEL",
    expectedTier: "excluded",
    note: "PERU_MARGINAL_INVESTMENT, the user's call on 2026-09-11 ('IOARR 且无金额 → 排除'). A village footbridge replacement that was flagship on the word 'puente' alone.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  {
    title: "CONTRATACIÓN PARA LA EJECUCION DE LA IOAAR: RENOVACION DE PUENTE; EN EL(LA) CAMINO VECINAL RUTA LA MORADA",
    expectedTier: "excluded",
    note: "Same rule through the clerical misspelling 'IOAAR', which is as common as the official 'IOARR' in real SEACE titles.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  {
    title: "CONTRATACION DE LA EJECUCION DE LA IOARR: RENOVACION DE PUENTE EN LA RUTA NACIONAL PE-5N",
    expectedTier: "flagship",
    note: "The other half of that call — 有金额的照常按门槛judge. An IOARR that publishes a real amount is judged on it, because some genuinely run to several million.",
    country: "Peru", scopeType: "works", governmentLevel: "state", estimatedValue: 42_000_000, currency: "PEN",
  },
  // --- ProInversión Obras por Impuestos (2026-09-11 export) ----------------
  {
    title: "MEJORAMIENTO Y AMPLIACION DE LOS SERVICIOS DE SALUD EN EL HOSPITAL II-E LAMAS DISTRITO DE LAMAS - PROVINCIA DE LAMAS - DEPARTAMENTO DE SAN MARTIN",
    expectedTier: "flagship",
    note: "The largest row in the first OxI export (S/305,207,991 ≈ $91.1M) and it was EXCLUDED as routine health-services procurement: Invierte.pe names every public investment 'MEJORAMIENTO DEL SERVICIO DE <public service>', so a hospital BUILDING project reads as outsourced staffing to a bare 'servicios de salud en' pattern. That half of the pattern now requires prestación/contratación framing.",
    country: "Peru", scopeType: "works", governmentLevel: "state", estimatedValue: 305_207_991, currency: "PEN",
  },
  {
    title: "CONTRATACIÓN DE LA PRESTACIÓN DE SERVICIOS DE SALUD EN CONSULTA EXTERNA PARA ASEGURADOS",
    expectedTier: "excluded",
    note: "The other side of that narrowing — what the rule was always for, outsourced service DELIVERY, must still be excluded.",
    country: "Peru", scopeType: "services", estimatedValue: 20_000_000, currency: "PEN",
  },
  {
    title: "CREACION DEL SERVICIO DE AGUA POTABLE RURAL Y CREACION DEL SERVICIO DE ALCANTARILLADO U OTRAS FORMAS DE DISPOSICIÓN SANITARIA DE EXCRETAS EN 28 CENTROS POBLADOS DE LA CUENCA DEL RIO MOMON DISTRITO DE PUNCHANA DE LA PROVINCIA DE MAYNAS DEL DEPARTAMENTO DE LORETO",
    expectedTier: "flagship",
    note: "WATER_NETWORK_KEYWORDS' value exception, the user's call on 2026-09-11 (保留). S/139,742,000 ≈ $41.7M, the second-largest row in the first OxI export — a whole greenfield system for 28 settlements, excluded until now on the word 'alcantarillado' alone.",
    country: "Peru", scopeType: "works", governmentLevel: "state", estimatedValue: 139_742_000, currency: "PEN",
  },
  {
    title: "CREACION DEL SISTEMA DE AGUA POTABLE, ALCANTARILLADO Y PLANTA DE TRATAMIENTO DE AGUA RESIDUAL (PTAR) DE LOS CENTROS URBANOS ALEDAÑOS A LA AV. LA MARINA, DISTRITO DE YARINACOCHA",
    expectedTier: "flagship",
    note: "Second real row of the same shape, this one naming the treatment plant outright.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal", estimatedValue: 84_118_500, currency: "PEN",
  },
  {
    title: "CONSTRUCCIÓN DE LÍNEA DE CONDUCCIÓN PARA EL SISTEMA DE AGUA POTABLE DEL CENTRO POBLADO",
    expectedTier: "excluded",
    note: "The exception must not swallow the rule. A real Peru row at ~$550k — a water main, which is exactly what the user's 2026-09-07 'networks out, plants in' call excludes — stays out because it is nowhere near the $5M works threshold.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal", estimatedValue: 1_845_000, currency: "PEN",
  },
  {
    title: "EJECUCIÓN DEL MANUAL DE OPERACIÓN Y MANTENIMIENTO DE LA PLANTA DE TRATAMIENTO DE AGUA POTABLE Y LA PLANTA DE TRATAMIENTO DE AGUAS RESIDUALES DE LA CIUDAD DE HUARMEY",
    expectedTier: "excluded",
    note: "The fifth large 'alcantarillado'-family row in that export: an O&M manual for an existing plant at $3.35M. Below the threshold AND maintenance-only — it must stay excluded on either count.",
    country: "Peru", scopeType: "services", governmentLevel: "municipal", estimatedValue: 11_222_500, currency: "PEN",
  },
  // ---- 2026-09-11: the user asked why the platform held ONE electricity
  // project while CFE plainly had open ones. Root cause: every CFE tender
  // reaches us through DOF, DOF publishes no value at all, Mexico is in
  // UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL, and FLAGSHIP_INDUSTRY_KEYWORDS
  // had no grid vocabulary — so `power` was tagged and then dropped. Every
  // title below is a real CFE convocatoria the user found published. ----
  {
    title:
      "Suministro, instalación y puesta en servicio de reguladores automáticos de tensión para las centrales generadoras de la RGVM",
    expectedTier: "standard",
    note: "CFE-0001-CAAAT-0127-2024, real DOF convocatoria. Kept on 'centrales generadoras'. Was excluded purely for having no value — DOF never publishes one.",
    country: "Mexico", scopeType: "services", governmentLevel: "public_company",
  },
  {
    title:
      "IMPLEMENTACION DE UNIDAD TERMINAL REMOTA REDUNDANTE PARA EL ENLACE DEL SISTEMA DE CONTROL DISTRIBUIDO DE LA CENTRAL CICLO COMBINADO POZA RICA Y EL CENTRO NACIONAL DE CONTROL DE ENERGIA",
    expectedTier: "standard",
    note: "CFE-MSC-CFE-0929-CSAAA-0007-2026, open on CFE's micrositio. 'CENTRAL CICLO COMBINADO' drops the 'de', which is why that word is optional in the pattern.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "public_company",
  },
  {
    title: "LÍNEA DE TRANSMISIÓN 400 KV Y SUBESTACIÓN ELÉCTRICA ZONA NORTE",
    expectedTier: "standard",
    note: "The grid vocabulary that carried no signal at all before — subestación, línea de transmisión, a stated kV. Deliberately phrased with NO construcción/ampliación verb: with one it is kept by INCLUDE_OVERRIDE and proves nothing about these patterns.",
    country: "Mexico", scopeType: "works", governmentLevel: "public_company",
  },
  {
    title: "MATERIALES PROFAUNA PARA SUBESTACIONES",
    expectedTier: "excluded",
    note: "The other side of it. A box of materials delivered TO a substation is not grid work — and this one has no purchase verb for purchaseSubject() to cut on, so the materials rule has to recognise a title that opens with the goods.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "public_company",
  },
  {
    title: "QUERÉTARO.- CONSTRUCCIÓN DE OBRAS DE ELECTRIFICACIÓN (MANO DE OBRA Y SUMINISTRO DE MATERIALES) PROGRAMA CDI, TERCER PAQUETE MUNICIPIOS DE EZEQUIEL MONTES Y CADEREYTA",
    expectedTier: "standard",
    note: "Real CFE distribution build. 'mano de obra y suministro de materiales' is the standard phrasing for a full works contract — the contractor supplies both — and reading it as a consumables purchase excluded the tender even WITH a value, while the identical title without the parenthetical was kept.",
    country: "Mexico", scopeType: "works", governmentLevel: "public_company",
  },
  {
    title: "SERVICIO DE VIGILANCIA Y SEGURIDAD PARA LA SUBESTACIÓN",
    expectedTier: "excluded",
    note: "Guard duty at a substation must not ride in on the new grid vocabulary.",
    country: "Mexico", scopeType: "services", governmentLevel: "public_company",
  },
  {
    title: "MEJORAMIENTO DEL SERVICIO DE ENERGIA ELECTRICA EN LA LOCALIDAD DE SAN JUAN",
    expectedTier: "excluded",
    note: "Why 'electrificación' was deliberately left OUT of the new patterns: Invierte.pe names small household electrification programmes this way, and Peru would have flooded in behind the Mexican fix.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  // ---- 2026-09-11, second pass: the first real DOF pull for CFE kept 4 of
  // 33, and the user named the four scenarios still missing — 发电 / 输电 /
  // 配电 / 逆变器. One fixture per category, plus the guards each one needed.
  // Every Mexican title is a real CFE convocatoria or a real phrasing from
  // one; the Peru rows are the flood these patterns must not cause. ----
  {
    title:
      "Adquisición de Partes a Presión para Pared Frontal, Posterior, Laterales, Esquinas y Módulo de Economizador del Generador de Vapor de la Unidad 3 de la Central Termoeléctrica Pdte. Emilio Portes Gil",
    expectedTier: "standard",
    note: "Real, live on the site after the first DOF pull. Held by two independent terms (generador de vapor, central termoeléctrica) — a regression here means the whole 发电 block broke.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "public_company",
  },
  {
    title: "SUMINISTRO DE INTERRUPTORES DE POTENCIA 115 KV Y SECCIONADORES",
    expectedTier: "standard",
    note: "输电: substation switchgear. Neither term existed in any whitelist, and with DOF publishing no value these fell out for having no signal at all.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "public_company",
  },
  {
    title: "SUMINISTRO DE CELDAS DE MEDIA TENSIÓN Y CENTRO DE TRANSFORMACIÓN",
    expectedTier: "standard",
    note: "配电: distribution plant.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "public_company",
  },
  {
    title: "ADQUISICIÓN DE INVERSORES PARA PLANTA SOLAR",
    expectedTier: "standard",
    note: "逆变器, via the purchase-verb frame.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "public_company",
  },
  {
    title: "CONVOCATORIA A INVERSORES PARA EL PROYECTO",
    expectedTier: "excluded",
    note: "Why the inverter patterns are anchored and never bare: 'inversores' is also the ordinary Spanish word for INVESTORS, and a financing notice is not a tender.",
    country: "Mexico", scopeType: "services", governmentLevel: "public_company",
  },
  {
    title: "MANTENIMIENTO PREVENTIVO A TURBINAS DE GAS",
    expectedTier: "excluded",
    note: "The generation vocabulary must not rescue maintenance — the same line the 2026-09-04 transformer rule drew by requiring a purchase verb.",
    country: "Mexico", scopeType: "services", governmentLevel: "public_company",
  },
  {
    title: "AMPLIACION DE REDES DE DISTRIBUCION PRIMARIA Y SECUNDARIA EN EL CENTRO POBLADO",
    expectedTier: "excluded",
    note: "The reason every 配电 pattern demands an electrical qualifier: this is how Invierte.pe names small Peruvian rural distribution programmes, and a bare 'redes de distribución' would have flooded Peru behind a Mexican fix.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  // ---------------------------------------------------------------------
  // 2026-09-12 review. The user worked three live lists and named every row
  // that should not have been there, plus two tier complaints and a new set
  // of value bands. Each one is kept here so the next rule change has to
  // answer for it.
  // ---------------------------------------------------------------------
  {
    title: "DESARROLLAR EL PROCESO DE SELECCIÓN PARA LA PROVISIÓN DEFINITIVA EN LA MODALIDAD DE INGRESO DE LOS EMPLEOS VACANTES DEL SISTEMA DE CARRERA ESPECIAL DEL INSTITUTO NACIONAL DE MEDICINA LEGAL Y CIENCIAS FORENSES",
    expectedTier: "excluded",
    note: "Colombia, 2026-09-12 — a civil-service recruitment competition, not procurement. 医疗人员资质筛选类.",
    country: "Colombia", scopeType: "services", governmentLevel: "federal",
  },
  {
    title: "PAGO POR RESULTADOS - PROMOCIÓN DE EMPLEO",
    expectedTier: "excluded",
    note: "Colombia, 2026-09-12 — employment-promotion programme funding. 就业推动.",
    country: "Colombia", scopeType: "services", governmentLevel: "federal",
  },
  {
    title: "FIDUCIA PAGO POR RESULTADOS EMPLEO",
    expectedTier: "excluded",
    note: "Colombia, 2026-09-12 — the trust vehicle administering the same employment programme. 就业推动.",
    country: "Colombia", scopeType: "services", governmentLevel: "federal",
  },
  {
    title: "OTORGAR EN CONCESIÓN, LA OPERACIÓN Y EXPLOTACIÓN DE LAS ÁREAS QUE COMPONEN LA ESTRUCTURA FÍSICA DEL CENTRO DE ATENCION AL VISITANTE - CAV DEL JARDÍN BOTÁNICO",
    expectedTier: "excluded",
    note: "Colombia, 2026-09-12 — a concession to run a visitor centre, not a build. 特许经营权.",
    country: "Colombia", scopeType: "services", governmentLevel: "municipal",
  },
  {
    title: "Prestar los servicios para el desarrollo del diseño y aplicación de la prueba de conocimiento, competencias, aptitudes, habilidades y/o psicotécnica de la convocatoria 28 para los funcionarios de la Rama Judicial",
    expectedTier: "excluded",
    note: "Colombia, 2026-09-12 — designing and running civil-service exams. 咨询服务.",
    country: "Colombia", scopeType: "consulting", governmentLevel: "federal",
  },
  {
    title: "FORTALECIMIENTO ORGANIZACIONES SOCIALES E INSTANCIAS DE PARTICIPACION",
    expectedTier: "excluded",
    note: "Colombia, 2026-09-12 — capacity-building for community organisations.",
    country: "Colombia", scopeType: "services", governmentLevel: "municipal",
  },
  {
    title: "FORTALECIMIENTO EMPRESARIAL",
    expectedTier: "excluded",
    note: "Colombia, 2026-09-12 — small-business support programme.",
    country: "Colombia", scopeType: "services", governmentLevel: "municipal",
  },
  {
    title: "Adquisición de Tubería Lisa y Riflada para las Paredes de los Generadores de Vapor de la C.T. Puerto Libertad",
    expectedTier: "excluded",
    note: "CFE, 2026-09-12 — 管道不要. Boiler-wall tubing for a named power station: a pipe order that mentions a generator, not generation equipment. The exclusion has to beat the power whitelist, which is why CONSTRUCTION_INPUT_GOODS runs as an exclude.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "federal",
  },
  {
    title: "Adquisición de tubería y accesorios para el suministro de obra toma Laguna y la red contra incendio con destino a la Central Termoeléctrica Altamira.",
    expectedTier: "excluded",
    note: "CFE, 2026-09-12 — 管道不要. Names a thermoelectric plant and a works intake; still a pipe-and-fittings order.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "federal",
  },
  {
    title: "Adquisición de válvulas de Control del Generador de Vapor de la C.T. F.P.R.",
    expectedTier: "excluded",
    note: "CFE, 2026-09-12 — 阀门不要.",
    country: "Mexico", scopeType: "equipment", governmentLevel: "federal",
  },
  {
    title: "ADQUISICIÓN DE BARRA DE ACERO CORRUGADO PARA LA OBRA: MEJORAMIENTO DEL SERVICIO DE TRANSITABILIDAD VIAL MEDIANTE EL PUENTE CARROZABLE CCENTABAMBA DE LOS DISTRITOS DE SIVIA Y AYNA",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — rebar for a named bridge works. The bridge in the title is what was promoting it; the contract is a steel order.",
    country: "Peru", scopeType: "equipment", governmentLevel: "municipal",
  },
  {
    title: "ADQUISICIÓN DE MATERIAL GRANULAR PARA SUB-BASE TIPO B, PARA LA OBRA: MEJORAMIENTO DEL SERVICIO DE TRANSITABILIDAD VIAL INTERURBANA DE LA VIA VECINAL RUTA S/C EMP MO-518 (PUENTE CANILAY) PE-36 A, DISTRITO DE TORATA",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — sub-base aggregate for a named road works.",
    country: "Peru", scopeType: "equipment", governmentLevel: "municipal",
  },
  {
    title: "CONTRATACIÓN DE CONSULTORÍA DE OBRA PARA EL SUPERVISOR DE LA EJECUCION DE LA OBRA: CREACION DEL SERVICIO DE MOVILIDAD URBANA EN LAS VÍAS LOCALES DE LA ASOCIACIÓN SAN JOSÉ ETAPA II - ANTIGUO AEROPUERTO",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — site supervision. SEACE files these as scopeType works (they attach to the obra), so the consulting-scope exclusion never saw them and they were promoted on the vocabulary of the project they supervise — this one on 'AEROPUERTO'.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  {
    title: "CONTRATACIÓN DE CONSULTORÍA DE OBRA: RENOVACIÓN DE PUENTE; EN EL(LA) VÍA VECINAL CHUGURMAYO _ LA FLORIDA (PUENTE EL COLORADO) EN EL CENTRO POBLADO CHUGURMAYO, DISTRITO DE SOROCHUCO",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — consultancy on a bridge renewal; reached 大型 on the bridge it studies.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  {
    title: "CONSULTORIA DE OBRA RENOVACION DE PUENTE; EN EL(LA) VIA VECINAL, QUEBRADA SAN JUAN PAMPA EN EL CAMINO VECINAL EMP. CA-876 (NINABAMBA) - SAN JUAN PAMPA",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — same shape without the CONTRATACIÓN DE prefix.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  {
    title: "SERVICIO A TODO COSTO DE CONSTRUCCIÓN DE 226 CAJAS PARA INSTALACIÓN DE VÁLVULAS DE PURGA DE AIRE EN EL AMBITO DE EPSEL SA - ESTUDIO TARIFARIO 2025-2028",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — 226 concrete boxes for air-release valves on a water utility's network.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  {
    title: "CONTRATACION DE SERVICIO DE FABRICACIÓN DE PUENTE METALICO MODULAR DE 24.384X3.2M DSR2, PARA SOBRECARGA HL-93, TRANSPORTE DE ESTRUCTURA METÁLICA Y MONTAJE Y LANZAMIENTO DEL PUENTE METALICO MODULAR",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — a prefabricated modular span with a model number, fabricated and shipped. Building a bridge is kept; buying one off a catalogue is not.",
    country: "Peru", scopeType: "works", governmentLevel: "municipal",
  },
  {
    title: "ADQUISICIÓN DE UN (01) MONTACARGA DE 5 TONELADAS PARA EL TERMINAL PORTUARIO DE SUPE",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — 1台叉车. Was reaching 大型 on 'TERMINAL PORTUARIO'.",
    country: "Peru", scopeType: "equipment", governmentLevel: "federal",
  },
  {
    title: "ADQUISICION DE CAMIONETA 4 X 4 PARA LA GERENCIA DE OPERACIONES DE LA EPS EMAPA PASCO S.A.",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — 1台车. Singular camioneta; the plural fleet fixture (CAMIONETAS TIPO SUV) must stay in.",
    country: "Peru", scopeType: "equipment", governmentLevel: "municipal",
  },
  {
    title: "ADQUISICION DE CAMIONETA; EN EL (LA) OFICINA DE GESTION DEL RIESGO DE DESASTRES Y DEFENSA CIVIL DE LA MUNICIPALIDAD PROVINCIAL DE HUARAZ",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — one pickup for a municipal office.",
    country: "Peru", scopeType: "equipment", governmentLevel: "municipal",
  },
  {
    title: "SERVICIO DE CARGA Y TRANSPORTE DE MATERIAL DE CANTERA, (MATERIAL DE ENCIMADO Y CORONA PARA CONFORMACIÓN DE SUB RASANTE PARA LA META 123 MEJORAMIENTO DE AMPLIACIÓN DE LA CARRETERA",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — hauling quarry material to a highway works.",
    country: "Peru", scopeType: "services", governmentLevel: "municipal",
  },
  {
    title: "COMBUSTIBLE B5 S-50 PARA EL PROGRAMA AGUA ES VIDA DE LA GERENCIA DE VIVIENDA, CONSTRUCCIÓN Y SANEAMIENTO",
    expectedTier: "excluded",
    note: "Peru, 2026-09-12 — diesel for a programme's own vehicles.",
    country: "Peru", scopeType: "equipment", governmentLevel: "state",
  },
];
