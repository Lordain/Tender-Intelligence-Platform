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
 * Category set. The original product decision named education/healthcare/
 * tax/energy/power/ict_telecom/transportation/construction as the required
 * minimum, with mining/water on top as common, real categories in Mexican
 * public procurement (LOPSRM covers agua potable constantly, for one).
 *
 * Three of those are gone as of 2026-09-11, after the user saw how much of
 * the filter was dead: "education" and "tax" removed outright, "mining"
 * merged into "energy" as "energy_mining" (能矿). Education and tax were
 * empty by design — this file's own keyword rules were fine, but
 * lib/relevance.ts excludes school buildings, childcare, medical services,
 * consulting and tax-culture programs, which is nearly everything those two
 * ever held. Mining is granted by concession here, not tendered. Migration
 * 0040 rewrote the tags already stored.
 *
 * "energy_mining" and "power" stay separate, and that is not an oversight:
 * "power" is the electricity grid itself (CFE-shaped), the merged category
 * is extraction and fuels (PEMEX-shaped) — different buyers, different
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
  | "healthcare"
  | "energy_mining"
  | "power"
  | "ict_telecom"
  | "transportation"
  | "construction"
  | "heavy_equipment"
  | "water"
  | "vehicles"
  | "general";

/** Every defined category, in the order the filter UI should list them (required-minimum set first, extras after, "general" last as the catch-all). */
export const ALL_INDUSTRIES: IndustryKey[] = [
  "healthcare",
  "energy_mining",
  "power",
  "ict_telecom",
  "transportation",
  "construction",
  "heavy_equipment",
  "water",
  "vehicles",
  "general",
];

const INDUSTRY_KEYWORDS: [IndustryKey, RegExp][] = [
  // Deliberately equipment/facility only — osteosíntesis/endoprótesis/
  // prótesis/implante/ortopedia/reactivo/medicamento/fármaco/insumo
  // médico/material de curación are medical CONSUMABLES, not equipment;
  // removed to match lib/relevance.ts's same "equipment only, not
  // consumables" scope decision (see README.md) — a tender relevance.ts
  // now excludes shouldn't still carry a "healthcare" tag implying it's a
  // target opportunity.
  // "unidad m[ée]dica" (2026-09-04, real gap): never matched the plural
  // "UNIDADES MEDICAS" real titles use — no \b/plural handling at all.
  // "rayos x" added alongside — real title "ADQUISICIÓN DE EQUIPOS DE
  // RAYOS X PARA DIVERSAS UNIDADES MEDICAS" matched neither term before.
  // "hospital(es)?\b" (2026-09-05, real gap found chasing the relevance.ts
  // "standard" no-value demotion): "hospital\b" alone never matched the
  // plural "HOSPITALES" real titles use (no word boundary between "hospital"
  // and its "es" suffix), e.g. "ADQUISICIÓN DE GENERADORES DE EMERGENCIA
  // PARA HOSPITALES" — same class of bug as "unidad médica" above.
  // "hospitalari[oa]s?" (2026-09-05, real gap): "hospital(es)?\b" requires a
  // word boundary right after "hospital", which the ADJECTIVE form
  // "hospitalario/hospitalaria(s)" never has (no boundary between "hospital"
  // and the following "ario/aria") — real title "ADECUACIONES A LAS
  // INFRAESTRUCTURAS HOSPITALARIAS DEL DEPARTAMENTO DEL MAGDALENA" matched
  // neither this nor the construction pattern's own hospital term.
  ["healthcare", /equipo m[ée]dico|equipamiento m[ée]dico|equipo de laboratorio|bomba de infusi[óo]n|ventilador pulmonar|hemodi[áa]lisis|hemodinamia|imagenolog[íi]a|radiolog[íi]a|tomograf[íi]a|resonancia magn[ée]tica|rayos x|hospital(es)?\b|hospitalari[oa]s?|unidad(es)? m[ée]dica(s)?|servicios de salud|\bsalud\b/i],
  // "\bducto\b" (2026-09-03, real bug found against a real Proyectos
  // Estratégicos MX export): was missing its leading \b, so it matched
  // as a bare substring of "acueducto" (aqueduct — CONAGUA's own
  // vocabulary for a water pipeline) too, wrongly tagging real water
  // projects "energy" (5/48 real rows in that export). "\bducto\b" alone
  // now only matches the standalone word.
  // "\bpemex\b|petr[óo]leos mexicanos" removed (2026-09-04, real recurring
  // bug — the SAME class of problem this file already documented once for
  // "SERVICIO DE CALIBRACIÓN A EQUIPOS PATRONES", a routine calibration
  // service that only ever got tagged "energy" because PEMEX happened to be
  // the buyer): several mappers (pemex-mapper.ts among them) pass the buyer
  // name into classifyIndustries(), and a bare organization name says
  // nothing about what's actually being procured — real titles like
  // "ADQUISICIÓN DE EXCAVADORA HIDRÁULICA PARA USARSE EN LA REFINERÍA
  // MADERO" and "ADQUISICIÓN DE CAMIÓN TIPO CISTERNA...PARA LA REFINERÍA
  // MINATITLÁN" (buyer: Pemex Transformación Industrial) were tagged
  // "energy" purely from the buyer's own name, not from buying an
  // excavator or a tanker truck having anything to do with oil & gas. Real
  // energy-sector CONTENT is already well covered by every other term in
  // this pattern (petróleo/petroquímica/hidrocarburo/refinería/gas
  // natural/ductos/pozo petrolero/renewables) — a PEMEX-buyer tender whose
  // title genuinely describes oil-and-gas work still tags "energy"
  // normally through those; one that doesn't (equipment/vehicles/routine
  // services) correctly no longer does just because of who's buying it.
  // "refiner[íi]a" narrowed with a negative lookbehind (2026-09-04, per the
  // user's explicit follow-up: "好几个 PEMEX 买家的车辆/设备采购（挖掘机、油罐车）可以改"):
  // removing the bare "\bpemex\b" alternative above wasn't enough to fix the
  // two real examples the user pointed at — "ADQUISICIÓN DE EXCAVADORA
  // HIDRÁULICA PARA USARSE EN LA REFINERÍA MADERO..." and "ADQUISICIÓN DE
  // CAMIÓN TIPO CISTERNA...PARA LA REFINERÍA MINATITLÁN" — because their
  // titles independently say "refinería", just as a DELIVERY LOCATION for a
  // vehicle purchase, not as the subject of the work. The lookbehind only
  // excludes the exact "para (uso/usarse en )?(la/el )?refinería" phrase
  // shape — a genuine refinery construction/expansion/maintenance title
  // ("CONSTRUCCIÓN DE NUEVA REFINERÍA...", "MODERNIZACIÓN DE LA REFINERÍA DE
  // TULA...", "SERVICIOS DE MANTENIMIENTO INDUSTRIAL EN LA REFINERÍA...")
  // still matches normally since "refinería" there isn't immediately
  // preceded by that narrow "para ... la/el" shape.
  // energy and mining merged into one category 2026-09-11 (user: 把矿业+能源
  // 合并，统称能矿). Government procurement in these countries tenders very
  // little of either on its own — mining is granted by concession, not
  // bought — so two near-empty filter options were worse than one real one.
  // Heavy construction machinery as its own category (2026-09-11, user:
  // 把 Excavadora、Grúa 这类重型设备都调到这个标签下). These used to land on
  // "construction" next to real civil works, or on "general", which made the
  // filter useless for the one thing a Chinese manufacturer most wants to
  // find: equipment tenders it can actually supply.
  //
  // "grúa" is deliberately qualified — a bare match would also pull in tow
  // trucks ("grúa de arrastre"), which belong under vehicles. "montacargas"
  // (forklift) is included: it is materials-handling plant, bought the same
  // way and by the same buyers.
  ["heavy_equipment", /excavadora|retroexcavadora|motoniveladora|cargador frontal|minicargador|bulldozer|topadora|tractor de orugas|compactadora|rodillo vibratorio|pavimentadora|montacargas|maquinaria pesada|maquinaria para construcci[óo]n|gr[úu]a(s)? (torre|hidr[áa]ulica|telesc[óo]pica|sobre|m[óo]vil|articulada)|planta de asfalto|revolvedora de concreto|olla revolvedora/i],
  ["energy_mining", /petr[óo]leo|petroqu[íi]mic[ao]|hidrocarburo|perforaci[óo]n|(?<!para (uso en |usarse en )?(la |el )?)refiner[íi]a|gas natural|\bducto\b|oleoducto|gasoducto|yacimiento|pozo petrolero|energ[íi]a renovable|planta solar|e[óo]lic[ao]|fotovoltaic[ao]|geot[ée]rmic[ao]|biocombustible|resistividad|miner[íi]a|mineral(?!es de construcci)|yacimiento minero|concesi[óo]n minera/i],
  // "generador(es)?"/"\bups\b" added (2026-09-05, same real gap as the
  // "hospital(es)?" fix above): relevance.ts's FLAGSHIP_INDUSTRY_KEYWORDS
  // already recognizes a generator/UPS purchase as power-grid key
  // equipment (2026-09-04, "白名单加入电力相关的关键设备...还有UPS"), but this
  // classifier never tagged either term "power" at all — a real gap only
  // surfaced once relevance.ts started requiring a real industry tag (not
  // just its own keyword match) for a no-value tender to avoid landing in
  // "excluded" instead of "standard".
  // "energ[íi]a fotovoltaica|sistemas? de energ[íi]a solar" (2026-09-05, real
  // gap): a solar-PV installation is fundamentally an electricity-
  // generation asset, so it's also tagged "power" (electricity grid/
  // generation) alongside "energy" (its existing tag via the bare
  // "fotovoltaic[ao]" term above) — real title "IMPLEMENTACIÓN DE SISTEMAS
  // DE ENERGÍA FOTOVOLTAICA EN INSTITUCIONES EDUCATIVAS".
  ["power", /energ[íi]a el[ée]ctrica|electricidad|subestaci[óo]n|transmisi[óo]n el[ée]ctrica|l[íi]neas? de transmisi[óo]n|generaci[óo]n el[ée]ctrica|red el[ée]ctrica|distribuci[óo]n el[ée]ctrica|\bcfe\b|comisi[óo]n federal de electricidad|transformador(es)?|generador(es)?|\bups\b|relevador(es)?|rel[ée]s? de protecci[óo]n|casa de m[áa]quinas|energ[íi]a fotovoltaica|sistemas? de energ[íi]a solar/i],
  // The second half of this alternation (ran/bts/ruteador/wdm/...) is the
  // same real ICT/telecom equipment whitelist added to
  // INCLUDE_OVERRIDE_KEYWORDS in lib/relevance.ts (a real batch of 29
  // CFE TEIT-style tender titles) — kept in sync so these also get
  // tagged "ict_telecom" for filtering, not just protected from exclusion.
  // "seguridad electr[óo]nica|videovigilancia" added (2026-09-04, real gap):
  // already in relevance.ts's INCLUDE_OVERRIDE_KEYWORDS (protects tier) but
  // missing here (never got the ict_telecom TAG) — real title
  // "IMPLEMENTACIÓN DE SOLUCIÓN DE SISTEMAS DE SEGURIDAD ELECTRÓNICA TIPO
  // VIDEOVIGILANCIA".
  // "monitoreo (de )?veh[íi]culos"/"inhibidor(es)? de se[ñn]al"/"video ?wall"
  // added (2026-09-05, real gaps the user flagged): a vehicle-MONITORING/
  // tracking system was tagged only "vehicles" (from the bare word
  // "vehículos"), a signal-jammer purchase fell through to "general" with
  // no ICT signal at all, and a video-wall display system for a military
  // school was tagged only "education" (from "escuela militar") — all
  // three are genuine ICT/electronics equipment, not what their incidental
  // matching term implied.
  // "intelig[ée]ncia artificial|big ?data"/"circuito(s) cerrado(s) de
  // televisi[óo]n|\bcctv\b"/"sistema de informaci[óo]n hospitalaria"/
  // "sistema inteligente de transporte" added (2026-09-05, real gaps): an
  // IA/Bigdata equipment purchase, a CCTV system, a hospital
  // information-system/ERP project, and a smart-transport camera system
  // all fell through to "general" with no ICT signal at all.
  // The same four ICT security terms added to lib/relevance.ts on 2026-09-12,
  // added here too — the gap was in BOTH files, and the second half of it is
  // the quieter one. Four live INFOTEC procedures reached the relevance
  // classifier as "general" with no ICT signal at all, so even once kept they
  // would not have appeared under the 行业 filter the user actually browses
  // by. `centro(s)?` for the same reason it was fixed there: the real title
  // said CENTROS DE DATOS, and the singular never matched it.
  ["ict_telecom", /telecomunicaci|datacenter|centro(s)? de datos|cibern[ée]tic[oa]s?|ciberataque(s)?|ciberdefensa|cuentas privilegiadas|gesti[óo]n de identidades|protecci[óo]n de (la )?informaci[óo]n|seguridad de la informaci[óo]n|fibra [óo]ptica|red de comunicaciones|software|sistema inform[áa]tico|\btic\b|(?<![\d+]\s?)\b5g\b(?!\s*[\/x×])|ciberseguridad|seguridad electr[óo]nica|videovigilancia|\bran\b|\bbts\b|ruteador(es)?|\brouter(es)?\b|\bmifi\b|nube privada|red metropolitana|red de agregaci[óo]n|red terrestre core|\bwdm\b|\bdwdm\b|microondas|antiddos|caseta(s)? integral(es)? de comunicaciones|torres? (arriostrad|autosoportad)|\baicc\b|firewall|\bixp\b|internet gratuito|monitoreo (de )?veh[íi]culos|inhibidor(es)? de se[ñn]al|video ?wall|intelig[ée]ncia artificial|big ?data|circuito(s)? cerrado(s)? de televisi[óo]n|\bcctv\b|sistema de informaci[óo]n hospitalaria|sistema inteligente de transporte/i],
  // "tren ferroviario"/"tramo ... ferroviario"/"eje prioritario"/"ancho de
  // corona" added (2026-09-04, real gaps): real SICT/rail titles like
  // "CONSTRUCCIÓN Y DISEÑO DE 82.00 KM DEL TRAMO II FERROVIARIO DEL TREN DE
  // PASAJEROS", "MODERNIZACIÓN Y AMPLIACIÓN DEL EJE PRIORITARIO SALINA CRUZ
  // - ZIHUATANEJO", "...CON UN ANCHO DE CORONA DE 22.00" (road-widening —
  // "ancho de corona" is standard Mexican highway-engineering terminology
  // for the road's top width) never matched any existing transportation
  // term.
  // "v[íi]as? terciarias?|placa huella" (2026-09-05, real gap): "MEJORAMIENTO
  // DE VIAS TERCIARIAS CON LA CONSTRUCCION DE PLACA HUELLA" — rural
  // tertiary-road improvement, a distinct real Colombian road-network
  // category ("vías terciarias") from the urban/highway terms already here.
  ["transportation", /transporte p[úu]blico|movilidad urbana|vialidad\b|sistema de transporte|autob[úu]s|tren de pasajeros|ferroviari[oa]|metro\b|log[íi]stica de transporte|se[ñn]alizaci[óo]n vial|comunicaciones y transportes|eje (prioritario|carretero)|ancho de corona|v[íi]as? terciarias?|placa huella/i],
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
  // "puente\b" -> "puentes?\b" (2026-09-04, real gap): missed the plural
  // "PUENTES" real titles use ("...PUENTES DE LA RED FEDERAL...") — no \b
  // right after "puente" means no word boundary exists before the plural
  // "s", so the old pattern silently never matched it.
  // "aeropuerto" narrowed out of the bare list (2026-09-04, real false
  // positive): "ADQUISICIÓN DE EQUIPOS DE SEGURIDAD PARA REVISIÓN DE
  // EQUIPAJE EN EL AEROPUERTO" is an equipment purchase, not construction,
  // but the bare word alone was tagging it "construction" regardless.
  // Re-added below as its own alternative, anchored to a real construction
  // verb nearby — still matches genuine airport construction/expansion
  // ("AMPLIACIÓN DE AEROPUERTO INTERNACIONAL"), no longer a bare mention.
  // "remodelaci[óo]n"/"modernizaci[óo]n y ampliaci[óo]n"/"ancho de corona"
  // added for the same real batch as the transportation pattern above.
  // "puerto\b" -> "\bpuerto\b" (2026-09-04, real bug found while fixing the
  // aeropuerto false positive below): no LEADING boundary meant "puerto\b"
  // matched as a bare substring inside "aeroPUERTO" too — the exact same
  // "\bducto\b"-inside-"acueDUCTO" class of bug this file's own header
  // comment already documents for a different word. That silently defeated
  // the aeropuerto narrowing just below (still matched via "puerto" as a
  // substring even after removing the standalone "aeropuerto" alternative)
  // until caught by a real end-to-end check against the exact false-positive
  // title.
  // "infraestructuras? hospitalaria(s)?|obras? de reparaci[óo]n y
  // rehabilitaci[óo]n|rehabilitaci[óo]n de (la )?infraestructura f[íi]sica"
  // (2026-09-05, real gaps): "ADECUACIONES A LAS INFRAESTRUCTURAS
  // HOSPITALARIAS..." and "OBRAS DE REPARACIÓN Y REHABILITACIÓN DE LA
  // INFRAESTRUCTURA FÍSICA DE LAS ÁREAS DE ALTO RIESGO OBSTÉTRICO..." never
  // matched any existing construction term (no "construcción"/"obra
  // pública"/etc.) despite being genuine building repair/rehab work.
  ["construction", /construcci[óo]n|obra p[úu]blica|carreter[ao]|puentes?\b|ferrocarril|\bpuerto\b|edificaci[óo]n|pavimentaci[óo]n|infraestructura vial|remodelaci[óo]n|modernizaci[óo]n y ampliaci[óo]n|ancho de corona|\bkm\s*\d+\+\d{3}\b|(construcci[óo]n|ampliaci[óo]n|modernizaci[óo]n|remodelaci[óo]n).{0,30}aeropuerto|infraestructuras? hospitalaria(s)?|obras? de reparaci[óo]n y rehabilitaci[óo]n|rehabilitaci[óo]n de (la )?infraestructura f[íi]sica/i],
  // "\bptar\b" (2026-09-03, real gap): CONAGUA's own titles overwhelmingly
  // abbreviate "Planta de Tratamiento de Aguas Residuales" as "PTAR"
  // rather than spelling it out (many real rows in the same export) —
  // "planta de tratamiento de agua" alone missed all of them.
  // dragado/desazolve/acueducto/canal principal/río/margen (derecha|
  // izquierda)/zona de riego/presa added (2026-09-04, real gaps): real
  // CONAGUA titles like "DRAGADO DE DESAZOLVE DE LOS PUERTOS DE...",
  // "SUSTITUCIÓN ACUEDUCTOS PAPAGAYO I Y II...", "CANAL PRINCIPAL
  // CAJONES...", "OBRAS DE PROTECCIÓN EN LA MARGEN DERECHA DEL RÍO
  // TULA...", "CONSOLIDACIÓN DE LA ZONA DE RIEGO DE LA PRESA SANTA
  // MARIA..." never matched any existing water term (some only had
  // "construcción", landing them on the construction tag alone despite
  // being genuine water-infrastructure work). "\bpresas?\b" mirrors
  // relevance.ts's own MAJOR_PROJECT_KEYWORDS dam pattern, added here too
  // so the same real dam/reservoir titles also get the water TAG, not
  // just the flagship tier.
  ["water", /agua potable|saneamiento|drenaje|alcantarillado|planta de tratamiento de agua|planta potabilizadora|\bptar\b|dragado|desazolve|acueducto(s)?|canal principal|\br[íi]o\b|margen (derecha|izquierda)|zona de riego|\bpresas?\b/i],
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
  // excavadora/grúa named alongside the generic "maquinaria pesada" already
  // here (2026-09-07): relevance.ts's purchase whitelist was extended to
  // name the machines directly, and without a matching tag here such a
  // tender still falls to the no-industry/no-value exclusion — the
  // whitelist entry would match and change nothing.
  ["vehicles", /veh[íi]culo(s)?|vehs\.?\b|cami[óo]n(es)?\b|autob[úu]s(es)?|maquinaria pesada|(retro)?excavadora(s)?|gr[úu]a(s)?|camioneta(s)?|pick\s?-?up(s)?|\bsuv(s)?\b|furgoneta(s)?/i],
];

/**
 * Real false positives (2026-09-05): bare "puerto"/"puertos"/"puente(s)"
 * (used here and in relevance.ts's MAJOR_PROJECT_KEYWORDS/
 * FLAGSHIP_INDUSTRY_KEYWORDS to mean "seaport"/"bridge") also match
 * Colombian place names that happen to start with those words — common
 * naming patterns with nothing to do with building a port or a bridge.
 * Three real, confirmed examples: "...PARA LA CONSTRUCCIÓN DEL PROYECTO DE
 * LA NUEVA SEDE DEL SENA EN PUERTO BOYACÁ" (a SENA campus building; "Puerto
 * Boyacá" is just the city), "...PARA EL RESGUARDO INDÍGENA TURPIAL UMAPO
 * DEL MUNICIPIO DE PUERTO LÓPEZ" (an indigenous-reservation fund, nothing
 * about a port), and "...EN EL SECTOR EL LLANO PUENTE OSPINA DEL MUNICIPIO
 * DE CACHIRA" (a paving project in a neighborhood/sector called "Puente
 * Ospina", not an actual bridge). Real Colombian titles are routinely
 * written in ALL CAPS, so capitalization can't distinguish a genuine
 * seaport/bridge mention from a place name the way it might in mixed-case
 * text — the only reliable fix is naming the confirmed place names
 * explicitly, same "confirmed real, not guessed" bar as every other pattern
 * in this file. Add more such place names here as they're found for real,
 * rather than guessing the full list. Exported so relevance.ts's own
 * haystack (a separate string built from the same title/summary) gets the
 * identical treatment before its bare "puerto"/"puente" checks.
 */
export function stripKnownFalsePositivePlaceNames(text: string): string {
  return text.replace(
    // Colombia (found earlier).
    /puerto (boyac[áa]|l[óo]pez)\b|puente ospina\b/gi,
    "",
  ).replace(
    // Mexico (2026-09-07, all four confirmed in a real kept export where
    // MAJOR_PROJECT_KEYWORDS' bare "puerto" had kept nine tenders — a beach,
    // an avenue and a municipality among them, none of them a port):
    //   "PRESERVACION INTEGRAL DEL ACCESO A PLAYA PUERTO MARQUES"
    //   "PAVIMENTACION … EN AVENIDA FELIPE CARRILLO PUERTO"
    //   "RECONSTRUCCIÓN DEL TEMPLO … SAN MIGUEL DEL PUERTO"
    /felipe carrillo puerto\b|puerto marqu[ée]s\b|san miguel del puerto\b/gi,
    "",
  ).replace(
    // Mexico (2026-09-08), both confirmed in the 212-row kept export the
    // user reviewed. "Puerto Rico" is a village in Municipio Carmen,
    // Campeche, and it was the single most expensive miss in that export:
    // two street-paving jobs there
    //   "PAV CAM LA ANTORCHA - PUERTO RICO, LOCALIDAD PUERTO RICO"
    //   "PAV DIVERSAS CALLES EN LA LOCALIDAD DE PUERTO RICO"
    // came out FLAGSHIP — the top tier — on the strength of the village's
    // name alone. Rename the village and both are excluded, which is what
    // paving a locality's streets should be. "Puerto Peñasco" (Sonora)
    // appeared in the same export on a water-treatment plant that is
    // flagship on its own merits ("CONSTRUCCIÓN PLANTA DE TRATAMIENTO…"),
    // so stripping it changes nothing today — it is listed because the next
    // Puerto Peñasco tender will not necessarily carry that other signal.
    /puerto rico\b|puerto pe[ñn]asco\b/gi,
    "",
  ).replace(
    // "REHABILITACION DE LINEA DE AGUA POTABLE EN CALLE 16 ENTRE CALLE 9 Y
    // GASODUCTO" — Gasoducto is the name of the cross street, and it was
    // matching the oleoducto/gasoducto major-project pattern. Anchored on
    // the street phrasing so a real gas pipeline still matches.
    /\b(?:calle|avenida|av\.?|entre)\b[^.,;]{0,40}\bgasoducto\b/gi,
    "",
  );
}

/** Matches against real Spanish-language text (title/description, plus any real category field a source provides) — never guesses from a buyer name alone. Falls back to ["general"] rather than an empty array, so every tender has at least one tag to display/filter by. */
export function classifyIndustries(...texts: (string | undefined)[]): IndustryKey[] {
  const haystack = stripKnownFalsePositivePlaceNames(texts.filter(Boolean).join(" "));
  const matched = INDUSTRY_KEYWORDS.filter(([, pattern]) => pattern.test(haystack)).map(([key]) => key);
  return matched.length > 0 ? matched : ["general"];
}
