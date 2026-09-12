import type { LocalizedText, Tender, TenderRelevance, TenderScopeType } from "@/types/tender";
import { convertToUsd } from "@/lib/currency";
import { classifyIndustries, stripKnownFalsePositivePlaceNames } from "@/lib/industry";

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
  // Bare "software" as the thing being bought. The patterns above all
  // require the word "licencia"/"suscripción" next to it, so
  // "ADQUISICIÓN DE SOFTWARE ESPECIALIZADO" went through untouched.
  // Anchored on the purchase verb so a major project that merely INCLUDES
  // software (a videovigilancia or SCADA build) is not caught by the word
  // appearing anywhere in its scope — and those carry an
  // INCLUDE_OVERRIDE_KEYWORDS anchor that bypasses this list anyway.
  /(adquisici[óo]n|compra|suministro|contrataci[óo]n) de software/i,
  /combustible para (el parque vehicular|veh[íi]culos)|suministro de gasolina y di[ée]sel/i,
  // Real title (2026-09-04): "ADQUISICIÓN DE COMBUSTIBLES Y LUBRICANTES
  // PARA VEHÍCULOS Y EQUIPOS TERRESTRES" — fuel/lubricant purchase, not a
  // vehicle purchase, but "vehículos" appearing as a "para X" trailing
  // modifier let it slip through the vehicle-purchase whitelist pattern's
  // old, looser gap (see FLAGSHIP_INDUSTRY_KEYWORDS below, now tightened) —
  // added here too as an explicit, narrower belt-and-suspenders pattern,
  // same posture as the "combustible para..." line right above it.
  /combustibles? y lubricantes? para veh[íi]culos/i,
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
  /apoyo log[íi]stico|servicios? log[íi]sticos?|operador log[íi]stico/i, // SERVICIO INTEGRAL Y APOYO LOGÍSTICO PARA EL DESARROLLO DE ASAMBLEAS INFORMATIVAS — event logistics support; widened (2026-09-05) for plural "servicios logísticos" and "operador logístico" phrasing real titles use
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
  // Real titles (2026-09-04): "SERVICIOS MEDICO DE HEMODIALISIS SUBROGADA"
  // and "SERVICIO DE HEMODIÁLISIS EXTRAMUROS" — outsourced/off-site
  // hemodiálisis SERVICE contracts, not equipment purchases, but word
  // order ("servicio(s) ... de hemodialisis ... subrogada", "subrogada"/
  // "extramuros" separated from "servicio" by "de hemodiálisis") didn't
  // match the "servicio médico subrogado" pattern right above, and would
  // otherwise hit the bare "hemodiálisis" FLAGSHIP_INDUSTRY_KEYWORDS match.
  /servicio(s)? (m[ée]dico )?de hemodi[áa]lisis|hemodi[áa]lisis (subrogada|extramuros)/i,
  // Real title (2026-09-04): "ADQUISICIÓN Y/O SUMINISTRO DE INSUMOS PARA
  // EL SERVICIO DE HEMODINAMIA, 2026" — consumables ("insumos") for the
  // hemodiálisis/hemodinamia SERVICE, not equipment — same class of bug as
  // osteosíntesis/reactivo/medicamento above, just for this specific
  // procedure. A genuine "equipo de hemodinamia" purchase still isn't
  // touched (no "insumos... servicio de" framing).
  /insumos? (para|de) (el )?servicio de (hemodi[áa]lisis|hemodinamia)/i,
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
  //
  // Batch #3 (2026-09-02): a ~200-row real exclusion-review list the user
  // built by hand from the live site, grouped under their own reason
  // labels — provided as a "reduce kept count further" reference
  // alongside the value/major-project tightening above. Each pattern
  // below is scoped to a real title from that list; comments carry the
  // user's own Chinese reason label for traceability.
  /rehabilitaci[óo]n (de )?pozo(s)?\b|rehabilitaci[óo]n del pozo\b|equipamiento (de|con) pozo(s)? profundo|perforaci[óo]n y aforo de pozo/i, // 只聚焦一个区的小工程 — single-well rehab/equipping, small localized works
  /caseta(s)? de desinfecci[óo]n/i, // 只聚焦一个区的小工程 — single-tank disinfection booths
  /\bsupervisi[óo]n\b.{0,60}(construcci[óo]n|obra|puente|ferrocarril|carretera|paso superior)/i, // 只是监理 — inspection/oversight only, not the actual works contract
  // "mantenimiento" (maintenance) moved out to its own unconditional
  // MAINTENANCE_ONLY_KEYWORDS check below (2026-09-04) — see that
  // constant's header comment for why this one specific signal is no
  // longer gated by hasIncludeOverride/MAJOR_PROJECT_KEYWORDS the way
  // every other EXCLUDE_KEYWORDS entry still is.
  /suministro (de )?(partes|herramientas)\b|adquisici[óo]n de (herramientas|refacciones)\b|refacciones, accesorios y herramientas|materiales? y art[íi]culos? de/i, // 物料/工具、物料 — spare parts, tools, consumable materials, not equipment/works
  /servicio m[ée]dico integral/i,

  // ---- 2026-09-07: a 400-row review by the user, grouped by what the
  // work actually is. Every pattern below comes from at least one real
  // title they marked as "should have been excluded". ----

  // Municipal water and sewer networks live in WATER_NETWORK_KEYWORDS, not in
  // this array — like the municipal amenities below, they are an exclusion
  // class with a value exception. See its header comment.

  // Small community and school buildings.
  /techumbre|techado\b|m[óo]dulo sanitario|\baulas?\b|sal[óo]n de usos m[úu]ltiples|cancha\b|polideportivo/i,
  /bardeado perimetral|centro de desarrollo comunitario|cuartos? dormitorio|albergue|centro de resguardo temporal|caseta\b|invernadero/i,

  // Religious buildings — all of them, per the user: 全部TEMPLO 和IGLESIA
  // 和PARROQUIA 宗教相关都不要.
  /\btemplo\b|\biglesia\b|\bparroquia\b|\bcapilla\b|\bconvento\b|bas[íi]lica|santuario/i,

  // Health SERVICE delivery and medical consumables, as opposed to
  // equipment. hemodinamia/hemodiálisis moved here off the whitelist.
  /hemodi[áa]lisis|hemodinamia|servicios? m[ée]dicos? de especializaci[óo]n|servicio(s)? auxiliares|subrogaci[óo]n de servicios/i,
  /insumos y refacciones|consumibles para|insumos de laboratorio/i,

  // Repair, refurbishment and upkeep of what already exists.
  /obras de reparaci[óo]n y rehabilitaci[óo]n|conservaci[óo]n de la malla vial|muro de contenci[óo]n|canal pluvial|obras diversas|art[íi]culos met[áa]licos/i,

  // Colombian one-offs the user confirmed, each narrow on purpose.
  /interventor[íi]a|envase de vidrio|helic[óo]ptero|inhibidor de se[ñn]al|pintura termopl[áa]stica/i,
  /postes? de concreto|red el[ée]ctrica rural/i,
  /equipos de c[óo]mputo y perif[ée]ricos|soluci[óo]n integral para diferentes l[íi]neas|acciones t[ée]cnicas|obra de emergencia|alimentaci[óo]n complementaria|ollas comunitarias/i,
  /compra de torre\b|tuber[íi]as del hogar/i,
  // Back-office and logistics services, all real 2026-09-07 titles kept by
  // a value above the significant floor: supporting a procurement PROCESS,
  // housing and feeding staff, hauling freight.
  /servicio de soporte para el proceso|alojamiento y alimentaci[óo]n|transporte terrestre de carga/i,
  // A programme name with no procurement object at all — "FORTALECIMIENTO
  // DEL CONTROL TERRITORIAL", "FORTALECIMIENTO INSTITUCIONAL". Anchored on
  // the two abstract objects seen, so "fortalecimiento de los servicios de
  // hemodinamia" (real hospital equipment) is untouched.
  /fortalecimiento (?:del control territorial|institucional)\b/i,
  // Refurbishing existing public buildings and sports grounds, as opposed
  // to building them: "MEJORAMIENTO Y ADECUACION A INSTITUCIONES
  // EDUCATIVAS", "ADECUACIÓN Y MEJORAMIENTO DE LA INFRAESTRUCTURA DE LOS
  // ESCENARIOS DEPORTIVOS Y RECREATIVOS".
  /mejoramiento y adecuaci[óo]n|adecuaci[óo]n y mejoramiento|escenarios deportivos/i,
  // Health SERVICE delivery, as opposed to the medical EQUIPMENT this
  // platform targets ("我们只做医疗设备"). "PRESTACIÓN INTEGRAL DE SERVICIOS
  // DE SALUD EN ONCOLOGÍA" (2026-09-07, user-confirmed) survived on its
  // healthcare industry tag alone, since the equipment whitelist correctly
  // didn't match it and nothing else dropped it.
  // The bare "servicios de salud en" half was removed 2026-09-11. Peru's
  // Invierte.pe names EVERY public investment "MEJORAMIENTO / CREACIÓN /
  // AMPLIACIÓN DEL SERVICIO DE <the public service being improved>", so a
  // hospital BUILDING project is titled "MEJORAMIENTO Y AMPLIACION DE LOS
  // SERVICIOS DE SALUD EN EL HOSPITAL II-E ..." — a real $91.1M OxI works
  // contract that this pattern was excluding as outsourced health staffing.
  // What the rule is actually after is service DELIVERY being contracted out,
  // so it now requires that framing explicitly instead of the bare noun.
  /(?:prestaci[óo]n|contrataci[óo]n|tercerizaci[óo]n)\s+(?:integral\s+)?de\s+servicios?\s+de\s+salud\b/i,
  // "construcción" of a document, not of anything physical. "CONTRATAR LA
  // CONSTRUCCION Y SOCIALIZACION DEL ANÁLISIS DE SITUACIÓN DE SALUD 2026"
  // (2026-09-07, user-confirmed) matched FLAGSHIP_INDUSTRY_KEYWORDS' bare
  // "construcción" — a public-health study, produced with "metodologías
  // cualitativas de participación social". Excluded here, which runs
  // before that whitelist is even computed.
  /construcci[óo]n (y \w+aci[óo]n )?del? (an[áa]lisis|documento|plan\b|estudio|diagn[óo]stico)|an[áa]lisis de situaci[óo]n de salud/i, // 不参加医疗的Servicio Integral — outsourced integrated medical service
  /destrucci[óo]n y disposici[óo]n final|disposici[óo]n final de residuos|destrucci[óo]n de insumos/i, // 废料处理 — waste destruction/disposal
  /medici[óo]n de caudales/i, // 测量项目 — small flow-measurement project
  /barda(s)? perimetral(es)?/i, // 围栏 — perimeter wall/fence construction
  /im[áa]genes de sat[ée]lite/i, // 卫星 — satellite imagery subscription service
  /rehabilitaci[óo]n de filtros|suministro de filtros/i, // FILTROS修复/滤芯 — filter media repair/cartridge supply
  /obras? civiles? menores/i, // 小型工程 — explicitly "minor civil works"
  /neum[áa]ticos? para veh[íi]culos/i, // 车子轮胎 — tires
  /arrendamiento de (domo|stands|conexiones|equipo|mobiliario|plataforma)/i, // 租赁服务 — venue/equipment rental
  /simulador(es)? de (operaciones de perforaci[óo]n|entrenamiento)/i, // 模拟器 — training simulator refurbishment
  /curso(s)? de actualizaci[óo]n/i, // 更新服务 — training/refresher courses
  /servicios profesionales para la elaboraci[óo]n del aval[úu]o/i, // 专业类服务 — property appraisal professional services
  /\ban[áa]lisis (satelital|petrof[íi]sicos?|de aguas|de laboratorio|geol[óo]gicos?|de fluidos|metoce[áa]nicos?)\b|servicio(s)? de an[áa]lisis\b|monitoreo (local y remoto|de la calidad)/i, // 分析服务/分析设备 — analysis/monitoring services, not equipment or works
  // Bare "ducto(s)" — generic internal facility piping/conduit work (real
  // PEMEX examples: "construcción de ductos y líneas de descarga",
  // "sustitución de líneas de descarga... con tubería no metálica").
  // Deliberately NOT the same signal as the "oleoducto/gasoducto/
  // poliducto" long-distance transport pipeline in MAJOR_PROJECT_KEYWORDS
  // below — \bductos?\b never matches inside those compound words (no
  // word boundary between "oleo"/"gas"/"poli" and "ducto"), confirmed
  // against all three. Added (2026-09-02) after the user's narrowed
  // 13-title "keep as significant" whitelist deliberately excluded 5 real
  // PEMEX pipeline/ductos titles they'd included in an earlier, broader
  // version of the same list — this is what actually differentiates them
  // from the kept water-treatment-plant/building/highway/railway
  // construction titles, which all reach FLAGSHIP_INDUSTRY_KEYWORDS via
  // "construcción" but don't also mention "ducto(s)".
  /\bductos?\b/i,
  // Same PEMEX-drop batch, real titles that didn't happen to say "ducto"
  // but are the same category of internal upstream E&P facility
  // maintenance/infrastructure work (as opposed to the actual long-haul
  // pipeline construction/EPC that oleoducto/gasoducto/poliducto and
  // "ductos" above already catch): "líneas de descarga" (discharge
  // lines) and "infraestructuras complementarias" (complementary
  // facility infrastructure) — both from the same 5-title PEMEX group
  // the user's narrowed whitelist dropped.
  /l[íi]neas? de descarga/i,
  /infraestructuras? complementarias?/i,

  // Batch #4 (2026-09-04): a real annotated review of live browse-page
  // results the user marked up directly on screenshots (real titles +
  // buyers, each with the user's own Chinese reason). Same posture as
  // batch #3 above — each pattern scoped to the real title, comment
  // carries the user's reason for traceability.
  /material(es)? el[ée]ctrico(s)?/i, // 材料项目 — ADQUISICIÓN DE MATERIAL ELÉCTRICO PARA LA INFRAESTRUCTURA HOSPITALARIA, a materials purchase, not equipment
  /material(es)? de construcci[óo]n/i, // 建筑材料 — ADQUISICIÓN DE MATERIAL DE CONSTRUCCIÓN PARA CAMPAMENTOS DE CONSERVACIÓN..., raw materials, not a works contract
  /\bmicrosectores?\b/i, // 小项目 — CONSTRUCCIÓN DE 20 MICROSECTORES, small distributed local works
  // "servicio m[ée]dico subrogado" above required the full word "médico" —
  // real gap found here: "SERVICIO MED SUBROGADO TOMOGRAFIA PET" abbreviates
  // it "MED", which that pattern never matched.
  /servicio (m[ée]d\.?|m[ée]dico)?\s*subrogado/i, // 医疗服务 — SERVICIO MED SUBROGADO TOMOGRAFIA PET (3ER VUELTA)
  /equipamiento (electromec[áa]nico )?de \d+ pozo(s)?/i, // 小项目 — EQUIPAMIENTO ELECTROMECÁNICO DE 2 POZOS DE AGUA POTABLE, a 1-2 well job
  /consumibles para equipo m[ée]dico/i, // 医疗消耗品 — ADQUISICIÓN DE CONSUMIBLES PARA EQUIPO MEDICO CON PRESTAMO DE EQUIPO
  // Real gap: "puente"/"carretera" bare mentions in MAJOR_PROJECT_KEYWORDS/
  // FLAGSHIP_INDUSTRY_KEYWORDS promote regardless of whether the work is
  // NEW construction or just routine upkeep — these two real titles are
  // maintenance framed with a bridge/highway noun, not new works.
  /conservaci[óo]n peri[óo]dica|trabajos de conservaci[óo]n/i, // 长期维护/道路维护 — CONSERVACIÓN PERIÓDICA DE PUENTES DE LA RED FEDERAL...; TRABAJOS DE CONSERVACIÓN EN LA CARRETERA
  /determinaci[óo]n del an[áa]lisis t[ée]cnico/i, // 咨询服务 — DETERMINACIÓN DEL ANÁLISIS TÉCNICO Y CONSTRUCCIÓN, EN EL ESTADO DE TLAXCALA — a technical study/determination, not the works contract itself despite "construcción" appearing in the same title
  /\bcolector(es)?\b.{0,50}en la localidad de/i, // 单区域小项目 — CONSTRUCCIÓN DE COLECTOR ORIENTE EN LA LOCALIDAD DE NUEVA ITALIA DE RUÍZ — one small locality's drainage collector

  // Batch #5 (2026-09-05): a real ~47-title Colombia SECOP II review the
  // user marked up by hand ("以下应排除"), each with the user's own Chinese
  // reason label — same posture as batches #3/#4 above. Grouped by theme;
  // each pattern scoped to the real title(s)/summary text it's meant to
  // catch, comment carries the user's reason plus a title fragment for
  // traceability.
  //
  // Outsourced/capitated health-SERVICE contracts (医疗服务/医疗类服务) —
  // Colombia's public-health-insurance model routes a lot of routine
  // medical-service delivery through third-party providers; none of this
  // is an equipment purchase.
  /prestar servicios? (integral(es)? )?de salud|prestaci[óo]n de (los )?servicios? (m[ée]dicos?|de salud|especializados? de)/i, // E.S.E. HOSPITAL SAN RAFAEL GIRARDOTA (servicios integrales de salud...); PRESTACIÓN DE SERVICIO MEDICOS EN EL MUNICIPIO DE TIBU
  /modalidad c[áa]pita|r[ée]gimen subsidiado|subsistema de salud de la polic[íi]a nacional/i, // capitation/subsidized-regime/police-health-subsystem contracts — E.S.E. HOSPITAL SAN RAFAEL GIRARDOTA; REUMATOLOGIA DECOR; gastroenterologia chocó
  /especializados y subespecializados en/i, // ESPECIALIZADOS Y SUBESPECIALIZADOS EN CARDIOLOGÍA; CIRUGÍA CARDIOVASCULAR...
  /consulta m[ée]dica (general )?intramural|intramural y extramural/i, // bundled outpatient-service contracts — PRESTACIÓN DE SERVICIOS (consulta médica general intramural y extramural...)
  /servicio de dosimetr[íi]a/i, // SERVICIO DE DOSIMETRIA PARA EL PERSONAL — a personnel radiation-monitoring SERVICE, not equipment
  /servicio de aseo\b|aseo a todo costo/i, // 清洁服务 — PRESTACIÓN DEL SERVICIO DE ASEO A TODO COSTO — cleaning service (existing "artículos/insumos de aseo" pattern only covers aseo SUPPLIES, not the service itself)

  // Routine materiel/consumables purchases (物料/化学品采购/指定采购)
  /\bmunici[óo]n(es)?\b/i, // ADQUISICIÓN DE MUNICIÓN CALIBRE 12.7 X 99 MM — ammunition
  /insumos qu[íi]micos\b/i, // 化学品采购 — COMPRA DE INSUMOS QUÍMICOS PARA EL ICPET DE ECOPETROL — lab/research chemical supplies, not equipment
  /mortero de [áa]gata/i, // 指定采购 — COMPRA DE MORTERO DE ÁGATA DEL MOLINO RM200 — a small lab-instrument consumable/accessory

  // Interventoría/oversight-only contracts (监理服务) — same class as the
  // existing "supervisión ... construcción/obra" pattern above but not
  // anchored to a works keyword, since these interventoría titles cover an
  // EQUIPMENT acquisition contract, not works.
  /interventor[íi]a integral/i, // CONTRATAR LA INTERVENTORÍA INTEGRAL PARA EL CONTRATO DE ADQUISICIÓN DE CÁMARAS...; INTERVENTORÍA INTEGRAL PARA LA CONSTRUCCIÓN DE LAS OBRAS DEL PARQUE...

  // Real-estate leasing/purchase (租赁/办公室采购) — a lease or a property
  // purchase is neither an equipment purchase nor a works contract.
  /arrendamiento de(l)? (un |la |el )?(inmueble(s)?|espacio (f[íi]sico)?|oficina(s)?|bien inmueble)/i, // EVENTO DE COTIZACIÓN PARA EL ARRENDAMIENTO DE INMUEBLE...; LA ENTREGA A TÍTULO DE ARRENDAMIENTO DE UN ESPACIO FÍSICO...; CONTRATO DE ARRENDAMIENTO DEL BIEN INMUEBLE...; Contratar el arrendamiento de oficinas...
  /\bllantas?\b/i, // 轮胎 — COTIZACION - LLANTAS GENERAL Y SERVICIOS — tires, colloquial term (existing "neumáticos" pattern doesn't cover this word)
  /pasajes terrestres|pasajes a[ée]reos/i, // 交通费 — SUMINISTRO DE PASAJES TERRESTRES POR NECESIDAD DE DESPLAZAMIENTO A CITAS MÉDICAS — travel-ticket reimbursement
  /v[áa]lvulas? mec[áa]nicas?/i, // 物料 — SUMINISTRO DE VÁLVULAS MECÁNICAS Y ACCESORIOS DE TUBERIA — pipe-fitting materials, not equipment
  /centros de vida\b|atenci[óo]n integral a los adultos mayores/i, // APOYO TÉCNICO; ADMINISTRATIVO Y ECONÓMICO A LOS CENTROS DE VIDA DEL DEPARTAMENTO DE CÓRDOBA PARA LA ATENCIÓN INTEGRAL A LOS ADULTOS MAYORES — elderly day-care social program funding
  /acciones de educaci[óo]n ambiental/i, // 学习服务 — PP- acciones de educación ambiental en comunas y corregimientos del Distrito de Medellín (Contrato interadministrativo) — an environmental-education program, not equipment/works despite the long, content-bearing interadministrativo title
  /compraventa de inmueble(s)?|adquirir mediante compraventa (los |el )?inmueble(s)?|compraventa (de )?oficina(s)?/i, // JOSE GABRIEL GONZALEZ MARIÑO (adquirir mediante compraventa los inmuebles...); COMPRAVENTA OFICINA 2101...
  /\bcomodato\b/i, // COMODATO ENTRE EL MUNICIPIO DE FUSAGASUGÁ... SOBRE UN VEHÍCULO — a free loan-for-use grant between two government entities, not a purchase

  // Inter-institutional cooperation agreements (顾问服务/社区服务/学习类服务) —
  // "aunar esfuerzos" ("join efforts") is a Colombian legal instrument for
  // administrative/financial cooperation between entities, same class as
  // "convenio/contrato interadministrativo" and "mandato sin representación"
  // above — never a real goods/works/services opportunity for an external
  // bidder, regardless of the (often substantial) funds involved. Real
  // batch: 5 separate titles/summaries this session, all this exact phrase.
  /\baunar esfuerzos\b/i,
  /^convenio\b.{0,60}\buniversidad\b/i, // CONVENIO UNIVERSIDAD PUBLICA DE NAVARRA Y UDENAR — inter-university academic-cooperation agreement, same "no real content" class as isBareInteradministrativeTitle
  /articulaci[óo]n con la educaci[óo]n media|formaci[óo]n del talento humano/i, // Docencia Servicio Foscal 2026 (SENA workforce-training articulation program)
  /formaci[óo]n y desarrollo de estrategias acad[ée]micas/i, // FORMACIÓN Y DESARROLLO DE ESTRATEGIAS ACADÉMICAS NECESARIAS PARA LA OPERACIÓN Y MOVIMIENTO DE LOS BUSES EN LAS LÍNEAS COMERCIALES, PATIOS Y TALLERES — bus-operator staff training/curriculum design, same "no real goods/works content" class as the SENA line above, not an actual bus/transit infrastructure procurement
  /contrato de empr[ée]stito/i, // EP 0057-2026 (CONTRATO DE EMPRÉSTITO Y PIGNORACIÓN...) — real gap: the existing bare "^empréstito" pattern is anchored to the START of the whole title+summary haystack, which a real title/reference-number prefix (here "EP 0057-2026") pushes past

  // Staffing/branded-giveaway/small-event items (人力/一般用品)
  /dotaci[óo]n personal|suministro de dotaci[óo]n/i, // CONTRATATO DE SUMINISTRO DE DOTACIÓN PERSONAL — staff workwear/kit bundle, same class as "uniformes"
  /personal operativo y administrativo/i, // 人力 — LICITACIÓN PÚBLICA PERSONAL OPERATIVO Y ADMINISTRATIVO DE LOS ESTABLECIMIENTOS EDUCATIVOS DE PEREIRA
  /asistentes del .{0,10}congreso de docencia|reconocimiento a ganadores/i, // branded congress giveaways/awards — ADQUISICIÓN DE 270 SOMBRILLAS/TERMOS PERSONALES...PARA SER ENTREGADOS A LOS ASISTENTES DEL IV CONGRESO DE DOCENCIA; ADQUISICIÓN DE ELEMENTOS PARA REALIZAR RECONOCIMIENTO A GANADORES...
  /elementos de papeler[íi]a|[úu]tiles de escritorio/i, // 一般用品 — SUMINISTRO DE ELEMENTOS DE PAPELERÍA; ÚTILES DE ESCRITORIO Y OFICINA — real gap: existing office-supplies pattern requires "papelería DE OFICINA" as one phrase, doesn't match "elementos de papelería" on its own
  /elementos erg[oó]n[oó]micos/i, // Adquisición de elementos ergonómicos — small office-furniture accessories
  /alumbrado navide[ñn]o/i, // alumbrado navideño 2026 — Christmas lighting decor
  /programa de alimentaci[óo]n escolar|\bpae\b.{0,20}(alimentaci[óo]n|escolar)/i, // PAE 2026 II — Colombia's national school-meal program, a recurring catering/food-service contract

  // Miscellaneous services/records (服务类)
  /administraci[óo]n del archivo|archivo de gesti[óo]n|centro de documentaci[óo]n/i, // PRESTAR LOS SERVICIOS PARA LA ADMINISTRACIÓN DEL ARCHIVO DE GESTIÓN Y ARCHIVO CENTRAL, CENTRO DE DOCUMENTACIÓN...
  /recipientes a presi[óo]n/i, // SERVICIO DE REPARACION EN RECIPIENTES A PRESION CON SOLDADURA ESPECIALIZADA — a repair SERVICE, not equipment/works
  /actualizaci[óo]n y modernizaci[óo]n de la plataforma/i, // servicios de soporte; actualización y modernización de la plataforma Broadcom CA Service Management — an ongoing IT platform support/upgrade SERVICE, not equipment
  /combustible.{0,30}flota de (buses|autobuses)/i, // Suministro y compresión del combustible requerido para la flota de buses a gas — real gap: existing combustible patterns only cover "vehículos" phrasing, not "flota de buses"
  /mobiliario escolar/i, // DOTACIÓN DE HERRAMIENTAS TECNOLÓGICAS; MOBILIARIO ESCOLAR... — single-school furniture/equipment bundle
  /^asociaci[óo]n de recicladores/i, // ASOCIACION DE RECICLADORES Y FAMI-BODEGAS DEL SUR (ASOBOSUR) — an association's own name as the record's title, not a description of a procurement, same "not a real tender" class as the labor-union pattern above

  // Batch #6 (2026-09-05): a second real ~45-title Colombia SECOP review,
  // same posture as batch #5 above — each pattern scoped to the real
  // title(s)/summary text it targets.
  //
  // Real-estate leasing, verb form — batch #5's "arrendamiento de..."
  // pattern only covers the NOUN form; these use the VERB "arrendar"
  // directly ("Arrendar a todo costo un inmueble...", "Arrendar el
  // inmueble ubicado en...").
  /arrendar (a todo costo )?(el |un )?inmueble/i,
  // Military/institutional routine materiel (军需物资/原材料采购)
  /material de intendencia/i, // ADQUISICION DE MATERIAL DE INTENDENCIA (PRODUCTO TERMINADO) — military quartermaster supplies
  /materia prima para la fabricaci[óo]n de (medallas|monedas|distintivos|escudos|insignias)/i, // ADQUISICIÓN DE MATERIA PRIMA PARA LA FABRICACIÓN DE MEDALLAS; MONEDAS; DISTINTIVOS; ESCUDOS E INSIGNIAS MILITARES
  /agencia de viajes|tiquetes a[ée]reos/i, // Suministro de servicios de agencia de viajes para compra de tiquetes aéreos
  /m[ée]dicos generales\b/i, // PRESTAR APOYO EN LA EJECUCIÓN DEL PROCESO DE MEDICOS GENERALES — general-practitioner staffing, same outsourced-health-service class as the other médico patterns above
  /sal para (las )?plantas de tratamiento de agua/i, // SUMINISTRAR SAL PARA LAS PLANTAS DE TRATAMIENTO DE AGUA POTABLE — routine water-treatment consumable
  // Colombian outsourced clinical-service contracting, a recurring phrase
  // this batch made clear is its own strong signal independent of "de
  // salud" (batch #5's pattern requires that exact phrase right after
  // "servicios") — "procesos (y subprocesos) asistenciales" is the
  // standard term Colombian health entities use for clinical-care
  // service-outsourcing contracts.
  /procesos? (y subprocesos )?asistenciales/i,
  /procesos de especialidades m[ée]dicas/i, // CONTRATAR LA EJECUCIÓN DE LOS PROCESOS DE ESPECIALIDADES MÉDICAS; UCI Y PROFESIONALES DE LA SALUD
  /servicios? profesionales de enfermer[íi]a|atenci[óo]n integral de pacientes/i, // PRESTACION DE SERVICIOS PROFESIONALES DE ENFERMERIA PARA LA ATENCION INTEGRAL DE PACIENTES
  /equipos? b[áa]sicos? de salud/i, // "EBSE" (Equipos Básicos de Salud Especializados) — a recurring Colombian primary-care staffing program, e.g. PRESTAR SERVICIOS PROFESIONALES COMO MÉDICO PEDIATRA... EN EL MARCO DE LOS EQUIPOS BÁSICOS DE SALUD ESPECIALIZADOS
  /obtenci[óo]n y mejoramiento en las condiciones de trabajo/i, // OBTENCION Y MEJORAMIENTO EN LAS CONDICIONES DE TRABAJO PARA LA PRESTACION DE SERVICIOS Y/O EJECUCION DE OBRAS — a vague administrative/labor-conditions contract, not a real goods/works/services opportunity
  /aval[úu]os? comerciales?/i, // AVALÚOS COMERCIALES — real-estate appraisal, broader phrasing than the existing "servicios profesionales para la elaboración del avalúo" pattern
  /elementos de construcci[óo]n/i, // ELEMENTOS DE CONSTRUCCION — real gap: existing "material(es) de construcción" pattern doesn't cover "elementos" phrasing
  /p[óo]lizas? de seguros?|programa de seguros/i, // ADQUISICIÓN PÓLIZAS PARA EL PROGRAMA DE SEGUROS DE LA POLICÍA NACIONAL; Adquirir el programa de seguros...
  /contrato colectivo sindical/i, // CONTRATO COLECTIVO SINDICAL PARA EL DESARROLLO DE ACTIVIDADES... — a labor-union collective agreement, same "not a real tender" class as the bare "^sindicato" pattern above
  /licencias? office\b/i, // CONTRATAR LA ADQUISICIÓN LICENCIAS OFFICE Y DE EQUIPOS TECNOLÓGICOS — Microsoft Office license purchase, a routine SaaS license
  /dotaci[óo]n de bienes muebles/i, // Suministrar la dotación de bienes muebles para el funcionamiento... equipamientos culturales — furniture
  /transporte terrestre de personas en buses|busetas y microbuses/i, // Prestación del servicio de transporte terrestre de personas en buses; busetas y microbuses
  /alquiler de (horas de )?maquinaria( amarilla)?/i, // SERVICIO DE ALQUILER DE HORAS DE MAQUINARIA AMARILLA Y VOLQUETAS — heavy-equipment rental by the hour
  /\binterventor[íi]a\b/i, // Broadened from the batch #5 "interventoría integral" pattern — real gap: "INTERVENTORÍA TÉCNICA; ADMINISTRATIVA; FINANCIERA Y SOCIOAMBIENTAL" uses different adjectives; any interventoría/oversight-only contract is the same "not the actual procurement" class regardless of which adjectives modify it
  /^corporaci[óo]n integral de servicios/i, // CORPORACION INTEGRAL DE SERVICIOS Y ASESORIAS CORPOINSA — a company's own name as the record's title, same class as the association/union/sindicato patterns above
  /resguardo ind[íi]gena|sistema general de participaciones/i, // ADMINISTRACIÓN DE LOS RECURSOS DE LA ASIGNACIÓN ESPECIAL DEL SISTEMA GENERAL DE PARTICIPACIONES PARA EL RESGUARDO INDÍGENA — a government fund-administration contract, not real goods/works/services procurement
  /licencia de uso por suscripci[óo]n/i, // ADQUISICIÓN DE LICENCIA DE USO POR SUSCRIPCIÓN — a SaaS subscription license, broader phrasing than the existing "licencia(s) de software" pattern
  /insumos de impresi[óòo]n/i, // ADQUIRIR INSUMOS DE IMPRESIÒN CON DESTINO A LAS DEPENDENCIAS DE LA FISCALÍA — printing consumables; grave-accent "Ò" kept as a real encoding variant seen in this exact source row, not a typo to normalize away
  /renovaci[óo]n del licenciamiento|licenciamiento,? suscripci[óo]n y soporte/i, // CONTRATAR LA RENOVACIÓN DEL LICENCIAMIENTO; SUSCRIPCIÓN Y SOPORTE DE LA INFRAESTRUCTURA DE SEGURIDAD TRELLIX — real gap: existing licensing patterns require "licencia(s)"/"licenciamiento de software" exactly, not bare "licenciamiento"
  /alimentaci[óo]n escolar/i, // APOYO ALIMENTACIÓN ESCOLAR — broadened from the existing "programa de alimentación escolar" pattern, which requires the word "programa" to also be present
  /motores y repuestos/i, // LA ADQUISICION DE MOTORES Y REPUESTOS NUEVOS Y ORIGINALES MARCA MERCURY — spare parts, same class as the existing "refacciones" patterns but a different word
  /proceso de gesti[óo]n financiera/i, // PRESTAR SERVICIOS TECNICOS PARA EL PROCESO DE GESTION FINANCIERA DEL HOSPITAL — financial-management support service
  /jardines infantiles|primera infancia/i, // Prestación de servicios para el fortalecimiento de la atención en los Jardines Infantiles Buen Comienzo — early-childhood care program
  /aulas no convencionales|aula(s)? tipo contenedor/i, // Suministro; dotación y puesta en funcionamiento de aulas no convencionales tipo contenedor — small-scale container classrooms
  /estrategia (integral )?de promoci[óo]n.{0,20}tur[íi]stic[oa]|fortalecimiento tur[íi]stico/i, // IMPLEMENTACIÓN DE UNA ESTRATEGIA INTEGRAL DE PROMOCIÓN Y FORTALECIMIENTO TURÍSTICO DEL MUNICIPIO DE VALLEDUPAR — tourism-promotion program, not equipment/works
  /fiducoldex|administrador del patrimonio aut[óo]nomo/i, // FIDUCIARIA COLOMBIANA DE COMERCIO EXTERIOR S.A - FIDUCOLDEX ... ADMINISTRADOR DEL PATRIMONIO AUTONOMO — a trust/fiduciary fund-administration entity, not a real procurement opportunity
  // "CONSTRUCCION Y CONSULTORIAS DE OBRAS DE INGENIERÍA URBANISMO Y
  // ARQUITECTURA CONTINUAR S.A.S." (flagged "金额太小，不应该是重点项目", content
  // "No definido") — this reads as the AWARDED CONTRACTOR'S OWN COMPANY
  // NAME being used as the record's title (the "S.A.S." suffix is the
  // standard Colombian company-registration type, and the bare word
  // "construcción" only appears because it's a construction company's
  // name), same "not a description of a procurement" class as the
  // association/union/sindicato/corporación patterns above — not a real
  // "small construction project" the value-band logic should be judging at
  // all.
  /construccion y consultorias de obras de ingenier[íi]a urbanismo y arquitectura/i,

  // ---- 2026-09-08 review round. Every pattern below comes from a real
  // title the user marked "should have been excluded" in that round. ----

  // School buildings as the OBJECT of the work: "CONSTRUCCIÓN Y
  // REHABILITACION DE ESCUELAS" (many rows). Deliberately anchored on
  // "<verb> ... de (la|las) escuela(s)" rather than the bare word, because
  // "CONSTRUCCIÓN DE EDIFICIO ADMINISTRATIVO EN LA ESCUELA PREPARATORIA
  // NO. UNO" is on the user's confirmed KEEP list — that one is a real
  // building that merely sits at a school ("en la"), not a school build
  // ("de la"). Same is-vs-where distinction MAJOR_PROJECT_LOCATION_ONLY
  // draws for "colectores DE presa".
  //
  // Widened 2026-09-11 for Colombia, which says "institución educativa" (and
  // "colegio") where Mexico says "escuela", and frames the work as
  // "mejoras en infraestructura y dotación DE las instituciones educativas"
  // rather than "construcción de". Same is-vs-where anchor as before: the
  // school has to be what is being built or fitted out, not where the work
  // happens — "SISTEMAS DE ENERGÍA FOTOVOLTAICA EN INSTITUCIONES EDUCATIVAS"
  // stays in, because that is a solar installation that happens to sit at
  // schools.
  /(construcci[óo]n|rehabilitaci[óo]n|remodelaci[óo]n|ampliaci[óo]n|mejoramiento|mejoras?|dotaci[óo]n)[^.]{0,40}\bde\s+(las?\s+)?(escuelas?|colegios?|instituci[óo]n(?:es)?\s+educativas?)\b/i,

  // Specialist medical SERVICES (the doctors, not the hospital or its
  // equipment): "SERVICIOS DE MEDICINA ESPECIALIZADA EN NEUMOLOGÍA" (CO).
  // Sibling of the "prestación de servicios de salud" patterns above.
  /servicios? de medicina especializada|medicina especializada en\b/i,

  // Tax-culture / taxpayer-relations consulting programs: "PRESTAR
  // SERVICIOS ESPECIALIZADOS PARA EJECUTAR EL MODELO DE ATENCIÓN DE LA
  // SECRETARÍA DE HACIENDA DE BOGOTÁ; EN EL MARCO DE LA ESTRATEGIA DE
  // RELACIONAMIENTO Y CULTURA TRIBUTARIA" (CO). Anchored on the two
  // program-specific phrases, NOT on "modelo de atención" alone — that
  // phrase also appears in real health-infrastructure titles.
  /cultura tributaria|estrategia de relacionamiento\b/i,

  // Headsets and sound consumables for outreach activities: "ADQUIRIR
  // DIADEMAS E INSUMOS DE SONIDO PARA ACTIVIDADES ... EN MODALIDAD
  // EXTRAMURAL" (CO) — office/AV consumables, same class as the
  // "artículos de aseo" category phrases above.
  /\bdiademas?\b|insumos de sonido/i,

  // Consulting-hours and helpdesk contracts around an existing software
  // system: "Servicio de horas de consultoría para configuración y ajuste
  // ... soporte técnico y atención de incidentes al Sistema de Gestión
  // Documental Papi" (CO). Billed by the hour against software already in
  // production — not an equipment purchase and not a build.
  /horas de consultor[íi]a|soporte t[ée]cnico y atenci[óo]n de incidentes|sistema de gesti[óo]n documental/i,

  // Collective social-welfare programs: "CONTRATAR LA PRESTACION DE
  // SERVICIOS PARA EJECUTAR ACTIVIDADES E INTERVENCIONES COLECTIVAS
  // DIRIGIDO A PROMOVEER EL BIENESTAR INTEGRAL DE NIÑOS NIÑAS
  // ADOLESCENTES..." (CO). Social programs delivered by staff, no goods
  // or works involved.
  /intervenciones colectivas|bienestar integral de\b/i,

  // State liquor monopolies' own production plant: "IMPLEMENTACIÓN DE UN
  // SISTEMA INTEGRAL DE BOMBEO CENTRALIZADO Y RECUPERACIÓN DE PRODUCTO
  // PARA LAS LÍNEAS DE PRODUCTO DE LA FÁBRICA DE LICORES Y ALCOHOLES DE
  // ANTIOQUIA EICE" (CO). Anchored on the buyer/plant type, NOT on
  // "bombeo" — "CONSTRUCCIÓN DE PLANTA DE BOMBEO" is on the user's keep
  // list and must stay kept.
  /f[áa]brica de licores|licores y alcoholes/i,

  // Compliance-screening data subscriptions: "Proveer el acceso a los
  // servicios para la consulta en listas restrictivas y de control ...
  // mediante la consulta web" (CO) — a web data feed, sold by access.
  /listas restrictivas/i,

  // ---- 2026-09-11 review round (Mexico). ----

  // Outsourced diagnostic imaging, bought as a SERVICE: "IA-N-188-226
  // SERVICIO DE MASTOGRAFIAS Y ULTRASONIDO MAMARIO UNIDAD MOVIL". Anchored
  // on the service framing and on the study type, NOT on "unidad móvil" —
  // a mobile unit can be a real vehicle purchase, which the user keeps
  // (车辆采购: 留，但重要性和优先级都不用太高).
  /servicios? de mastograf[íi]a|mastograf[íi]as\s+y\b|ultrasonido mamario|estudios? de (gabinete|imagenolog[íi]a)/i,

  // "Estudios y proyectos" is the standard Mexican phrasing for a design-
  // and-engineering package — the paperwork for a build, not the build:
  // "ESTUDIOS PROYECTO CONSTRUCCIÓN Y EQUIPO PARA POZO HGZ TULA Y UMF 37
  // HIDALGO". `^\W*` because real titles arrive wrapped in stray quotes.
  //
  // Widened on the same day, after the user confirmed: 港口规划研究这类要
  // 也一起排除. This first shipped narrowed to the "estudios y proyectos"
  // phrasing, because the regression suite caught that a bare leading-
  // "estudios" rule would also exclude "ESTUDIO DE ORDENAM P/LA AMPLIACIÓN
  // Y MODERNIZAC DEL PUERTO DE PROGRESO", which the user had put at 常规 on
  // 2026-09-07. Raising that rather than silently overriding it is what got
  // the newer decision: any title that leads with the study is buying the
  // study, whatever it studies. The 2026-09-07 fixture is updated to match.
  /^\W*estudios?\b/i,

  // Highway U-turn/return lanes: "CONSTRUCCIÓN DE RETORNO TIPO
  // \"HERRADURA\"" — a single road fixture, the same small-scale roadworks
  // class as the community buildings above.
  /construcci[óo]n de retorno\b|\bretorno tipo\b/i,

  // ---- 2026-09-11 review round (Colombia). Every pattern below comes from
  // a real title in the first import after the modalidad gate opened
  // Colombia up, which the user marked "排除". ----

  // Veterinary field services: "PRESTAR LOS SERVICIOS MÉDICO-VETERINARIOS
  // PARA LA ATENCIÓN DE CANINOS Y FELINOS; MEDIANTE JORNADAS DE
  // ESTERILIZACIÓN". Two anchors, and deliberately NOT a bare
  // "esterilización" — that word is also how hospitals describe sterilizing
  // surgical instruments, which is real medical-equipment spend.
  /m[ée]dico[\s-]*veterinari/i,
  /esterilizaci[óo]n[^.]{0,40}\b(caninos?|felinos?|mascotas?|animales|semovientes)\b/i,

  // Insurance brokerage: "CONTRATAR A UN INTERMEDIARIO DE SEGUROS;
  // LEGALMENTE CONSTITUIDO EN COLOMBIA; QUE REALICE LA INTERMEDIACIÓN".
  // A financial intermediary's commission, same class as the restricted-
  // lists data subscription excluded on 2026-09-08.
  /intermediari[oa]s?\s+de\s+seguros|intermediaci[óo]n\s+(de\s+)?seguros|corredor(es)?\s+de\s+seguros/i,

  // Ecological revegetation: "EJECUTAR ESTRATEGIAS DE REHABILITACIÓN Y
  // REVEGETALIZACIÓN EN ÁREAS CON PRESENCIA DE ESPECIES PIONERAS". Plain
  // "reforestación" is deliberately left out — it turns up as a compensation
  // measure inside real civil-works contracts, where the build is the point.
  // Widened later the same day: the first version required the two words to
  // be adjacent and so missed "IMPLEMENTACIÓN DE ACCIONES DE RESTAURACIÓN Y
  // REHABILITACIÓN ECOLÓGICA" ($25.7M), where a second noun sits between
  // them. A national-priority project still overrides this, which is why
  // Mexico's "REVEGETACIÓN AFLUENTES, RESTAURACIÓN RIBERAS" stays in.
  /revegetalizaci[óo]n|revegetaci[óo]n|(restauraci[óo]n|rehabilitaci[óo]n)[^.]{0,30}ecol[óo]gica|restauraci[óo]n de ecosistemas?/i,

  // Colombian police detention transfer centres: "ADECUACIÓN DEL CENTRO DE
  // TRASLADO POR PROTECCIÓN (CTP)". The full phrase only — the bare acronym
  // CTP collides with too much else.
  /centro de traslado por protecci[óo]n/i,
  // ---- 2026-09-11, second Colombia round + a Mexico pass. Every pattern
  // below is a real kept title the user reviewed and marked 排除. ----

  // A. Contracts that buy PEOPLE or run a programme — no works, no goods.
  /proceso de selecci[óo]n[^.]{0,80}empleos?\s+vacantes?|provisi[óo]n definitiva[^.]{0,60}empleos?/i,
  /pago por resultados|promoci[óo]n de empleo/i,
  /recurso humano id[óo]neo|suministro de personal|talento humano\b/i,
  /pruebas de (conocimiento|competencias)/i,
  /plan de bienestar\b/i,
  /vigilancia y seguridad privada|servicios? de escolta/i,
  /servicios? de log[íi]stica integral/i,
  /contratar los seguros|p[óo]lizas? de seguros?|programa de seguros/i,
  // "FORTALECIMIENTO <abstract noun>" as the whole object is a
  // capacity-building programme: FORTALECIMIENTO EMPRESARIAL,
  // ... ORGANIZACIONES SOCIALES, ... DE PEQUEÑOS Y MEDIANOS PRODUCTORES,
  // ... DE LA RED DE BIBLIOTECAS. Only when it LEADS the title, and with a
  // lookahead for the infrastructure nouns, because the same word introduces
  // real works ("FORTALECIMIENTO DE LA INFRAESTRUCTURA VIAL") and trails
  // real equipment buys ("ADQUISICIÓN DE VEHÍCULO ... Y FORTALECIMIENTO DEL
  // SISTEMA DE VIDEOVIGILANCIA", which the user keeps).
  /^\W*fortalecimiento\b(?![^.]{0,60}(infraestructura|vial|acueducto|alcantarillado|hospital|energ[íi]a|el[ée]ctric|red de distribuci|planta))/i,

  // B. Parks, sports, culture and social-service buildings live in
  // MUNICIPAL_AMENITY_KEYWORDS, not in this array — they are the one
  // exclusion class that has a value exception. See its header comment.

  // D. Concessions where the contractor OPERATES an asset the state already
  // owns, rather than building anything: "OTORGAR EN CONCESIÓN, LA OPERACIÓN
  // Y EXPLOTACIÓN DE LAS ÁREAS ... TIENDA Y RESTAURANTE". Anchored on
  // operación/explotación precisely so a build-and-operate highway concession
  // — which is exactly the kind of project this platform exists to find —
  // does not get swept up with it.
  /otorgar en concesi[óo]n[^.]{0,90}(operaci[óo]n y )?explotaci[óo]n/i,
  /accionistas? operador(es)? privado/i,

  // ---- Mexico, same round. ----

  // Supervision of someone else's build: "SEGUIMIENTO Y CONTROL DE LOS
  // TRABAJOS DE RECONSTRUCCIÓN PAQ. 11" (5 rows). Same class as the
  // "estudios y proyectos" engineering packages.
  /seguimiento y control de (los )?trabajos/i,

  // Preventive/corrective maintenance contracts — "SERVICIO DE M/P Y M/C PUE
  // SISTEMA DE CIRCUITO CERRADO DE TELEVISIÓN".
  /\bm\/p\s+y\s+m\/c\b|mantenimiento preventivo y correctivo/i,

  // Dry toilets. Anchored to "sanitarios", so a real biogas plant keeps its
  // own word.
  /sanitarios?[^.]{0,25}biodigestor/i,

  /centro de rehabilitaci[óo]n[^.]{0,60}fauna|rescate[^.]{0,40}fauna/i,
  /centro de conciliaci[óo]n laboral/i,
  /generador(es)? monof[áa]sic/i,

  // Pedestrian bridges, now excluded outright (user, 2026-09-11). The
  // MAJOR_PROJECT bridge rule already refused to promote them, but the
  // "construcción" industry whitelist was still keeping them.
  /puentes? peatonal(es)?/i,

  // Single-unit vehicle purchases: "ADQUISICIÓN DE UN VEHICULO TIPO PICK UP",
  // "ADQUISICION DE VEHICULO PARA LA COORDINACION DE PROTECCION CIVIL". The
  // user keeps fleet buys at low priority (车辆采购: 留，但重要性和优先级都不用
  // 太高) — this is the 单台下限 they asked for, and it works off the singular
  // noun: "VEHÍCULOS" and "22 VEHS." both stay in.
  /adquisici[óo]n de (un |una )?veh[íi]culo\b(?!s)/i,
];

/**
 * Buyer-name-only exclude list — the inverse problem from the buyer-name
 * industry-tag bug fixed above (2026-09-02, second pass): that bug was a
 * buyer wrongly ADDING a false positive signal; this is a buyer whose
 * ABSENCE of any real signal should count for something. Real example
 * from a 2026-09-02 kept-list export: "ALIMENTACIÓN PARA EL BIENESTAR,
 * S.A. DE C.V." (Mexico's federal below-poverty-line food/hygiene
 * distribution program) had 207 of its 208 kept tenders classified
 * "standard" purely via the scopeType==="equipment" fallback signal
 * below — because its real titles are bare retail product names
 * ("COLGATE TRIPLE", "PAPEL HIGIENICO", "SARDINA SAL ROJA", "MANGO
 * ROJO"), which don't match any EXCLUDE_KEYWORDS phrase (those are all
 * *category* phrases like "artículos de aseo", not brand/product names)
 * and don't match any industry either. Rather than chase individual
 * grocery product names, this targets the one signal that's actually
 * reliable here: this specific buyer's entire real-world mandate is
 * bulk retail groceries/hygiene goods for a social program, never an
 * industrial or infrastructure opportunity, regardless of item name.
 * Deliberately a short, explicit buyer-name list (not a broad pattern),
 * same low-false-positive posture as the rest of this file — a buyer
 * only belongs here once its catalog is confirmed, like this one, to be
 * uniformly irrelevant.
 */
/**
 * Childcare facilities — daycares, community childcare centres, preschool
 * "estancias". Out of scope whatever is being bought FOR them, which is
 * why this list is checked BEFORE `hasIncludeOverride` and is not
 * bypassable by it.
 *
 * That placement is the whole point of the list existing separately
 * (2026-09-08). "SUMINISTRO E INSTALACIÓN DE SISTEMA DE ALARMA CONTRA
 * INCENDIO EN LAS GUARDERÍAS" matches INCLUDE_OVERRIDE_KEYWORDS' industrial
 * fire-alarm pattern ("sistema de alarma...incendio", added for real
 * refinery/plant fire-safety systems), and hasIncludeOverride bypasses
 * every EXCLUDE_KEYWORDS check unconditionally — so putting "guardería"
 * in EXCLUDE_KEYWORDS would have had no effect at all on the very title
 * that prompted the rule. Verified: it classified "standard" until this
 * check was added.
 *
 * Second real title behind this: "CONSTRUCCION DEL COMPLEJO CAIC'S
 * XOCHIQUÉTZAL - ENCINOS 2026" (CAIC = Centro de Atención Infantil
 * Comunitario). "estancia infantil" and "jardín de niños" are the same
 * facility class under Mexico's other two names for it, and
 * EXCLUDE_KEYWORDS already excludes Colombia's "jardines infantiles" —
 * so covering all of them here is consistent, not speculative.
 *
 * Like the maintenance-only and non-procurement checks it sits beside, a
 * real government national-priority-project designation still overrides it.
 */
const CHILDCARE_FACILITY_KEYWORDS = [
  /guarder[íi]as?\b/i,
  // 4-letter acronym, so anchored on both sides to avoid matching inside
  // a longer word; the possessive "CAIC'S" in the real title is why the
  // apostrophe is optional.
  /\bcaic'?s?\b|centros? de atenci[óo]n infantil/i,
  /estancias? infantil(es)?\b|jard[íi]n de ni[ñn]os/i,
  // Colombia's term for the same thing (2026-09-11) — "Centro de desarrollo
  // Infantil". Added under the user's existing daycare decision rather than
  // as a new one.
  /centros? de desarrollo infantil/i,
];

/**
 * Parks, sports, culture and social-service buildings — the municipal-amenity
 * class the user signed off on excluding for both countries (2026-09-11).
 *
 * Checked separately from EXCLUDE_KEYWORDS because this is the only
 * exclusion class with a VALUE EXCEPTION: see isLargeWorksBuild().
 *
 * Why the exception exists (the user's call, 2026-09-11, on a real reviewed
 * row): the class is meant to catch SMALL municipal amenities — a
 * neighbourhood park, a skating rink, a set of court roofs. It is not meant
 * to catch "anything with a sports word in it". "CONSTRUCCIÓN DE CENTRO DE
 * ALTO RENDIMIENTO DEPORTIVO ... FASE II" (Departamento de Córdoba,
 * COP 28,037,383,178 ≈ USD 8.9M) is a real structural works contract at a
 * scale a Chinese contractor would bid on, and the flat rule excluded it
 * alongside a USD 2.5M skating rink. The value floor separates the two.
 *
 * NOTE for Mexico: Compras MX obra pública publishes no amount at all, so
 * the exception structurally cannot fire on a Mexican row and every Mexican
 * amenity here stays excluded exactly as before. That is a property of the
 * data, not something this rule special-cases by country.
 */
/**
 * Municipal water and sewer NETWORKS, as opposed to the plants they feed.
 * "CONSTRUCCIÓN DE PLANTA DE TRATAMIENTO DE AGUAS RESIDUALES" and
 * "CONSTRUCCIÓN DE PLANTA DE BOMBEO" are on the user's keep list (2026-09-07);
 * the pipes, manholes, tanks and collectors around them are not — including
 * "CONSTRUCCIÓN DE COLECTORES PARA PLANTA DE TRATAMIENTO", which names a plant
 * but buys collectors. Exclusion runs before the works whitelist, so naming
 * the plant cannot rescue the pipework.
 *
 * THE VALUE EXCEPTION (the user's call, 2026-09-11): a works contract at or
 * above FLAGSHIP_VALUE_USD is not pipework. The first ProInversión Obras por
 * Impuestos export made the gap concrete — four real rows, every one a whole
 * greenfield or expansion system rather than a network extension, all of them
 * excluded on the word "alcantarillado" alone:
 *
 *   $41.7M  CREACION DEL SERVICIO DE AGUA POTABLE RURAL Y ... ALCANTARILLADO
 *           ... EN 28 CENTROS POBLADOS DE LA CUENCA DEL RIO MOMON
 *   $25.1M  CREACION DEL SISTEMA DE AGUA POTABLE, ALCANTARILLADO Y PLANTA DE
 *           TRATAMIENTO DE AGUA RESIDUAL (PTAR) ... YARINACOCHA
 *   $8.7M / $7.9M  two more, both including the treatment plant
 *
 * The cut lands where it should: the fifth large "alcantarillado" row in that
 * file is a $3.35M O&M manual for an existing plant, which stays excluded on
 * both counts.
 *
 * Deliberately the SAME helper and the same threshold as the municipal-amenity
 * exception — one rule ("a works build at flagship scale is not the small
 * thing this class is about"), not two that can drift apart.
 */
const WATER_NETWORK_KEYWORDS = [
  /alcantarillado|drenaje (sanitario|pluvial|menor)|drenaje y alcantarillado|obra de drenaje/i,
  // Anchored on what the collector IS or feeds, not on the bare word:
  // "CONSTRUCCIÓN DE LA PRIMERA ETAPA DE LOS COLECTORES DE PRESA GUADALUPE"
  // is dam infrastructure the user wants kept, while "COLECTORES PARA
  // PLANTA DE TRATAMIENTO" is the sewage pipework around a plant.
  /(sub)?colector(es)? (sanitario|pluvial|para|y )/i,
  /l[íi]nea(s)? de conducci[óo]n|l[íi]nea sanitaria|red(es)? de agua potable|sistema (integral )?de agua potable|sistema de abastecimiento de agua/i,
  /tanque (de agua|elevado|superficial|de almacenamiento)|caja(s)? de v[áa]lvulas|obra de captaci[óo]n|olla colector/i,
  /tuber[íi]a(s)? (de )?pvc|pozos? y descargas|estaci[óo]n(es)? de bombeo de aguas residuales|estaciones de medici[óo]n/i,
];

const MUNICIPAL_AMENITY_KEYWORDS = [
  /centro de alto rendimiento|pista de patinaje|parques? (ecol[óo]gico|recreativo|de proximidad|deportivo)|infraestructura deportiva|escenarios? deportivos?|complejos? deportivos?|pr[áa]ctica deportiva/i,
  /centro de integraci[óo]n social|centro vida\b|centro de bienestar animal|casa de la cultura|teatro al aire libre/i,
];

const EXCLUDE_BUYER_KEYWORDS = [/alimentaci[óo]n para el bienestar/i];

/**
 * Broad "this is fundamentally a maintenance/support SERVICE contract on
 * already-installed equipment, not a new equipment/construction
 * opportunity" signal. Deliberately checked BEFORE, and NOT gated by,
 * `hasIncludeOverride` or `MAJOR_PROJECT_KEYWORDS` — the one exception
 * to every other exclude check in this file, which INCLUDE_OVERRIDE_KEYWORDS
 * can always bypass.
 *
 * Real batch (2026-09-04, ~28 confirmed real Colombia/Mexico examples the
 * user marked "应排除"): a title combining "mantenimiento" with an
 * INCLUDE_OVERRIDE_KEYWORDS anchor — videovigilancia, seguridad
 * electrónica, fibra óptica, `5g`, "sistema de alarma...incendio" — or a
 * MAJOR_PROJECT_KEYWORDS anchor (a passing "ferrocarril (FFCC)" mention
 * in "Mantenimiento a las Básculas Camioneras y de Ferrocarril") was
 * wrongly promoted straight to flagship every time, because those
 * override lists exist to protect genuine NEW equipment/infrastructure
 * purchases — not routine upkeep of systems already installed, which is
 * a fundamentally different (and for a foreign manufacturer largely
 * inaccessible — needs an existing local service presence and spare-parts
 * stock) kind of opportunity. This is a broadened, unconditional version
 * of the (bypassable, and narrower) "mantenimiento" EXCLUDE_KEYWORDS
 * entry it replaces — that entry's own comment already documented this
 * exact accepted trade-off ("a genuinely large maintenance-only contract
 * is excluded too"); this just makes it stick even when an override
 * keyword is also present. `isNationalPriorityProject` (a real,
 * government-verified major-project designation) is still the one
 * legitimate escape valve — never anything keyword-based.
 *
 * The single bare `\bmantenimiento\b` catch-all subsumes the previous
 * pattern's more specific alternatives (preventivo/correctivo/menor/
 * general/a los equipos/y refacciones) plus the real coverage gaps this
 * batch also surfaced: abbreviated "MANT. PREV.", "mantenimiento
 * integral", bare "mantenimiento equipo" with no preventivo/correctivo
 * qualifier at all, "soporte y mantenimiento", "renovación...y
 * mantenimiento", "administración, operación y mantenimiento", "servicio
 * técnico preventivo y correctivo".
 */
/**
 * Renewing something that already exists, which is the software equivalent
 * of MAINTENANCE_ONLY_KEYWORDS and gets the same treatment: checked before
 * hasIncludeOverride and NOT bypassable by it.
 *
 * The licensing patterns in EXCLUDE_KEYWORDS are bypassable, and that is
 * how "REALIZAR LA RENOVACIÓN DEL LICENCIAMIENTO DE LA PLATAFORMA DE
 * SEGURIDAD PERIMETRAL EXISTENTE Y ADQUIRIR LA SOLUCIÓN LAN; WIFI Y
 * FIREWALL" (2026-09-07, real, user-confirmed) came out FLAGSHIP: firewall
 * and perimeter security are INCLUDE_OVERRIDE_KEYWORDS, so the override
 * waved away the licence-renewal exclusion and then, with no disclosed
 * value, promoted it to the top tier.
 *
 * The tradeoff is deliberate and the same one maintenance already makes: a
 * large security project that happens to mention renewing a licence is
 * dropped too. Renewing a subscription on an installed platform is not a
 * procurement a foreign bidder can win, whatever else the sentence names.
 */
const RENEWAL_ONLY_KEYWORDS = [
  // Renting, in the same non-bypassable class and for the same reason:
  // "ARRENDAMIENTO DE CIRCUITO CERRADO DE TELEVISIÓN" and "SERVICIO MENSUAL
  // DE ARRENDAMIENTO DE 170 CÁMARAS DE VIDEOVIGILANCIA" were both held in
  // by CCTV/videovigilancia override keywords (2026-09-07, user-confirmed).
  // Vehicle rental was already excluded by a narrower pattern; this covers
  // renting anything, including a commercial unit ("Arrendar a título
  // oneroso el local comercial").
  /\barrendamiento\b|\barrendar\b/i,
  /renovaci[óo]n del? licenciamiento|renovaci[óo]n de (la )?(suscripci[óo]n|licencia(s)?)|renovaci[óo]n de (la )?plataforma/i,
];

/**
 * The settlement the work is IN, when that settlement is a village,
 * hamlet, ejido or one neighbourhood — a structural marker of scale rather
 * than a guess at what is being built.
 *
 * Added 2026-09-07 after a real kept export showed 265 Mexican tenders held
 * in by the bare "construcción" in FLAGSHIP_INDUSTRY_KEYWORDS alone, and
 * the user pointed at the shape of the ones they did not want:
 * "CONSTRUCCIÓN xxxx en la COMUNIDAD". A sewer line in one comunidad and a
 * highway between two cities are the same word to that whitelist; the
 * administrative unit named in the title is what separates them, and it is
 * a fact the source states rather than something inferred.
 *
 * Checked AFTER every promotion has had its chance, so a genuinely major
 * project sited in a small place — a dam, a railway — has already returned
 * and is untouched.
 *
 * Deliberately NOT including the "LOC" abbreviation: a title the user
 * confirmed they want, "PAV CAM MANUEL CRESCEN REJON LOS ALACRANES, LOC
 * PIONEROS DEL RÍO XNOHÁ, CALAKMUL", carries it.
 */
const SETTLEMENT_SCALE_KEYWORDS = [
  /\ben (?:la |el |las |los )?(?:comunidad|localidad|ranch[ée]r[íi]a|ejido|colonia|barrio|vereda|corregimiento)\b/i,
  /\bde la (?:comunidad|localidad)\b/i,
  /\bfracc(?:\.|ionamiento)\b/i,
];

/**
 * A major structure named as the ADDRESS of the work, not as the work.
 * "TRABAJOS DE URBANIZACIÓN BAJO PUENTE COMPRENDIDO ENTRE EL FRENTE 1, 13,
 * 17, 19" is paving under a bridge, and MAJOR_PROJECT_KEYWORDS' "puente"
 * had it at the top tier. Demoted to whatever the rest of the title earns
 * (2026-09-07, per the user's explicit call: 改常规项目).
 */
const MAJOR_PROJECT_LOCATION_ONLY = [
  /\bbajo (?:el |la )?(?:puente|paso a desnivel|distribuidor vial)/i,
  // The keyword names the subject of a STUDY, not a build: "ESTUDIO DE
  // ORDENAM P/LA AMPLIACIÓN Y MODERNIZAC DEL PUERTO DE PROGRESO".
  /^\s*estudio\b|estudio de ordenam/i,
  // Dredging silt out of a working port is upkeep: "DRAGADO DE DESAZOLVE DE
  // LOS PUERTOS DE CHUBURNA Y CHABIHAU". Note "DRAGADO DE CONSTRUCCIÓN Y
  // CONFORMACIÓN DE LA PLATAFORMA NORTE DE 40 HECTÁREAS" — on the user's
  // keep list — is dredging TO BUILD something and does not say desazolve.
  /desazolve/i,
  // A component AT the dam, not the dam: "CONSTRUCCIÓN DE LA PRIMERA ETAPA
  // DE LOS COLECTORES DE PRESA GUADALUPE" (2026-09-07, user: 改常规项目).
  /colectores? de presa|colector de presa/i,
  // Equipment bought FOR the facility rather than the facility itself:
  // "ADQUISICIÓN DE EQUIPOS DE SEGURIDAD PARA REVISIÓN DE EQUIPAJE EN EL
  // AEROPUERTO". Per the user: 建机场才是大型.
  /(adquisici[óo]n|compra|suministro)\s+de\s+equipos?\b[^.]{0,60}(aeropuerto|puerto)/i,
];

/**
 * Override keywords that protect a tender from exclusion but must NOT force
 * it to the top tier on an undisclosed value alone (2026-09-07, per the
 * user: all three 从大型项目改常规项目). A fire-alarm panel, a firewall
 * subscription and a cybersecurity support contract are single systems or
 * services, not the network-scale builds videovigilancia and fibra óptica
 * denote — those keep forcing flagship.
 *
 * The last two entries carry that same 2026-09-07 decision onto the
 * synonyms added to INCLUDE_OVERRIDE_KEYWORDS on 2026-09-12. Without them a
 * cybersecurity service reached a different tier depending only on which
 * word its title happened to use — SERVICIO INTEGRAL DE CIBERSEGURIDAD
 * standard, SERVICIO INTEGRAL DE PROTECCIÓN CONTRA AMENAZAS CIBERNÉTICAS
 * flagship — for the same thing bought the same way from the same buyer.
 */
const OVERRIDE_NOT_FLAGSHIP = [
  /incendio/i,
  /firewall/i,
  /ciberseguridad|cybersecurity/i,
  /cibern[ée]tic[oa]s?|ciberataque(s)?|ciberdefensa/i,
  /cuentas privilegiadas|gesti[óo]n de identidades|gesti[óo]n de accesos|privileged access/i,
  /protecci[óo]n de (la )?informaci[óo]n|seguridad de la informaci[óo]n|information security/i,
];

/**
 * Titles that DO match a MAJOR_PROJECT_KEYWORDS term but are not major
 * projects at that keyword's scale — real infrastructure work at real
 * scale, just not what the keyword implies. Demoted to "significant"
 * (中型项目) rather than "standard", which is what MAJOR_PROJECT_LOCATION_
 * ONLY does for the weaker cases.
 *
 * First entry, repairs: a repair of PART of a major structure. "REPARACIÓN DE JUNTAS DE CALZADA EN PSV DEL
 * PUERTO ALTAMIRA" is resurfacing joints at a port, not a port project
 * (2026-09-07, per the user: 改中型项目).
 *
 * Deliberately "reparación" only, NOT "reconstrucción": rebuilding a bridge
 * outright stays flagship, and several such titles are in the same export.
 */
const MAJOR_PROJECT_DEMOTED_TO_SIGNIFICANT = [
  /\breparaci[óo]n\b/i,
  // Bridges, as a class (2026-09-12, per the user: 感觉秘鲁的大型工程太多了，
  // 请把桥的等级最多改成中级，除非金额很大的项目).
  //
  // "puente" in MAJOR_PROJECT_KEYWORDS was forcing flagship value-independently,
  // and in Peru that is almost never right: the overwhelming majority of SEACE
  // "RENOVACIÓN DE PUENTE; EN EL(LA) CAMINO VECINAL ..." rows are single-span
  // village crossings on a rural road. The real case that triggered this had a
  // disclosed value of $500,000 and still came out 大型项目.
  //
  // A genuinely large bridge is not lost: the demotion branch below yields to a
  // disclosed value at or above FLAGSHIP_VALUE_USD, so a $6M+ crossing is still
  // flagship. What is gone is flagship on the word alone.
  /\bpuente(s)?\b/i,
  // A water plant built AT a named dam, where the dam is the water source
  // and not the thing being built: "CONSTRUCCIÓN PLANTA POTABILIZADORA, DE
  // LA PRESA TUNAL II DURANGO, DURANGO" (2026-09-08, per the user: 大型项目
  // 改成中型). The bare `presa` entry in MAJOR_PROJECT_KEYWORDS was forcing
  // flagship. Significant rather than standard because a potabilization /
  // treatment plant IS the real infrastructure build the user keeps — it is
  // only the dam-scale reading that is wrong. Contrast MAJOR_PROJECT_
  // LOCATION_ONLY's "colectores de presa", which the user put at standard:
  // that one buys pipework, this one builds a plant.
  /planta\s+(potabilizadora|de\s+tratamiento)[^.]{0,40}\bpresas?\b/i,
];

/**
 * IOARR — "Inversión de Optimización, de Ampliación Marginal, de Reposición y
 * de Rehabilitación", a formal category under Peru's Invierte.pe system.
 * By legal definition these are NOT new projects: they are marginal
 * optimisation, replacement and rehabilitation spend on an asset that already
 * exists, and they skip the full pre-investment study a real project needs.
 *
 * Real spellings in SEACE titles include the official "IOARR" and the common
 * clerical "IOAAR", both present in the 2026-09-11 import.
 *
 * Why this is checked, and checked here: 168 of that run's 1295 kept rows came
 * in on the bare "puente" keyword, and a large share were titles like
 * "CONTRATACION DE LA EJECUCION DE LA IOARR: RENOVACION DE PUENTE; EN EL(LA)
 * SAN MIGUEL EN LA LOCALIDAD SAN MIGUEL" — a village footbridge replacement,
 * promoted to flagship on the word "puente" alone with no amount at all.
 *
 * The rule the user set (2026-09-11): an IOARR with NO disclosed value is
 * excluded; an IOARR that publishes a real amount is judged on that amount
 * like anything else, because some genuinely do run to several million.
 *
 * Placed with MAINTENANCE_ONLY_KEYWORDS rather than among the undisclosed-
 * value gates further down, for the reason that motivated it: those gates sit
 * below every promotion branch, and this exact row promotes on a keyword and
 * returns before reaching them. Same posture as those keywords too — an
 * include-override must not rescue it, only a real government national-
 * priority designation.
 */
const PERU_MARGINAL_INVESTMENT = /\bioa[ar]r\b/i;

const MAINTENANCE_ONLY_KEYWORDS = [
  // The abbreviations are how Compras MX titles actually write it —
  // "IA-N-182-2026 MTTO PLANTAS DE EMERGENCIA HOSPITALES" is a real one.
  // Only the full word was listed, so those titles were reaching the tiers
  // below and were being excluded (when they were) by the unrelated
  // no-industry/no-value gate — which meant the same title WITH an
  // industry tag survived as a maintenance job.
  /\bmantenimiento\b|\bmtto\b|\bmantto\b|\bmto\b|servicio t[ée]cnico (preventivo|correctivo)/i,
];

/**
 * The one thing "mantenimiento" must not swallow: a concession whose object
 * includes BUILDING the asset.
 *
 * "Construcción, operación y mantenimiento" is the standard naming of a
 * design-build-operate-maintain road concession (Colombia's 4G/5G programme,
 * Mexico's APPs) — the largest projects either country tenders, and squarely
 * what this platform exists to surface. The bare `\bmantenimiento\b`
 * catch-all excluded every one of them, and silently: the word sits at the
 * end of a title whose real object is a new highway.
 *
 * Both halves are required, and that is what keeps the 2026-09-04 batch this
 * rule came from still excluded. Those were routine upkeep — "administración,
 * operación y mantenimiento", "MTTO PLANTAS DE EMERGENCIA HOSPITALES",
 * "Mantenimiento a las Básculas Camioneras y de Ferrocarril" — none of which
 * names a concession, and the O&M one names no construction either. Upkeep of
 * an existing asset stays excluded no matter how it is worded; only a
 * contract that builds AND is structured as a concession gets past.
 *
 * Deliberately not extended to "operación y mantenimiento" without the
 * concession framing: a pure O&M contract needs a local service presence and
 * spare-parts stock — exactly the opportunity the original rule judged a
 * foreign bidder cannot take.
 */
const CONCESSION_FRAMING = /concesi[óo]n|asociaci[óo]n(es)? p[úu]blico[\s-]?privadas?|\bapp\s+de\s+infraestructura\b/i;
const BUILD_OBJECT = /construcci[óo]n|dise[ñn]o y construcci[óo]n|rehabilitaci[óo]n|ampliaci[óo]n|modernizaci[óo]n|doble calzada/i;

/** A build-and-operate concession, not routine upkeep — see CONCESSION_FRAMING. */
function isConcessionWithBuildScope(haystack: string): boolean {
  return CONCESSION_FRAMING.test(haystack) && BUILD_OBJECT.test(haystack);
}

/**
 * The value exception to MUNICIPAL_AMENITY_KEYWORDS — see that array's
 * header comment for the reviewed row this came from.
 *
 * Both halves are required. scopeType "works" keeps the exception on real
 * construction: a large park OPERATIONS or events-programming contract is
 * still the human/social class the exclusion is for, however big its budget,
 * and those come through as "services". The floor is FLAGSHIP_VALUE_USD
 * rather than a second hardcoded number because it is the same judgement
 * already encoded there — above it, a works contract is big enough to be
 * worth a foreign bidder's attention on size alone.
 *
 * Undisclosed value does NOT pass: with no amount there is nothing to
 * establish scale with, so the row stays excluded (same posture as
 * "undisclosed_value" everywhere else in this file).
 */
/**
 * "suministro de materiales", lifted out of EXCLUDE_KEYWORDS (2026-09-11)
 * because it means two opposite things depending on what surrounds it.
 *
 * On its own it is a consumables purchase, which is what it was listed for.
 * But it is also half of the standard Mexican phrasing for a full works
 * contract — "CONSTRUCCIÓN DE OBRAS DE ELECTRIFICACIÓN (MANO DE OBRA Y
 * SUMINISTRO DE MATERIALES)", a real CFE distribution build, where it says
 * the contractor supplies labour AND materials rather than the client
 * issuing them. Read as a consumables purchase, that excluded the tender
 * outright even with a value attached, while the identical title without the
 * parenthetical was kept — the classification turned on a scope note.
 *
 * So the phrase only excludes when nothing around it says "works": same
 * shape as purchaseSubject()'s PROJECT_CONTEXT_CONNECTOR, which exists for
 * the mirror-image case (a purchase that merely names a project).
 *
 * It also matches a title that OPENS with the noun, with no purchase verb at
 * all — "MATERIALES PROFAUNA PARA SUBESTACIONES", a real fixture. That one
 * used to be excluded only because it had no value; once the power-asset
 * terms below could rescue an undisclosed-value row, "para subestaciones"
 * started reading as grid work when it is the delivery address for a box of
 * materials. purchaseSubject() cannot help here — it needs a purchase verb
 * to cut on, and this title leads with the goods themselves.
 */
const MATERIALS_SUPPLY_PATTERN = /^\W*materiales?\b|suministro (de )?material(es)?\b/i;

/**
 * Commodity construction inputs, plant consumables and catalogue products,
 * bought as goods.
 *
 * These arrived together from one 2026-09-12 review, the CFE and Peru halves
 * of it being the same shape:
 *
 *   "Adquisición de Tubería Lisa y Riflada para las Paredes de los Generadores
 *    de Vapor de la C.T. Puerto Libertad"
 *   "ADQUISICIÓN DE BARRA DE ACERO CORRUGADO PARA LA OBRA: MEJORAMIENTO DEL
 *    SERVICIO DE TRANSITABILIDAD VIAL MEDIANTE EL PUENTE CARROZABLE ..."
 *   "SERVICIO DE CARGA Y TRANSPORTE DE MATERIAL DE CANTERA ... PARA LA META
 *    123 MEJORAMIENTO DE AMPLIACIÓN DE LA CARRETERA ..."
 *
 * Every one of them names a real, large, whitelisted work — a power station, a
 * bridge, a highway — which is exactly why they were being kept:
 * MATERIALS_SUPPLY_PATTERN above yields whenever WORKS_CONTRACT_CONTEXT
 * matches, and "PARA LA OBRA: <works>" matches it. A bidder on a steel-rebar
 * order is a steel supplier, not a bridge builder.
 *
 * Named categories, NOT a general "bought for a named project" rule. The
 * general version was written first and had to be withdrawn: "ADQUISICIÓN DE
 * EQUIPAMIENTO MEDICO DE ESPECIALIDADES ... PARA EL PROYECTO MEJORAMIENTO DEL
 * SERVICIO DE SALUD" at 20M PEN is a fixture here, and it is precisely the
 * business this platform exists for. "Para el proyecto" cannot tell rebar from
 * hospital equipment; the noun can.
 *
 * The list is what a Chinese exporter could actually win: rebar, aggregate,
 * asphalt, cement, pipe, valves and fuel are commodity orders a local yard
 * serves, and they arrive in volume from SEACE and CFE alike. 管道不要 /
 * 阀门不要 is the user's own wording, given against three CFE component orders
 * at power stations.
 *
 * This runs as an exclusion, so it beats the power-asset whitelist in
 * FLAGSHIP_INDUSTRY_KEYWORDS — deliberately. "Adquisición de válvulas de
 * Control del Generador de Vapor" is a valve order that happens to name a
 * boiler; the thing being bought is the valve.
 */
const CONSTRUCTION_INPUT_GOODS = [
  /\bbarras?\s+de\s+acero\b|acero\s+corrugado|fierro\s+corrugado/i,
  /\bmaterial(es)?\s+(granular(es)?|de\s+cantera|de\s+pr[ée]stamo|de\s+afirmado)\b|\bagregados?\s+(p[ée]treos|de\s+cantera)\b/i,
  /\basfalto\b|\bemulsi[óo]n(es)?\s+asf[áa]ltica/i,
  /\bcemento\b|\bconcreto\s+premezclado\b|\bhormig[óo]n\s+premezclado\b/i,
  /\btuber[íi]as?\b|\btubos?\b/i,
  /\bv[áa]lvulas?\b/i,
  /\bcombustible(s)?\b|\bdi[ée]sel\b|\bgasolina\b|\bpetr[óo]leo\s+diesel\b/i,
  // A catalogue product with a model number, fabricated to order and shipped:
  // "CONTRATACION DE SERVICIO DE FABRICACIÓN DE PUENTE METALICO MODULAR DE
  // 24.384X3.2M DSR2 ... TRANSPORTE ... MONTAJE Y LANZAMIENTO". It reached 中型
  // on the word 桥 inside its own product name. Narrow on purpose — building a
  // bridge is kept, buying a prefabricated span is not.
  /\bpuente(s)?\s+met[áa]lico(s)?\s+modular(es)?\b/i,
];

/**
 * Engineering consultancy ON a works contract — the study, the design file,
 * the site supervision. Not the construction.
 *
 * scopeType === "consulting" already excludes this class, but only where the
 * SOURCE says so: SEACE reports these as `works` (Peru files them under the
 * obra they attach to), so they arrived carrying the whole vocabulary of the
 * project they supervise and were promoted on it. Two of the 2026-09-12 list
 * reached flagship purely on "RENOVACIÓN DE PUENTE" inside the name of the
 * work being supervised.
 *
 * "expediente técnico" only counts when it is the deliverable. A design-build
 * contract that says "ELABORACIÓN DE EXPEDIENTE TÉCNICO Y EJECUCIÓN DE LA
 * OBRA" is a real works contract and stays — hence the negative lookahead.
 */
const WORKS_CONSULTANCY_PATTERN =
  /\bconsultor[íi]a\s+de\s+obra\b|\bsupervisi[óo]n\s+de\s+(la\s+)?obra\b|\bsupervisor\s+de\s+la\s+ejecuci[óo]n\b|\bestudios?\s+definitivos?\b|\bexpediente\s+t[ée]cnico\b(?![^.]{0,40}\bejecuci[óo]n\b)/i;

/**
 * A single support vehicle or yard machine for an entity's own operations —
 * a pickup for the disaster-management office, one 5-tonne forklift for a
 * port (2026-09-12, user: 1台车 / 1台叉车).
 *
 * This narrows, and does not reverse, the 2026-09-06 decision to keep vehicle
 * procurement ("留，但重要性和优先级都不用太高"): a fleet order for buses,
 * ambulances, dump trucks or heavy machinery is still a real opportunity and
 * is untouched. What is excluded is the pickup-and-forklift class, which is
 * an internal purchase served by a local dealer.
 *
 * SINGULAR only, which is what separates the two: both of the user's rows name
 * one unit ("ADQUISICION DE CAMIONETA 4 X 4 PARA LA GERENCIA DE OPERACIONES",
 * "UN (01) MONTACARGA DE 5 TONELADAS"), while the fixture that must survive is
 * "ADQUISICIÓN DE CAMIONETAS TIPO SUV PARA SEGURIDAD PÚBLICA" — plural, a
 * fleet. Spanish marks the difference reliably; a count in the title does not
 * (neither of the user's rows carries one).
 */
const SUPPORT_VEHICLE_KEYWORDS = [/\bcamioneta\b(?!s)/i, /\bmontacarga\b(?!s)/i];


/** A title that states it is building something — enough to read a materials clause as the contractor's scope, not the subject of the purchase. */
const WORKS_CONTRACT_CONTEXT =
  /\b(obras?\s+(de|p[úu]blicas?)|construcci[óo]n|edificaci[óo]n|ejecuci[óo]n\s+de\s+(la\s+)?obra|llave en mano|epc)\b/i;

function isLargeWorksBuild(input: { scopeType: TenderScopeType; estimatedValue?: number; currency?: string }): boolean {
  if (input.scopeType !== "works") return false;
  if (input.estimatedValue === undefined) return false;
  const usd = convertToUsd(input.estimatedValue, input.currency);
  return usd !== null && usd !== undefined && usd >= FLAGSHIP_VALUE_USD;
}

/**
 * Same "this was never a procurable good/work/service" class of signal as
 * MAINTENANCE_ONLY_KEYWORDS above — unconditional for the identical reason:
 * no keyword should be able to rescue a record that isn't a real tender
 * opportunity at all. Two real sub-patterns confirmed against actual
 * Colombia SECOP II records the user flagged (2026-09-05):
 *
 * 1. `MANDATO_SIN_REPRESENTACION_PATTERN` — "mandato sin representación" is
 *    a specific Colombian public-contracting legal structure where one
 *    entity administers funds/logistics on another's behalf; the buyer
 *    named in the record is never the one executing the actual work.
 *    Real title: "CONTRATO INTERADMINISTRATIVO DE MANDATO SIN
 *    REPRESENTACIÓN PARA LA OPERACIÓN LOGÍSTICA RELACIONADA CON LAS FASES
 *    ZONAL REGIONAL Y FINAL NACIONAL DE LOS JUEGOS INTERCOLEGIADOS 2026"
 *    ($0.8M — clears the Colombia value floor, so needed its own signal
 *    rather than relying on being caught there).
 *
 * 2. `isBareInteradministrativeTitle()` — a title that's essentially JUST
 *    the legal-instrument name ("CONVENIO INTERADMINISTRATIVO",
 *    "CONTRATO INTERADMINISTRATIVO", "CONVENIO INTERADMINISTRATIVO
 *    TRANSMILENIO") with no words describing what's actually being
 *    procured. Deliberately NOT a bare "interadministrativo" keyword
 *    match on the whole haystack — real, substantial infrastructure
 *    projects are legitimately funded through inter-administrative
 *    agreements too (the Juegos Intercolegiados title above is itself an
 *    example of a long, content-bearing title using this same legal
 *    term), so only a SHORT title (≤8 words) anchored to this exact
 *    phrase is treated as "no real content", leaving any longer,
 *    substantive title to be judged on its own merits by every other
 *    signal in this file.
 *
 * Also covers two adjacent "this record isn't a tender at all" cases from
 * the same batch: a labor union appearing as the record's title/buyer
 * ("SINDICATO DE PROFESIONALES DE LA SALUD PROSALUD") and a loan/borrowing
 * instrument ("EMPRÉSTITO") — neither describes a procurement, they're
 * administrative/financial records SECOP's ingest picks up alongside real
 * tenders.
 */
const NON_PROCUREMENT_RECORD_KEYWORDS = [
  // Records of a transaction already made, not a tender: "ACTA DE
  // TRANSFERENCIA A TÍTULO GRATUITO DE LOS BIENES ADQUIRIDOS", "RATIFICACIÓN
  // No. 9677-PPAL001-490-2025 A LA ORDEN DE PROVEEDURÍA" (2026-09-07, both
  // real, both held in the feed by a large value).
  /acta de transferencia|ratificaci[óo]n n[o°]\.?\s*[\d-]|orden de proveedur[íi]a/i,/\bmandato sin representaci[óo]n\b/i, /^sindicato\b/i, /^empr[ée]stito\b/i];

const BARE_INTERADMINISTRATIVE_TITLE_PATTERN = /^(convenio|contrato) interadministrativo\b/i;
function isBareInteradministrativeTitle(title: string): boolean {
  const trimmed = title.trim();
  return BARE_INTERADMINISTRATIVE_TITLE_PATTERN.test(trimmed) && trimmed.split(/\s+/).length <= 8;
}

/**
 * DOF's advanced-search notices sometimes carry no real title at all —
 * confirmed real: the actual `titulo` field for some notices is
 * literally just "<BUYER> - REF:<number>" (e.g. "COMISION FEDERAL DE
 * ELECTRICIDAD - REF:579845"), with nothing describing what's being
 * procured, and no other real field on that source (see
 * dof-search-mapper.ts) carries a description either — not a scraping
 * gap, the source data itself has nothing more to give. Tested against
 * `input.title` alone (anchored start-to-end, and case-SENSITIVE —
 * deliberately not /i), not the combined haystack
 * EXCLUDE_KEYWORDS/INCLUDE_OVERRIDE_KEYWORDS use, since this is about the
 * title carrying zero content, not a keyword within it. Requiring no
 * lowercase letters anywhere in the title (real Mexican government
 * entity names are always written in full caps in this source) means a
 * genuinely descriptive title that happened to end in "- REF:12345"
 * couldn't accidentally match — Spanish descriptive text always has
 * lowercase letters.
 */
const BARE_BUYER_REF_TITLE = /^[^a-z]+-\s*REF:\d+\s*$/;

/**
 * Titles that name no procurement at all — a bare company name, a bare
 * contract reference, or a generic word standing alone.
 *
 * From a real Colombian kept export (2026-09-07) where 19 tenders were
 * held in by their disclosed value alone: "OBRA", "CONTRATO DE OBRA",
 * "IRON MOUNTAIN COLOMBIA S.A.S.", "EP 0058-2026". A value says how much
 * was spent, never on what, so it cannot be the only thing keeping a row
 * that says nothing.
 *
 * Anchored to the WHOLE title, so a real description that happens to end
 * in a company name or contain the word "obra" is untouched.
 */
/**
 * SECOP II appends the procurement's current PHASE to the title —
 * "(Presentación de oferta)", "(Fase de Selección (Presentación de
 * ofertas))". It says nothing about what is being bought, and it was
 * enough to stop a bare reference code from looking bare: "LP-013-2026
 * (Fase de Selección (Presentación de ofertas))" read as a real title.
 */
function withoutProcurementPhase(title: string): string {
  return title.replace(/\s*\((?:fase de selecci[óo]n|presentaci[óo]n de oferta)[^)]*\)*\s*$/i, "").trim();
}

const NO_CONTENT_TITLE = [
  // A consortium's own name, which names a bidder rather than a purchase.
  /^\s*(?:uni[óo]n temporal|consorcio)\b/i,
  // A company name and nothing else: … S.A.S. / S.A. DE C.V. / LTDA / S.A.
  // No "i" flag on purpose — with it, [^a-z] stops matching uppercase too
  // and the pattern matches nothing at all. Requiring full caps is also the
  // right constraint here for the same reason BARE_BUYER_REF_TITLE gives:
  // entity names in these sources are written in caps, while a real
  // Spanish description always has lowercase letters in it.
  // The negative lookahead is what keeps a real description that merely
  // ENDS in a company name — "SUMINISTRO DE TRANSFORMADORES PARA
  // SUBESTACIÓN ELÉCTRICA S.A.S." — out of this: any procurement verb at
  // all means the title says what is being bought, so it is not a bare name.
  /^(?!.*\b(?:SUMINISTRO|ADQUISICI[ÓO]N|ADQUIRIR|CONSTRUCCI[ÓO]N|COMPRA|CONTRATAR|PRESTACI[ÓO]N|MANTENIMIENTO|REHABILITACI[ÓO]N|MODERNIZACI[ÓO]N|AMPLIACI[ÓO]N|SERVICIO)\b)[^a-z]{2,90}(?:S\.?A\.?S\.?|LTDA\.?|S\.?A\.? DE C\.?V\.?|S\.?A\.?)\s*$/,
  // A generic noun standing alone, with at most a leading verb/article.
  /^\s*(?:contrato de |contratar (?:la |el )?)?(?:obra|obras|servicio|servicios|suministro|suministros|compra|adquisici[óo]n|mantenimiento|convenio|proyecto)\s*$/i,
  // A bare reference code: "EP 0058-2026", "CAS-SS-LP-001-2026",
  // "AHLPOB05-026". Judged by shape rather than by a letter-count that any
  // new source's numbering scheme would break — a single token, no spaces,
  // containing a digit, and short. A real description always has spaces in
  // it, which is what keeps "CONSTRUCCION DE TANQUE" out of this.
  /^\s*[A-Z]{1,5}[\s-]?\d{1,6}(?:[-/]\d{1,6})*\s*$/,
  /^(?=\S*\d)[A-Za-z0-9][A-Za-z0-9.\-/_]{2,29}$/,
];

const INCLUDE_OVERRIDE_KEYWORDS = [
  /videovigilancia|video surveillance/i,
  // Narrowed (2026-09-04, real counter-example found): the bare phrase
  // also matched a real Colombia SECOP II summary — "PRESTACIÓN DE
  // SERVICIOS DE APOYO A LA GESTIÓN PARA EL DESARROLLO DE ACTIVIDADES DE
  // CONSERJERÍA, CONTROL DE ACCESO, APOYO LOGÍSTICO Y MANTENIMIENTO
  // BÁSICO..." — a ~US$476 bundled janitorial/reception-desk staffing
  // contract for one small hospital (the SAME text also contains
  // "conserjería", already an EXCLUDE_KEYWORDS routine-service term, but
  // hasIncludeOverride bypasses every exclude check unconditionally once
  // it matches anything). "Control de acceso" duty performed by a
  // person is not the same real-world thing as an access-control SYSTEM
  // purchase — now requires an equipment/system qualifier nearby, same
  // proximity-anchor approach as "seguridad perimetral"/"nube privada"
  // below. Still matches a genuine "SISTEMA DE CONTROL DE ACCESO
  // BIOMÉTRICO" / "EQUIPOS DE CONTROL DE ACCESO VEHICULAR" purchase.
  /(sistema(s)?|equipo(s)?|dispositivo(s)?|torniquete(s)?|lector(es)?|biom[ée]tric[oa]|electr[óo]nico|vehicular).{0,40}control de acceso|control de acceso.{0,40}(sistema(s)?|equipo(s)?|dispositivo(s)?|torniquete(s)?|lector(es)?|biom[ée]tric[oa])|access control system/i,
  /ciberseguridad|cybersecurity/i,
  // The same intent as "ciberseguridad" above, in the words real Compras MX
  // titles actually use. Added 2026-09-12 after the user found three open
  // INFOTEC procedures that this list was the only possible way back in for
  // (Compras MX publishes no value, and Mexico is in
  // UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL) and that named cybersecurity
  // without once saying "ciberseguridad":
  //   SERVICIO INTEGRAL DE PROTECCIÓN CONTRA AMENAZAS CIBERNÉTICAS
  //   SERVICIO INTEGRAL DE SEGURIDAD PARA DATOS CRÍTICOS Y CUENTAS PRIVILEGIADAS
  // Both are trade terms with no second meaning — "cuentas privilegiadas" is
  // privileged access management, "ciberataque" is nothing else — which is
  // why they are safe in a list whose matches bypass every exclude check.
  /cibern[ée]tic[oa]s?|ciberataque(s)?|ciberdefensa/i,
  /cuentas privilegiadas|gesti[óo]n de identidades|gesti[óo]n de accesos|privileged access/i,
  // Added on the second pass the same day, for the fourth of that INFOTEC
  // series: SERVICIO INTEGRAL DE PROTECCIÓN DE LA INFORMACIÓN Y GESTIÓN DE
  // RIESGOS (LA-55-91M-05591M001-N-27-2026). Held back on the first pass
  // because the phrase can also name archival, privacy and legal-compliance
  // work, and a term here bypasses every exclude check — but the user has
  // seen all four on Compras MX and wants all four kept
  // (保障这4条都在ICT白名单，确保导入不要被屏蔽), and that concern was a
  // prediction, not a measurement: adding it flips none of the 276 real
  // titles in lib/relevance-fixtures.ts, which include the Peru and Colombia
  // service exports this pattern was feared to catch.
  //
  // If it does start pulling in archival or personal-data work, the fix is a
  // qualifier, not a removal — these are genuine ICT security procurements
  // and the platform's own 行业 tag already agrees.
  /protecci[óo]n de (la )?informaci[óo]n|seguridad de la informaci[óo]n|information security/i,
  /centro(s)? de comando|command center/i,
  /seguridad electr[óo]nica|electronic security/i,
  // `centro(s)?`, not `centro` (2026-09-12): a real open Compras MX tender,
  // "SERVICIO PARA EL FORTALECIMIENTO DE LOS CENTROS DE DATOS DE INFOTEC"
  // (LA-55-91M-05591M001-N-24-2026), was excluded outright on the plural
  // alone — the row carries no value, Mexico is in
  // UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL, and this list was its only way
  // back in. Singularising the title flips it excluded -> flagship.
  //
  // An oversight rather than a judgement: the flagship datacenter pattern
  // further down already writes `centro(s)? de datos`, so the two spellings
  // of the same rule disagreed about the same words.
  /datacenter|centro(s)? de datos/i,
  /fibra [óo]ptica|fiber optic/i,
  // Anchored away from drug dosages (2026-09-11, two real Peru rows):
  // "INMUNOGLOBULINA HUMANA NORMAL 5g/100 mL" and "L-GLUTAMINA +
  // MALTODEXTRINA + LACTOBACILLUS REUTERI 10G + 5G" both matched the bare
  // word and were kept as telecom. A gram figure is either written as a rate
  // ("5g/100 mL") or follows another quantity in a list ("10G + 5G"); real
  // telecom usage ("RED 5G", "TECNOLOGÍA 5G") is neither.
  /(?<![\d+]\s?)\b5g\b(?!\s*[\/x×])/i,
  // Narrowed (2026-09-04, real counter-example found): the bare phrase
  // also matched a real CFE title — "MATERIALES PROFAUNA PARA
  // SUBESTACIONES" (wildlife-protection materials/fittings for
  // substations, e.g. anti-perching mesh) — a routine materials
  // purchase where "subestaciones" is only the delivery location, not
  // the actual object of procurement. Now requires a construction/
  // equipment/expansion qualifier nearby — still matches a genuine
  // "CONSTRUCCIÓN DE SUBESTACIÓN ELÉCTRICA"/"AMPLIACIÓN DE LA
  // SUBESTACIÓN"/"EQUIPAMIENTO DE SUBESTACIÓN" project.
  /(construcci[óo]n|ampliaci[óo]n|modernizaci[óo]n|rehabilitaci[óo]n|equipamiento|equipo(s)?|obra).{0,40}subestaci[óo]n|subestaci[óo]n.{0,40}(construcci[óo]n|ampliaci[óo]n|modernizaci[óo]n|rehabilitaci[óo]n|equipamiento|equipo(s)?|obra)|substation/i,
  /transmisi[óo]n el[ée]ctrica|power transmission/i,
  /\bepc\b/i,
  // Real ICT/telecom equipment whitelist — a batch of 29 real tender
  // titles the user provided (Mexico's CFE TEIT-style national telecom
  // buildout: RAN/BTS radio equipment, transport/core network gear,
  // towers and shelters), each a genuine hardware/infrastructure
  // purchase a Chinese ICT vendor would want visibility into. Protects
  // these from EXCLUDE_KEYWORDS/MIN_VALUE_USD the same way the existing
  // telecom/power terms above do; industry.ts's ict_telecom pattern was
  // extended alongside this so these also get tagged correctly.
  /\bran\b|\bbts\b|macro ran|micro ran|estaci[óo]n(es)? base/i, // Equipo de Radio Frecuencia Macro BTS (RAN); Macro/Micro RAN 4G LTE; Estaciones Base de Telecomunicaciones (BTS)
  /ruteador(es)?|\brouter(es)?\b|\bmifi\b/i, // ruteadores de gama alta/baja para Red Metropolitana/Red Nacional de Agregación/IXP; router Wifi portátil Mifi
  // Narrowed (2026-09-04, real counter-example found): the bare phrase
  // alone also matched "SERVICIO ADMINISTRADO DE VIRTUALIZACIÓN EN NUBE
  // PRIVADA Y COMPLEMENTOS OPERATIVO" — routine ongoing IT-ops support, not
  // the infrastructure-backup service the original confirmed example
  // ("Servicio de respaldo y recuperación para la Nube Privada") actually
  // was. Now requires "respaldo"/"recuperación"/"infraestructura" to also
  // appear nearby (either order, since the confirmed example has it as a
  // prefix) — still matches that real example, no longer matches the
  // ops-support one.
  /(respaldo|recuperaci[óo]n|infraestructura).{0,80}nube privada|nube privada.{0,80}(respaldo|recuperaci[óo]n|infraestructura)/i, // Servicio de respaldo y recuperación para la Nube Privada
  /red metropolitana|red de agregaci[óo]n|red terrestre core/i, // RED METROPOLITANA; Red Nacional de Agregación; Red Terrestre CORE para BTS
  /\bwdm\b|\bdwdm\b/i, // Transporte WDM para sitios Rurales; equipos DWDM para fase 4 de iluminación de FOO
  /enlaces? de microondas/i, // Adquisición y servicio de enlaces de microondas
  /antiddos|anti-ddos/i, // equipos ANTIDDoS de gama alta
  /caseta(s)? integral(es)? de comunicaciones|minicaseta(s)?/i, // Minicasetas/casetas Integrales de Comunicaciones
  /torres? (arriostrad|autosoportad)|infraestructura de telecomunicaciones (autosoportada|de r[áa]pido despliegue)/i, // materiales para torres arriostradas y autosoportadas; infraestructura de telecomunicaciones autosoportada/de rápido despliegue
  /\baicc\b|asistente virtual.{0,20}atenci[óo]n/i, // Servicio de asistente virtual para la atención a clientes (AICC)
  /firewall/i, // equipos firewall de siguiente generación
  /\bixp\b/i, // Ruteadores para IXP
  /internet gratuito/i, // equipos para la provisión del servicio de internet gratuito
  // Real batch #2, more mixed real titles the user evaluated as
  // legitimate opportunities — these two are SERVICES (not equipment),
  // so the scopeType==="equipment" allowlist-gate change below doesn't
  // cover them; they need an explicit override.
  // Narrowed (2026-09-04, real counter-example found): the bare phrase also
  // matched a plain "SERVICIO ADMINISTRADO DE SEGURIDAD PERIMETRAL" for SHF
  // (a mortgage/housing-finance buyer) — a routine outsourced facility
  // guard/fencing service, not the critical-infrastructure security system
  // the original confirmed example ("...PARA INSTALACIONES ESTRATÉGICAS")
  // actually was. Now requires an "instalaciones estratégicas"/"infraestructura
  // crítica" qualifier in the same title — still matches that confirmed
  // example, no longer matches a bare mention with no such qualifier.
  /seguridad perimetral.{0,80}(instalaci[óo]n(es)? estrat[ée]gica(s)?|infraestructura (cr[íi]tica|estrat[ée]gica))/i, // SERVICIO ADMINISTRADO DE SEGURIDAD PERIMETRAL PARA INSTALACIONES ESTRATÉGICAS — a real managed security-infrastructure service (fencing/sensors/cameras), not a routine guard-service contract
  /sistema de alarma.{0,40}incendio|detecci[óo]n y supresi[óo]n de incendio/i, // SISTEMA DE ALARMA, DETECCIÓN Y SUPRESIÓN DE INCENDIO DE LA GCRNE — industrial fire-safety system
];

/**
 * A narrower subset of INCLUDE_OVERRIDE_KEYWORDS: genuine ICT/electrical
 * EQUIPMENT purchases or infrastructure UPGRADES (not new critical-
 * infrastructure builds) that still deserve full protection from exclusion
 * and the value floor via hasIncludeOverride, but shouldn't automatically
 * jump straight to "flagship" just because their value happens to be
 * undisclosed — they cap at "significant" in that case instead. A real
 * disclosed value ≥ FLAGSHIP_VALUE_USD, or a genuine MAJOR_PROJECT_KEYWORDS
 * match, still promotes them to flagship normally — this only removes the
 * "undisclosed value ⇒ flagship" shortcut for these specific categories.
 *
 * Real gap (2026-09-05): "Suministro...modernización de la subestación
 * eléctrica" (no disclosed value) and "SOLICITUD DE COTIZACIÓN ADQUISICIÓN
 * DE CAMARAS DE VIDEO VIGILANCIA...PARA EL SISTEMA DE SEGURIDAD ELECTRÓNICA
 * DE LOS LICEOS DEL EJÉRCITO" (also no value) were both automatically
 * forced to flagship via hasIncludeOverride's undefined-value branch — but
 * a substation UPGRADE and a camera/CCTV PURCHASE are inherently smaller-
 * scope categories than the datacenter/national-network/EPC-scale signals
 * the rest of INCLUDE_OVERRIDE_KEYWORDS protects, which genuinely are
 * major regardless of one procurement notice's disclosed value. User's
 * explicit call: "如果是摄像头建议最多放重点项目" (if it's [just] cameras, cap at
 * significant at most).
 *
 * Widened same day (Mexico example): "IMPLEMENTACIÓN DE SOLUCIÓN DE
 * SISTEMAS DE SEGURIDAD ELECTRÓNICA TIPO VIDEOVIGILANCIA" (also no
 * value) — a full video-surveillance/electronic-security SYSTEM
 * implementation, not just a bare camera purchase, but the user's "也"
 * (also/same category) made clear this whole video-surveillance/
 * electronic-security theme belongs here, not just literal cameras —
 * moved the bare "videovigilancia"/"seguridad electrónica" terms out of
 * the flagship-forcing half of INCLUDE_OVERRIDE_KEYWORDS' unconditional
 * treatment and into this capped list instead.
 */
// Deliberately a NARROWER qualifier set than the INCLUDE_OVERRIDE_KEYWORDS
// substation pattern above (modernización/rehabilitación/equipamiento only
// — an UPGRADE of an existing substation — not construcción/ampliación/
// obra, which mean a NEW substation build and should keep the uncapped
// flagship-when-undefined treatment): a real fixture, "CONSTRUCCIÓN DE
// SUBESTACIÓN ELÉCTRICA DE POTENCIA" (a genuine new-build), regressed to
// "significant" when this first used the same broad qualifier list as
// INCLUDE_OVERRIDE_KEYWORDS — confirmed via the fixture suite, not assumed.
const EQUIPMENT_SCALE_CAPPED_KEYWORDS = [
  /(modernizaci[óo]n|rehabilitaci[óo]n|equipamiento).{0,40}subestaci[óo]n|subestaci[óo]n.{0,40}(modernizaci[óo]n|rehabilitaci[óo]n|equipamiento)/i,
  /c[áa]maras? de video( ?vigilancia)?|circuito(s)? cerrado(s)? de televisi[óo]n|\bcctv\b/i,
  /videovigilancia|video surveillance|seguridad electr[óo]nica|electronic security/i,
];

// Narrowed (2026-09-02) after the user gave an explicit "only these count
// as significant" whitelist of 13 real titles — all either genuine
// construction/infrastructure works or genuine medical/lab equipment.
// Dropped the two bare category alternatives that used to also promote to
// "significant" on their own — "energía|eléctrico|power" and
// "telecom|comunicaciones|datacenter" — since none of the 13 confirmed
// examples needed them and the user said "others will not be in the
// considerations." This doesn't touch flagship-tier protection for real
// power/telecom infrastructure: MAJOR_PROJECT_KEYWORDS (power plants,
// national/core networks, data centers) and INCLUDE_OVERRIDE_KEYWORDS (the
// real BTS/RAN/telecom-equipment batch) still promote those straight to
// flagship independent of this list. What's lost is only the weaker
// signal — a bare mention of "energía"/"telecom" with no other evidence —
// which is exactly what the user asked to stop counting.
/**
 * The broadest entry in FLAGSHIP_INDUSTRY_KEYWORDS, named so the municipal
 * rule below can ask specifically whether this — and only this — is what
 * kept a tender. In a real 2026-09-07 export it alone accounted for 262 of
 * 467 kept rows, 260 of them Mexican.
 */
/**
 * Seaport wording, as opposed to a town whose name begins with "Puerto".
 *
 * A bare "puerto" was matching place names, not ports (2026-09-08, from the
 * user's review of a 212-row kept export): two street-paving jobs in the
 * village of Puerto Rico, Campeche came out FLAGSHIP, and the same
 * mechanism promoted "SUMINISTRO DE ALIMENTOS EN PUERTO ESCONDIDO" — a
 * catering contract — to the top tier. Naming each town in
 * stripKnownFalsePositivePlaceNames() fixes them one at a time, always one
 * step behind the next town: Mexico has Vallarta/Escondido/Peñasco/Ángel/
 * Morelos, Colombia has Boyacá/Berrío/Asís/Gaitán/Carreño/Colombia/Tejada
 * and more. Per the user's decision (2026-09-08) this asks for port
 * CONTEXT instead, so an unseen town costs nothing.
 *
 * A place name reads "EN PUERTO RICO"; a real port reads "PUERTO DE
 * VERACRUZ" or carries port vocabulary outright. So:
 *   - "portuari…" (recinto/administración/terminal portuaria) — a town is
 *     never called that.
 *   - dragado/dársena/escollera/rompeolas — marine works nouns.
 *   - "puerto(s) de X", but only next to a works verb. The verb matters:
 *     "el puerto de Veracruz" is also how people refer to the CITY, so
 *     without it a catering contract there would land right back in the
 *     top tier — the exact bug this replaces.
 *
 *   - a named port. This is the half that makes the whole approach work:
 *     the ports are a short, stable list, while the towns called "Puerto
 *     something" are an open-ended one. "REPARACIÓN DE JUNTAS DE CALZADA EN
 *     PSV DEL PUERTO ALTAMIRA" is a real fixture the user set to
 *     "significant" (2026-09-07), and it is written in exactly the bare
 *     form the context rules above reject — so without the names, this
 *     change would have quietly overturned a decision the user had already
 *     made. Every entry stays anchored to the word "puerto", so a contract
 *     merely located in Cartagena or Veracruz does not match.
 *
 * Deliberately NOT included: "muelle", which is also the ordinary word for
 * a mechanical spring and appears in vehicle-parts tenders.
 */
const NAMED_PORTS_SOURCE =
  "puertos?\\s+(?:de\\s+)?(?:altamira|l[áa]zaro c[áa]rdenas|manzanillo|veracruz|coatzacoalcos|progreso|ensenada|mazatl[áa]n|tampico|dos bocas|salina cruz|topolobampo|guaymas|tuxpan|buenaventura|cartagena|barranquilla|santa marta)\\b";

/**
 * A works verb, required next to any port NAME (see PORT_WORKS_SOURCE).
 * "El puerto de Veracruz" is also what people call the city, so a name on
 * its own promoted "SUMINISTRO DE ALIMENTOS EN EL PUERTO DE VERACRUZ" — a
 * catering contract — to flagship. "mantenimiento" is deliberately absent:
 * MAINTENANCE_ONLY_KEYWORDS drops maintenance-only tenders earlier, and
 * listing it here would have this rule arguing with that one.
 */
const PORT_WORKS_VERB_SOURCE =
  "construcci[óo]n|ampliaci[óo]n|modernizaci[óo]n|rehabilitaci[óo]n|reparaci[óo]n|remodelaci[óo]n|dragado|\\bobras?\\b";

const PORT_NAMED_SOURCE = `${NAMED_PORTS_SOURCE}|puertos?\\s+de\\b`;

const PORT_WORKS_SOURCE =
  `portuari|d[áa]rsena|escollera|rompeolas` +
  `|(?:${PORT_WORKS_VERB_SOURCE})[^.]{0,60}(?:${PORT_NAMED_SOURCE})` +
  `|(?:${PORT_NAMED_SOURCE})[^.]{0,60}(?:${PORT_WORKS_VERB_SOURCE})`;

const BARE_WORKS_WHITELIST = new RegExp(
  `construcci[óo]n|carretera|puente|ferrocarril|aeropuerto|${PORT_WORKS_SOURCE}`,
  "i",
);

const FLAGSHIP_INDUSTRY_KEYWORDS = [
  // Bare "infraestructura" dropped (2026-09-05, real false positive): the
  // user flagged "AMPLIACIÓN Y MODERNIZACIÓN DE LA INFRAESTRUCTURA
  // TECNOLÓGICA DEL SISTEMA DE VIDEOVIGILANCIA..." ($773K) as wrongly
  // promoted to "significant" via this bare word alone — "infraestructura
  // tecnológica" is a generic phrase (also seen as "infraestructura
  // educativa"/"infraestructura hospitalaria" elsewhere in this file's own
  // EXCLUDE_KEYWORDS comments), a much weaker signal than the concrete
  // construction/works nouns kept below, which genuinely denote large
  // projects on their own.
  BARE_WORKS_WHITELIST,
  // Highway work identified only by chainage, with no word for "road" in
  // the title at all: 'MODERNIZACION DEL KM 0+000 AL KM 3+500 CON UNA
  // LONGITUD DE 3.5 KM'. Anchored on modernización/ampliación immediately
  // before a KM marker so it can't match a generic "modernización" of
  // anything else.
  /(modernizaci[óo]n|ampliaci[óo]n)\s+del?\s+(cuerpo\s+del?\s+)?km\s*\d/i,
  // "PAV CAM …" (pavimentación de camino) was listed here as a flagship
  // signal, on the reading that a road job is major-project work. Removed
  // 2026-09-08: the user's later, explicit rule excludes exactly this work
  // when it is spelled out — "PAVIMENTACIÓN CON CONCRETO HIDRÁULICO DEL
  // CAMINO LOCAL" is a fixture, expected "excluded" — so keeping the
  // abbreviation whitelisted meant the identical job was kept or dropped
  // according to how the clerk typed it. A camino is not a carretera;
  // "carretera" stays in BARE_WORKS_WHITELIST, so real highway work is
  // untouched by this.
  // Geophysical survey equipment — 'ADQUISICIÓN DE UN SISTEMA DE
  // RESISTIVIDAD', a resistivity system used for groundwater and
  // geotechnical surveying. From the user's 2026-09-07 confirmed list.
  /sistema de resistividad|geof[íi]sic[oa]/i,
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
  // "equipo medio" is a real, recurring Compras MX typo for "equipo médico"
  // — 'ADQUISICION DE EQUIPO MEDIO Y DE LABORATORIO PARA LAS UNIDADES
  // MÉDICAS' (2026-09-07). Listed explicitly rather than loosening the
  // stem, because "medi…" would also catch "medicamento", a consumable
  // this list deliberately excludes.
  /equipo(s)? m[ée]dico|equipo(s)? m[ée]dio\b|equipamiento m[ée]dico|medical equipment|equipo(s)? de laboratorio/i,
  // hemodiálisis/hemodinamia removed from this whitelist 2026-09-07
  // (user-confirmed): every real title carrying them was a SERVICE —
  // "SERVICIOS MEDICOS DE ESPECIALIZACION (HEMODIALISIS)", "FORTALECIMIENTO
  // A LOS SERVICIOS DE HEMODINAMIA", "SMI DE HEMODINAMIA" — and this
  // platform targets medical EQUIPMENT. They are excluded below instead.
  /bomba de infusi[óo]n|ventilador pulmonar/i,
  /imagenolog[íi]a|radiolog[íi]a|tomograf[íi]a|resonancia|ultrasonido|rayos x/i,
  // Vehicle-fleet purchases — restored to the whitelist per the user's
  // explicit request (2026-09-04: "加入车辆相关的标书，比如说政府购车、
  // 公交车、货车、SUV等等，但要避免触发车辆相关的项目比如加油和保养").
  // These were "standard"-tier until the 2026-09-02 elimination of that
  // tier moved them to "excluded" (see the ADQUISICIÓN DE VEHÍCULOS
  // fixture below) — this brings genuine vehicle PURCHASES back as a
  // "significant" signal, same mechanism as construction/medical
  // equipment above, without reopening the door to routine vehicle
  // services. Deliberately anchored to a purchase/acquisition verb
  // (adquisición/adqs./compra/suministro) immediately followed by a
  // vehicle noun — NOT a bare "vehículo" mention anywhere in the title —
  // so a maintenance/fuel/insurance/rental/tire job that happens to
  // mention a vehicle can't match this. Those already get excluded
  // earlier in this same classifyRelevance() pipeline regardless
  // (EXCLUDE_KEYWORDS: "servicio de mantenimiento", "combustible para el
  // parque vehicular", "arrendamiento de vehículos", "neumáticos para
  // vehículos") — this whitelist entry is only ever reached once none of
  // those already excluded the tender. "camioneta"/"pick up"/"SUV"/
  // "furgoneta" match industry.ts's own widened "vehicles" tag.
  //
  // "maquinaria pesada" (heavy machinery — excavators, bulldozers, etc.)
  // added back into the SAME anchored pattern per the user's follow-up ask
  // (2026-09-04): a PURCHASE of heavy machinery is the same real category
  // as a vehicle purchase, but "arrendamiento/renta de maquinaria pesada"
  // (rental) or a bare maintenance mention still isn't caught by this
  // pattern (no purchase verb) and falls through to the bottom exclusion
  // exactly like vehicle rental does — see the regression fixture below.
  //
  // Gap between the verb and the noun tightened from "any text, up to 40
  // chars" to "only digits/quotes/whitespace, up to 15 chars" (2026-09-04,
  // real false positive the user caught): "ADQUISICIÓN DE COMBUSTIBLES Y
  // LUBRICANTES PARA VEHÍCULOS Y EQUIPOS TERRESTRES" — a fuel purchase, not
  // a vehicle purchase — matched the old loose gap because "vehículos"
  // appeared only 32 characters after "de", well inside the old 40-char
  // allowance, via the "para vehículos" trailing modifier rather than as
  // the actual object being acquired. The tightened gap only allows what a
  // real quantity/quote prefix looks like ("22 ", "'") between the verb and
  // the noun — see "ADQS. DE 22 VEHS. CISTERNA..." in industry.ts's own
  // comment — so the noun has to be the immediate object of the purchase,
  // not a modifier buried later in the sentence. Every existing fixture
  // still matches (the noun always follows "de" directly, at most after a
  // number), confirmed by the passing test suite.
  // "excavadora"/"retroexcavadora"/"grúa" named alongside the existing
  // "maquinaria pesada": the user's 2026-09-04 ask was for heavy-machinery
  // PURCHASES as a category, and a real PEMEX title (2026-09-07) named the
  // machine directly rather than using the generic phrase. Same anchored
  // pattern, so "arrendamiento de excavadora" (rental) still isn't caught.
  // Three widenings from a real 2026-09-07 list of titles the user
  // confirmed should never have been excluded:
  //   · the gap now tolerates a leading article and CURLY quotes —
  //     'ADQUISICIÓN DE “CAMIÓN COSTERO MÍNIMO 41 PASAJEROS' missed only
  //     because the typographic quote Compras MX pastes in is not the ASCII
  //     one the old class allowed, and 'DE UN SISTEMA…' missed on the "un";
  //   · patrulla/automóvil join the vehicle nouns (motocicleta was added
  //     with them and removed hours later: the user marked "ADQUISICION DE
  //     MOTOCICLETAS Y ACCESORIOS" as one to exclude, and the police-fleet
  //     title that motivated the addition matches on "patrullas" anyway,
  //     being the noun immediately after the verb) —
  //     'ADQUISICION DE PATRULLAS PICK UPS, AUTOMOVILES Y MOTOCICLETAS' put
  //     "patrullas" first, and the anchored gap only ever looks at the noun
  //     immediately after the verb, so the "pick ups" further along never
  //     counted.
  /(adquisici[óo]n|adqs?\.?|compra|suministro)\s+de\s+(?:(?:un|una|el|la|los|las)\s+)?[\d'"“”‘’\s]{0,15}(veh[íi]culo(s)?|vehs\.?\b|autob[úu]s(es)?|cami[óo]n(es)?|camioneta(s)?|pick\s?-?up(s)?|\bsuv(s)?\b|furgoneta(s)?|patrulla(s)?|autom[óo]vil(es)?|maquinaria pesada|(retro)?excavadora(s)?|gr[úu]a(s)?)/i,
  // Power-grid key equipment — added per the user's explicit request
  // (2026-09-04: "白名单加入电力相关的关键设备：变压器、发电机、继电保护器等"
  // then "还有UPS"). Same anchored purchase-verb pattern and reasoning as
  // vehicles above — a genuine ACQUISITION of a transformer/generator/
  // protection relay/UPS promotes to significant; "mantenimiento de
  // transformadores" (maintenance) still isn't caught here (no purchase
  // verb) and falls through to the existing broad maintenance
  // EXCLUDE_KEYWORDS pattern earlier in this pipeline, same as vehicle
  // maintenance. This reverses the ADQUISICIÓN DE TRANSFORMADORES DE
  // POTENCIA fixture below from "excluded" to "significant" — it was
  // "excluded" only because no whitelist pattern covered bare power
  // equipment nouns after the Seventh pass removed the old, much broader
  // "energía|eléctrico|power" bare-word signal; this is a narrower,
  // deliberately re-added replacement for that one real equipment class.
  /(adquisici[óo]n|adqs?\.?|compra|suministro)\s+de\s+(?:(?:un|una|el|la|los|las)\s+)?[\d'"“”‘’\s]{0,15}(transformador(es)?|generador(es)?|rel[ée]s? de protecci[óo]n|relevador(es)? de protecci[óo]n|\bups\b)/i,
  // Power-grid and generation ASSETS, as opposed to the equipment purchase
  // above. Added 2026-09-11 after the user asked why the platform held one
  // electricity project when CFE plainly had open ones: every CFE tender
  // arrives from DOF, DOF publishes no value at all, and Mexico is in
  // UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL — so with no whitelist term to
  // rescue them, they all fell out. Measured against real titles: a bare
  // "subestación eléctrica", "línea de transmisión 400 kV", "central de
  // ciclo combinado" and "parque eólico" were ALL excluded, while the
  // industry classifier had already tagged every one of them `power`. The
  // 2026-09-04 pass added transformers/generators/relays/UPS but only when
  // anchored to a purchase verb, which covers buying a component and not
  // building or extending the grid itself.
  //
  // Concrete asset nouns only, deliberately. The Seventh pass removed a bare
  // "energía|eléctrico|power" signal for being far too broad and that
  // judgement stands; none of these can appear except on real grid or
  // generation work. "electrificación" is also left out on purpose — Peru's
  // Invierte.pe names household rural-electrification programmes that way,
  // and those are small; the Mexican works titles that matter carry
  // "construcción de obras" and are kept by the construction term already.
  /\bsubestaci[óo]n(es)?\b/i,
  /l[íi]nea(s)? de (sub)?transmisi[óo]n|red(es)? de (transmisi[óo]n|distribuci[óo]n) el[ée]ctrica/i,
  // "CENTRAL CICLO COMBINADO POZA RICA" drops the "de", so it is optional.
  /central(es)? (de )?(ciclo combinado|termoel[ée]ctrica|hidroel[ée]ctrica|geotermoel[ée]ctrica|nucleoel[ée]ctrica|el[ée]ctrica|generadora)s?/i,
  /parque(s)? e[óo]lico|central(es)? e[óo]lica/i,
  // A stated voltage is only ever written on grid work — no routine purchase
  // describes itself in kV. Bounded to 1-4 digits so a catalogue code cannot
  // masquerade as one.
  /\b\d{1,4}(\.\d+)?\s?kv\b/i,
  // ---- The four CFE scenarios the user named on 2026-09-11 after the first
  // real DOF pull kept 4 of 33: 发电 / 输电 / 配电 / 逆变器. Every term below
  // is an electrical asset noun, for the same reason as the block above —
  // nothing here can appear except on real power work. ----
  //
  // 发电 (generation). "caldera" is qualified on purpose: an unqualified one
  // is just as likely to be a hospital's hot-water boiler.
  /turbina(s)?\b|turbogenerador(es)?|generador(es)? de vapor|alternador(es)? (s[íi]ncrono|el[ée]ctrico)/i,
  /caldera(s)? (acuotubular|recuperadora|de vapor|de recuperaci[óo]n)|recuperador(a)? de calor|\bhrsg\b/i,
  /unidad(es)? generadora(s)?|planta(s)? de generaci[óo]n|grupo(s)? electr[óo]geno(s)?/i,
  //
  // 输电 (transmission). Switchgear and line hardware — an interruptor de
  // potencia or a seccionador is substation plant, not a wall switch.
  /torre(s)? de transmisi[óo]n|estructura(s)? (de|para) (l[íi]nea(s)? de )?transmisi[óo]n/i,
  /interruptor(es)? de potencia|seccionador(es)?|cuchilla(s)? desconectadora(s)?|apartarrayos?|pararrayos de l[íi]nea/i,
  /l[íi]nea(s)? (de )?(alta|media) tensi[óo]n|\bcable de guarda\b|conductor(es)? acsr|\bacsr\b|\bsf ?6\b/i,
  //
  // 配电 (distribution). Every one of these REQUIRES an electrical qualifier.
  // A bare "redes de distribución" is exactly how Invierte.pe names small
  // Peruvian rural distribution programmes ("REDES DE DISTRIBUCION PRIMARIA
  // Y SECUNDARIA EN EL CENTRO POBLADO..."), so admitting it would flood Peru
  // behind a Mexican fix — the same trap that kept "electrificación" out.
  /red(es)? (el[ée]ctrica(s)?|de distribuci[óo]n el[ée]ctrica)|circuito(s)? de distribuci[óo]n el[ée]ctrica/i,
  /alimentador(es)? (el[ée]ctrico|primario|de distribuci[óo]n)|transformador(es)? de distribuci[óo]n/i,
  /centro(s)? de transformaci[óo]n|celda(s)? de (media|alta) tensi[óo]n|tablero(s)? de (media|alta) tensi[óo]n/i,
  //
  // 逆变器 (inverters). Anchored deliberately: bare "inversores" is ALSO the
  // ordinary Spanish word for investors, and a financing notice is not a
  // tender. Either an electrical qualifier, or the purchase-verb frame the
  // transformer rule above already uses.
  /inversor(es)? (fotovoltaico|solar|central|de (corriente|potencia|red|string))/i,
  /(adquisici[óo]n|adqs?\.?|compra|suministro)\s+de\s+(?:(?:un|una|el|la|los|las)\s+)?[\d'"“”‘’\s]{0,15}inversor(es)?\b/i,
];

// USD-scale thresholds (the whole platform standardizes display and
// classification on USD — see lib/currency.ts). Any value is normalized
// through that shared, approximate rate table before comparing — without
// it, e.g. a real COP 57,333,333 tender (worth roughly USD 13,650) would
// be compared directly against a threshold sized for MXN/USD-scale
// figures and wildly over-classified.
//
// Raised again (2026-09-05, per the user's explicit three-band scheme,
// applied to Mexico and Colombia alike — "哥伦比亚+墨西哥通用"). Raised
// 2026-09-12 on the user's explicit call (感觉500,000以上的太多了): the bands
// are now 常规 $800,000–$3M, 中型 $3M–$6M, 大型 over $6M. Previously
// 500,000/1,000,000/5,000,000, and before that 1,000,000/250,000 (see the
// "standard eliminated" note further down, now reversed — "standard" is a
// real output tier again). A keyword match (MAJOR_PROJECT_KEYWORDS,
// FLAGSHIP_INDUSTRY_KEYWORDS, INCLUDE_OVERRIDE_KEYWORDS) still promotes
// independent of value, same as before — these bands only govern what a
// disclosed value alone is worth. Paired with MAJOR_PROJECT_KEYWORDS
// below, which promotes to flagship on a keyword/duration match alone,
// independent of value.
const FLAGSHIP_VALUE_USD = 6_000_000;
const SIGNIFICANT_VALUE_USD = 3_000_000;

/**
 * "大项目" (major-project) keyword signal — promotes straight to flagship
 * regardless of value, per the user's explicit list (2026-09-02): railway,
 * long-distance highway/pipeline, dam/reservoir, power plant, airport,
 * large/national network, data center, core network, bridge, port,
 * national cloud. Several of these (aeropuerto/puente/puerto/datacenter)
 * already appear in FLAGSHIP_INDUSTRY_KEYWORDS, but that list only
 * promotes to "significant", not "flagship" — this is a distinct,
 * deliberately higher bar.
 *
 * Two items on the user's original list are NOT encoded here:
 * - "多期项目(2期以上)" (multi-phase, 2+ stages) — dropped after a real
 *   counter-example surfaced in the same conversation: "CONSTRUCCIÓN DE
 *   BARDA PERIMETRAL EN LA UABJO 2A. ETAPA" is a small perimeter-fence
 *   job that happens to be its second phase, not a major project. Phase
 *   count alone isn't a reliable size signal without a real project-type
 *   anchor, so it's left out rather than encoded and risk false
 *   promotions exactly like that example.
 * - "大规模项目(数量大或距离长)" (large quantity or long distance) — too
 *   vague to encode as a keyword; the concrete distance-based cases the
 *   user listed (公路/排水/铁路/油管道) are covered by the highway/
 *   pipeline/railway patterns below and by industry.ts's own long-haul
 *   signals (e.g. the "\bkm\s*\d+\+\d{3}\b" alignment-notation pattern).
 */
// Bare-word entries below (aeropuerto/presa/puente/puerto/etc.) allow an
// optional trailing "s" — found as a real gap (2026-09-02) while
// verifying the isWorksLike-fallback removal above: a real title
// ("DRAGADO DE DESAZOLVE DE LOS PUERTOS DE CHUBURNA Y CHABIHAU" — port
// dredging, genuinely major-project work) used the plural "PUERTOS",
// which the un-pluralized \bpuerto\b never matched.
const MAJOR_PROJECT_KEYWORDS = [
  /ferrocarril|v[íi]a f[ée]rrea|tren (de carga|el[ée]ctrico|interurbano)/i, // 建铁路
  /construcci[óo]n de (la )?(carretera|autopista)|autopista de cuota|libramiento carretero/i, // 建长距离公路 — anchored to "construcción", not maintenance
  /\bpresas?\b|\brepresas?\b|\bembalses?\b/i, // 建水库、建水坝
  /plantas? (de generaci[óo]n|termoel[ée]ctrica|hidroel[ée]ctrica|e[óo]lica|fotovoltaica|de ciclo combinado)|central(es)? (el[ée]ctrica|de generaci[óo]n)/i, // 建电站
  /aeropuertos?\b/i, // 建机场
  /redes? (nacional(es)?|de [áa]mbito nacional)|backbone nacional|infraestructura de red nacional/i, // 建大型或国家网络
  // Narrowed (2026-09-05, real false positive): the bare phrase alone also
  // matched "Modernización datacenter" ($713K) — an upgrade of an EXISTING
  // datacenter is not the same real category as building a new one, and
  // shouldn't force flagship regardless of value the way a genuine new-build
  // does. Now requires a construction/new-build qualifier nearby (either
  // order) — still matches "CONSTRUCCIÓN DE UN NUEVO CENTRO DE DATOS
  // NACIONAL", no longer matches a bare "modernización"/"ampliación"/
  // "mantenimiento" of one. A modernization project still isn't excluded
  // outright: it's protected from EXCLUDE_KEYWORDS by INCLUDE_OVERRIDE_KEYWORDS
  // (datacenter|centro de datos, unchanged there) and gets tagged
  // ict_telecom by industry.ts, just no longer an automatic flagship.
  /(construcci[óo]n|nuevo|nueva).{0,30}(centro(s)? de datos|datacenter)|(centro(s)? de datos|datacenter).{0,30}(construcci[óo]n|nuevo|nueva)/i, // 建数据中心
  /redes? (troncal(es)?|core|n[úu]cleo)|core network/i, // 建核心网络
  // Narrowed (2026-09-05, real explicit call): "puente(s) peatonal(es)"
  // (pedestrian bridge/overpass) never counts as this MAJOR_PROJECT
  // 建桥 signal — a pedestrian bridge is inherently smaller-scale than a
  // vehicular/railway bridge, confirmed via a real title ("CONSTRUCCIÓN
  // PUENTE PEATONAL ESTACIÓN 3 SIST.INTERCONECTADO ELECTROMOVILIDAD L-5")
  // the user explicitly said should never be flagship. Still counts
  // toward FLAGSHIP_INDUSTRY_KEYWORDS's bare "puente" below (unchanged),
  // so a disclosed value still promotes it to "significant" normally —
  // this only removes the value-independent flagship shortcut.
  /\bpuentes?\b(?!\s+peatonal(es)?)/i, // 建桥
  new RegExp(PORT_WORKS_SOURCE, "i"), // 建港口 — see PORT_WORKS_SOURCE for why this is not a bare "puerto"
  /nubes? (nacional(es)?|de gobierno|gubernamental(es)?)|national cloud|government cloud/i, // 国家云
  /oleoductos?|gasoductos?|poliductos?/i, // long-distance pipeline, the concrete "distancia larga" case the user named
];

/**
 * Real-world contract duration is almost never a clean structured field
 * on any source this project ingests (see types/tender.ts —
 * submissionDeadline is the BID window, a different real concept from
 * "plazo de ejecución"/execution period). This only fires on an explicit,
 * anchored real phrase ("plazo de ejecución: 400 días" and similar) —
 * deliberately NOT a bare "\d+ días" scan, since an unrelated day count
 * (e.g. a delivery lead time for goods) would otherwise be
 * misinterpreted as project duration. Added defensively per the user's
 * explicit ask (长工期/短工期项目按天数) — not yet confirmed against a
 * real title carrying this phrasing; revisit if it never fires on real
 * data.
 */
const DURATION_ANCHOR =
  /(plazo de ejecuci[óo]n|plazo de entrega|plazo contractual|vigencia del contrato|duraci[óo]n del contrato)[^.\n]{0,25}?(\d{1,4})\s*d[íi]as/i;

function extractAnchoredDurationDays(text: string): number | undefined {
  const match = DURATION_ANCHOR.exec(text);
  if (!match) return undefined;
  const days = Number(match[2]);
  return Number.isFinite(days) ? days : undefined;
}

/** 长工期或长交期项目(360天以上) — a major-project signal on its own, independent of MAJOR_PROJECT_KEYWORDS/value. */
const LONG_DURATION_DAYS = 360;
/** 短工期或短交期项目(180天以下) — blacklisted per the user's explicit call, same extraction helper as the long-duration signal above. */
const SHORT_DURATION_DAYS = 180;

/**
 * Real gap found 2026-09-04: a bare "puente"/"puentes" mention in
 * MAJOR_PROJECT_KEYWORDS (relevance tier) and the construction pattern
 * (industry.ts) promotes/tags regardless of the bridge's actual size — real
 * title "CONSTRUCCION DE PUENTE TUBULAR DE 18.00 MTS. DE LARGO X 4.00 MTS."
 * is an 18-meter tubular culvert, not a real bridge project, but "puente"
 * alone was enough to promote it straight to flagship. Same anchored-
 * extraction approach as DURATION_ANCHOR above — only fires on an explicit
 * "puente ... de N mts/metros de largo" phrase, never a bare number scan.
 */
const BRIDGE_LENGTH_ANCHOR =
  /puentes?\s+(?:tubular(?:es)?\s+|vehicular(?:es)?\s+|peatonal(?:es)?\s+)?de\s+(\d+(?:\.\d+)?)\s*(?:mts?|metros)\.?\s+de\s+largo/i;

function extractAnchoredBridgeLengthMeters(text: string): number | undefined {
  const match = BRIDGE_LENGTH_ANCHOR.exec(text);
  if (!match) return undefined;
  const meters = Number(match[1]);
  return Number.isFinite(meters) ? meters : undefined;
}

/** 桥梁长度低于30米 — per the user's explicit call (2026-09-04), a real small culvert/tubular-bridge job, not the kind of bridge project "puente" is meant to signal. */
const SHORT_BRIDGE_METERS = 30;

/**
 * A real, known contract value under this floor isn't worth a Chinese
 * enterprise's time to fly out and bid on, regardless of industry.
 * Raised to 500,000 (2026-09-05, per the user's explicit call: "墨西哥
 * $100K 也改成跟哥伦比亚一样的金额要求") — previously 100,000 platform-wide
 * with a separate Colombia-only override at 500,000 (added 2026-09-04
 * after a real Colombia SECOP II import showed the $100,000 floor was
 * still too low there in aggregate); now unified to one floor for every
 * country, so the per-country override map this replaced is gone rather
 * than left as a redundant Colombia-equals-default entry. Still well
 * below SIGNIFICANT_VALUE_USD, so it only catches genuinely small
 * purchases, not the flagship/significant contracts those tiers are
 * meant to surface. Deliberately does NOT apply when estimatedValue is
 * missing (most Mexican open-tenders rows carry no value at all —
 * absence isn't evidence of smallness) or when hasIncludeOverride
 * matched (the same override that protects a flagged technical category
 * from EXCLUDE_KEYWORDS should also protect it from being dismissed on
 * value alone).
 */
/**
 * Countries whose source routinely publishes NO amount at all, where an
 * undisclosed value therefore carries no information and must not by itself
 * keep a tender in the feed.
 *
 * The platform-wide floor deliberately does not fire on a missing value —
 * "absence isn't evidence of smallness". That reasoning holds for Colombia,
 * where SECOP II publishes values and a blank one is unusual, and the user
 * drew the line explicitly on 2026-09-07: "不是没金额就 Standard，这是只应用于
 * 哥伦比亚的逻辑，墨西哥不能这么做".
 *
 * Mexico was the first country where it broke down (Compras MX obra pública
 * publishes no amount, so the strongest filter this classifier has simply
 * never ran on it). Peru joined on 2026-09-11 on measured evidence, not by
 * analogy: the first real OECE import was 8620 records, 3776 of them (43.8%)
 * carrying no `tender.value.amount` at all, and 571 of the 1295 kept rows
 * were held in by nothing but an industry tag on a no-value row — wooden
 * doors, a generator, nursing-agency staffing, an excavator rental.
 *
 * Membership is a claim about one SOURCE's publishing habits, so it is
 * decided per country from a real import and never assumed for a new one.
 */
const UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL = new Set(["Mexico", "Peru"]);

const MIN_VALUE_USD = 800_000;

// zh tier names renamed 2026-09-05 per explicit user request
// ("重点项目"->"中型项目", "旗舰项目"->"大型项目") — see the same-day comment
// in lib/tender-labels.ts. This LABELS object is written into each
// tender's own stored relevance_label column at classify time, so
// existing rows keep the OLD zh text until a "重新分类" run recomputes
// them — only lib/tender-labels.ts's RELEVANCE_TIER_LABELS (used for
// filter chips/dropdowns, looked up live by tier key, never stored)
// takes effect immediately.
const LABELS: Record<TenderRelevance["tier"], LocalizedText> = {
  flagship: {
    zh: "大型项目 · 建议中资企业重点关注",
    en: "Flagship Project",
    es: "Proyecto Insignia",
  },
  significant: {
    zh: "中型项目 · 中资出海相关度较高",
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

/** Takes the threshold as a parameter (rather than reading MIN_VALUE_USD directly) purely so the reason text can't drift out of sync if that constant ever changes again — unlike every other reason here, which is a fixed message. */
function valueExcludedReason(thresholdUsd: number): LocalizedText {
  const formatted = thresholdUsd.toLocaleString("en-US");
  return {
    zh: `该项目预估金额低于 $${formatted} 美元，规模过小，通常不值得中资企业专门出海投标，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `Estimated value is under $${formatted} — too small to be worth bidding on from abroad, filtered from the default feed (metadata is kept, not deleted).`,
    es: `El valor estimado es menor a $${formatted} — demasiado pequeño para justificar una oferta desde el extranjero, filtrada de la vista predeterminada (los metadatos se conservan).`,
  };
}

const EXCLUDED_REASON_BY_SIGNAL: Record<
  "keyword" | "industry" | "no_content" | "short_duration" | "short_bridge" | "buyer" | "consulting" | "undisclosed_value",
  LocalizedText
> = {
  no_content: {
    zh: "该记录只包含发标单位和参考编号，没有任何描述标的物的信息（数据源本身如此，非抓取遗漏），无法判断相关性，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This record only carries a buyer name and a reference number — the real source data has no description of what's being procured at all (not a scraping gap), so there's nothing to judge relevance from. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Este registro solo tiene el nombre de la entidad y un número de referencia — la fuente real no incluye ninguna descripción de lo que se está contratando (no es un problema de captura), así que no hay nada de qué juzgar relevancia. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  keyword: {
    zh: "该项目属于日常性服务采购，通常不属于中资企业出海投标的重点范围，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This is a routine service procurement, not typically the kind of opportunity worth deep review — filtered from the default feed (metadata is kept, not deleted).",
    es: "Esta es una contratación de servicios rutinarios, no del tipo de oportunidad que suele valer una revisión a fondo — filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  undisclosed_value: {
    zh: "该项目未披露预估金额，且未命中任何重点行业或大型项目关键词，无法判断规模，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This tender discloses no estimated value and matched no priority-industry or major-project signal, so there is nothing to size it by — filtered from the default feed (metadata is kept, not deleted).",
    es: "Esta licitación no revela valor estimado y no coincidió con ninguna señal de sector prioritario ni de proyecto mayor, así que no hay con qué dimensionarla — filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  industry: {
    zh: "该项目未匹配到任何重点行业，且没有可参考的预估金额，信息过少，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This tender doesn't match any priority industry and carries no estimated value — too little signal to surface by default (metadata is kept, not deleted).",
    es: "Esta licitación no coincide con ningún sector prioritario y no tiene valor estimado — muy poca señal para mostrarla por defecto (los metadatos se conservan).",
  },
  short_duration: {
    zh: `该项目的执行/交付周期低于 ${SHORT_DURATION_DAYS} 天，规模通常偏小，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `This tender's execution/delivery period is under ${SHORT_DURATION_DAYS} days — usually too small in scope, filtered from the default feed (metadata is kept, not deleted).`,
    es: `El plazo de ejecución/entrega de esta licitación es menor a ${SHORT_DURATION_DAYS} días — normalmente de escala reducida, filtrada de la vista predeterminada (los metadatos se conservan).`,
  },
  short_bridge: {
    zh: `该项目是一座长度低于 ${SHORT_BRIDGE_METERS} 米的桥梁/涵洞，规模过小，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `This is a bridge/culvert under ${SHORT_BRIDGE_METERS} meters long — too small in scope, filtered from the default feed (metadata is kept, not deleted).`,
    es: `Este es un puente/alcantarilla de menos de ${SHORT_BRIDGE_METERS} metros de largo — de escala demasiado reducida, filtrada de la vista predeterminada (los metadatos se conservan).`,
  },
  buyer: {
    zh: "该采购单位的标的物通常是民生消费品/日用品（非工业或基建类），默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This buyer's procurement is typically consumer/household goods for a social program, not an industrial or infrastructure opportunity — filtered from the default feed (metadata is kept, not deleted).",
    es: "Las contrataciones de esta entidad suelen ser bienes de consumo/hogar para un programa social, no una oportunidad industrial o de infraestructura — filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  consulting: {
    zh: "该项目属于纯咨询/研究/规划类服务（非设备采购或工程施工），默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This is a pure consulting/study/planning service, not an equipment purchase or construction contract — filtered from the default feed (metadata is kept, not deleted).",
    es: "Esta es una contratación de consultoría/estudio/planeación, no una compra de equipo ni una obra de construcción — filtrada de la vista predeterminada (los metadatos se conservan).",
  },
};

function reasonFor(
  tier: TenderRelevance["tier"],
  signal:
    | "value"
    | "scope"
    | "industry"
    | "keyword"
    | "no_content"
    | "short_duration"
    | "short_bridge"
    | "buyer"
    | "consulting"
    | "undisclosed_value"
    | "none",
  /** Only meaningful for signal === "value" — the actual per-country threshold this tender was measured against (see MIN_VALUE_USD_BY_COUNTRY). */
  valueThresholdUsd: number = MIN_VALUE_USD,
): LocalizedText {
  if (tier === "excluded") {
    if (signal === "value") return valueExcludedReason(valueThresholdUsd);
    return EXCLUDED_REASON_BY_SIGNAL[
      signal === "industry" ||
      signal === "undisclosed_value" ||
      signal === "no_content" ||
      signal === "short_duration" ||
      signal === "short_bridge" ||
      signal === "buyer" ||
      signal === "consulting"
        ? signal
        : "keyword"
    ];
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

/**
 * Peru's SEACE titles routinely name the umbrella PROJECT a purchase belongs
 * to, after the thing actually being bought:
 *
 *   "ADQUISION DE DIESEL B5 S50 PARA EL PROYECTO MEJORAMIENTO DE LA
 *    TRANSITABILIDAD VEHICULAR DE LA CARRETERA PAUCARTAMBO ..."
 *   "ADQUISICION DE DIVERSOS MUEBLES DE MELAMINE ... PARA LA OBRA
 *    CONSTRUCCION INFRAESTRUCTURA ..."
 *   "SERVICIO DE ALQUILER DE EXCAVADORA SOBRE ORUGA ... PARA EL PROYECTO ..."
 *
 * The contract is for diesel, furniture and an excavator rental. The
 * classifier was reading the project name and promoting all three — on the
 * first real Peru import (2026-09-11, 8620 records) this was the single
 * largest false-positive mechanism: 99 of 1295 kept rows came in on the bare
 * construcción/carretera/puente whitelist, and every sampled one was a
 * materials or rental purchase named after the project it supplies.
 *
 * So: when a title's own head is a supply/rental purchase, everything from
 * the project connector onward is context about someone else's contract, and
 * is cut before any keyword runs.
 *
 * Deliberately narrow on both sides. The head must be an explicit purchase
 * ("adquisición", "suministro", "alquiler", "contratación de bienes") — a
 * title that opens "CONTRATACIÓN PARA LA EJECUCIÓN DE LA OBRA: MEJORAMIENTO
 * DE LA CARRETERA ..." is the works contract itself and is untouched, which
 * is why "obra" being in the connector list is safe. And the connector must
 * name a project/works/investment wrapper, not any "para" at all: "ADQUISICIÓN
 * DE CAMIONETAS PARA LAS COMISARÍAS" and "ADQUISICIÓN DE UN MONTACARGA PARA EL
 * TERMINAL PORTUARIO DE SUPE" keep their full text.
 *
 * Applied to the classifier's haystack only. BARE_BUYER_REF_TITLE and
 * NO_CONTENT_TITLE still read the raw title, so a cut can never turn a real
 * title into a "no content" exclusion.
 */
const SUPPLY_PURCHASE_HEAD =
  /^\W*(?:contrataci[óo]n\s+(?:de\s+bienes|para\s+la\s+adquisi\w*n)|adquisi\w*n|adqs?\.|compra|suministro|abastecimiento|(?:servicio\s+de\s+)?alquiler)\b/i;

const PROJECT_CONTEXT_CONNECTOR =
  /\bpara\s+(?:el|la|los|las)\s+(?:sub\s*)?(?:proyectos?|obras?|ioarr|plan\s+de\s+negocio|meta)\b/i;

function purchaseSubject(text: string | undefined): string | undefined {
  if (!text) return text;
  if (!SUPPLY_PURCHASE_HEAD.test(text)) return text;
  const connector = PROJECT_CONTEXT_CONNECTOR.exec(text);
  if (!connector || connector.index === 0) return text;
  return text.slice(0, connector.index).trim();
}

export function classifyRelevance(input: {
  title: string;
  summary?: string;
  industries: string[];
  scopeType: TenderScopeType;
  estimatedValue?: number;
  currency?: string;
  buyer?: string;
  /**
   * Tender.country. REQUIRED — not optional — for the same reason
   * governmentLevel is: several rules below branch on it (the Mexico
   * undisclosed-value gate, and the per-country MIN_VALUE_USD override in
   * MIN_VALUE_USD_BY_COUNTRY), so a caller that silently omits it gets a
   * *different tier* than the same row gets through another path.
   *
   * That is not hypothetical: every one of the 11 ingestion mappers used to
   * omit it while reclassify-tenders.ts passed it, so a Mexican row with no
   * disclosed value was excluded by `npm run reclassify:tenders` and then
   * re-admitted by the very next import — the 193 → 486 jump the user hit on
   * 2026-09-08. Making it required means tsc, not a production import, is
   * what tells you a call site forgot it. Pass `undefined` explicitly (as
   * the admin API does for a row with no country) rather than omitting it.
   */
  country: string | undefined;
  /**
   * True only for tenders sourced from a government-curated list of
   * strategic/priority projects — currently Proyectos Estratégicos MX
   * (proyectosestrategicosmx.hacienda.gob.mx, projects under the "Ley
   * para el Fomento de la Inversión en Infraestructura Estratégica" —
   * see proyectos-estrategicos-mapper.ts; supersedes the now-retired
   * proyectosmexico.gob.mx/Banobras-SHCP source as of 2026-09-03). Being
   * listed there IS itself the strongest possible flagship signal this
   * platform has: a real, verified government determination that this
   * is a major
   * project, not a keyword/value proxy for one. Deliberately folded into
   * `hasIncludeOverride` below rather than a separate check — it needs
   * exactly the same two effects that flag already has (bypass every
   * exclude/value-floor check, then count toward the flagship-promotion
   * condition), so reusing it is more correct than a parallel branch
   * that could drift out of sync.
   */
  isNationalPriorityProject?: boolean;
  /**
   * Pre-computed contract duration in days, from a real STRUCTURED source
   * field (e.g. Colombia SECOP II's `duracion`/`unidad_de_duracion`) rather
   * than the DURATION_ANCHOR text-phrase scan below. Takes precedence over
   * that scan when present. Added 2026-09-04: Colombia's real title/summary
   * text never contains the Spanish phrasing DURATION_ANCHOR looks for
   * ("plazo de ejecución: N días"), so without this the duration-based
   * signal (SHORT_DURATION_DAYS/LONG_DURATION_DAYS) could never fire for
   * Colombia at all, structured data or not.
   */
  structuredDurationDays?: number;
  /**
   * Tender.governmentLevel, as the source itself states it (Compras MX's
   * "Orden de gobierno", SECOP's "ordenentidad") — never inferred here.
   * Used for one rule only: see the municipal gate near the end.
   *
   * REQUIRED, not optional, and undefined has to be written out. Ingestion
   * and reclassify-tenders.ts must reach the same verdict for the same
   * tender — otherwise a re-import silently disagrees with the review that
   * was just signed off on, which is the exact failure this is guarding
   * against. Optional would let a call site forget it and diverge in
   * silence; required makes the compiler enumerate every call site instead.
   */
  governmentLevel: Tender["governmentLevel"] | undefined;
}): TenderRelevance {
  // stripKnownFalsePositivePlaceNames: see its own header comment in
  // industry.ts — bare "puerto"/"puertos"/"puente(s)" below
  // (MAJOR_PROJECT_KEYWORDS/FLAGSHIP_INDUSTRY_KEYWORDS) otherwise also
  // match Colombian place names like "Puerto Boyacá"/"Puerto López"/
  // "Puente Ospina".
  // purchaseSubject: see its header comment — a Peruvian "buy X PARA EL
  // PROYECTO <big project>" title is a contract for X, not for the project.
  const subjectTitle = purchaseSubject(input.title)!;
  const subjectSummary = purchaseSubject(input.summary);
  const haystack = stripKnownFalsePositivePlaceNames([subjectTitle, subjectSummary, ...input.industries].filter(Boolean).join(" "));

  // See MAINTENANCE_ONLY_KEYWORDS' header comment — deliberately checked
  // before, and not gated by, hasIncludeOverride below. Only a real,
  // government-verified national-priority-project designation (never a
  // keyword-based override) can rescue a maintenance-only tender.
  if (
    input.isNationalPriorityProject !== true &&
    !isConcessionWithBuildScope(haystack) &&
    (MAINTENANCE_ONLY_KEYWORDS.some((pattern) => pattern.test(haystack)) ||
      RENEWAL_ONLY_KEYWORDS.some((pattern) => pattern.test(haystack)))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  // See PERU_MARGINAL_INVESTMENT — undisclosed value only; a real amount is
  // judged on its merits below like any other row.
  if (
    input.isNationalPriorityProject !== true &&
    input.estimatedValue === undefined &&
    PERU_MARGINAL_INVESTMENT.test(haystack)
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "undisclosed_value") };
  }

  if (
    input.isNationalPriorityProject !== true &&
    (NON_PROCUREMENT_RECORD_KEYWORDS.some((pattern) => pattern.test(haystack)) || isBareInteradministrativeTitle(input.title))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  // Placed here, above hasIncludeOverride, on purpose — see
  // CHILDCARE_FACILITY_KEYWORDS' own comment for why an include-override
  // must not rescue a daycare.
  if (
    input.isNationalPriorityProject !== true &&
    CHILDCARE_FACILITY_KEYWORDS.some((pattern) => pattern.test(haystack))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  const hasIncludeOverride =
    INCLUDE_OVERRIDE_KEYWORDS.some((pattern) => pattern.test(haystack)) || input.isNationalPriorityProject === true;

  if (
    !hasIncludeOverride &&
    (BARE_BUYER_REF_TITLE.test(input.title.trim()) || NO_CONTENT_TITLE.some((pattern) => pattern.test(withoutProcurementPhase(input.title))))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "no_content") };
  }

  if (
    !hasIncludeOverride &&
    input.buyer &&
    EXCLUDE_BUYER_KEYWORDS.some((pattern) => pattern.test(input.buyer!))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "buyer") };
  }

  if (!hasIncludeOverride && EXCLUDE_KEYWORDS.some((pattern) => pattern.test(haystack))) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  // The municipal-amenity class, split out of EXCLUDE_KEYWORDS above because
  // it is the one exclusion with a value exception — see
  // WATER_NETWORK_KEYWORDS — same value exception, same helper, see its header.
  if (
    !hasIncludeOverride &&
    !isLargeWorksBuild(input) &&
    WATER_NETWORK_KEYWORDS.some((pattern) => pattern.test(haystack))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  // MUNICIPAL_AMENITY_KEYWORDS and isLargeWorksBuild().
  if (
    !hasIncludeOverride &&
    !isLargeWorksBuild(input) &&
    MUNICIPAL_AMENITY_KEYWORDS.some((pattern) => pattern.test(haystack))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  // Materials supply — excluded unless the title says the materials are part
  // of building something. See MATERIALS_SUPPLY_PATTERN.
  if (
    !hasIncludeOverride &&
    MATERIALS_SUPPLY_PATTERN.test(haystack) &&
    !WORKS_CONTRACT_CONTEXT.test(haystack)
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  // Supplying, hauling or consulting ON someone else's works contract, and
  // commodity construction inputs — see each pattern's own header. These come
  // after the materials gate above because they are the cases that gate lets
  // through: naming the works is what rescued them.
  if (
    !hasIncludeOverride &&
    (CONSTRUCTION_INPUT_GOODS.some((pattern) => pattern.test(haystack)) ||
      WORKS_CONSULTANCY_PATTERN.test(haystack) ||
      SUPPORT_VEHICLE_KEYWORDS.some((pattern) => pattern.test(haystack)))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  // Per the user's explicit request (2026-09-04): "咨询" (consulting) as a
  // whole scopeType — studies, plans, professional/advisory services, not
  // an equipment purchase or works contract — is excluded outright, not
  // just when it happens to hit an EXCLUDE_KEYWORDS phrase. Real examples
  // that triggered this: "ELABORACIÓN DE ESTUDIOS Y PROYECTOS PARA LA
  // MODERNIZACIÓN..." and an ultrasonic railway-inspection SERVICE — both
  // scopeType "consulting" from compras-mx-open-tenders-mapper.ts's own
  // TIPO DE CONTRATACIÓN mapping ("SERVICIOS RELACIONADOS CON LA OBRA" ->
  // "consulting"). Still bypassed by hasIncludeOverride, same as every
  // other exclude check above — a genuine cybersecurity/EPC-flagged
  // consulting-scope tender shouldn't be blindly dropped just for its
  // scopeType.
  if (!hasIncludeOverride && input.scopeType === "consulting") {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "consulting") };
  }

  const durationDays = input.structuredDurationDays ?? extractAnchoredDurationDays(haystack);
  if (!hasIncludeOverride && durationDays !== undefined && durationDays < SHORT_DURATION_DAYS) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "short_duration") };
  }

  const bridgeLengthMeters = extractAnchoredBridgeLengthMeters(haystack);
  if (!hasIncludeOverride && bridgeLengthMeters !== undefined && bridgeLengthMeters < SHORT_BRIDGE_METERS) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "short_bridge") };
  }

  const normalizedValue =
    input.estimatedValue !== undefined ? (convertToUsd(input.estimatedValue, input.currency) ?? undefined) : undefined;

  const minValueUsd = MIN_VALUE_USD;
  // Deliberately NOT gated by hasIncludeOverride (2026-09-04, per explicit
  // user request after a real batch of tiny-value Colombia tenders —
  // "SERVICIO DE INTERNET" $571, "QPAR S.A.S" $8,185, "CPS INFRAESTRUCTURA
  // TI" $5,145 — kept surfacing as flagship because a bare
  // INCLUDE_OVERRIDE_KEYWORDS match, hidden in the summary text rather
  // than the title, was bypassing the value floor entirely, the same
  // mechanism already fixed once for MAINTENANCE_ONLY_KEYWORDS above.
  // User's explicit rule: "如有金额，金额过了再用关键字，没有金额的直接用
  // 关键字" (if a value is disclosed, it must clear the floor before any
  // keyword signal matters; only an UNDISCLOSED value falls through to
  // keyword-only logic). Only isNationalPriorityProject — a real,
  // government-verified major-project designation — still rescues a
  // below-floor value; no keyword-based override can anymore.
  if (input.isNationalPriorityProject !== true && normalizedValue !== undefined && normalizedValue < minValueUsd) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "value", minValueUsd) };
  }

  const matchesFlagshipIndustry = FLAGSHIP_INDUSTRY_KEYWORDS.some((pattern) => pattern.test(haystack));
  const matchesMajorProject = MAJOR_PROJECT_KEYWORDS.some((pattern) => pattern.test(haystack));
  const hasLongDuration = durationDays !== undefined && durationDays >= LONG_DURATION_DAYS;
  const isEquipmentScaleCapped = EQUIPMENT_SCALE_CAPPED_KEYWORDS.some((pattern) => pattern.test(haystack));

  // Previously also promoted any scopeType "works"/"equipment_services"
  // tender with an unknown value straight to flagship (isWorksLike),
  // regardless of what the work actually was — removed (2026-09-02) after
  // the user asked how many of the "flagship" tier actually matched their
  // own stated 大项目 criteria (MAJOR_PROJECT_KEYWORDS above, or value ≥
  // FLAGSHIP_VALUE_USD): of 201 real flagship rows in that export, only 32
  // did — the other 169 were "works"-scope tenders with no value at all,
  // e.g. "REHAB. PAVIM. CON MEZCLA ASFALT. EN CALIENTE CALLE S/N" (one
  // street's asphalt patch) and "MANTENIMIENTO EN EDIFICIOS DE LA TERMINAL
  // DE TRANSBORDADORES" (a maintenance job) — neither a major project by
  // any reading of the user's list. Dropping this doesn't exclude those
  // tenders outright: a real infrastructure title with a disclosed value
  // still lands on "significant" via matchesFlagshipIndustry below
  // (construcción/carretera/puente/etc.), or "standard" via the
  // content-industry allowlist gate further down when no value is known
  // (see that gate's own comment) — this only stops "no value + happens
  // to be scoped works" alone from claiming the top tier.
  // hasIncludeOverride only forces flagship when the value is UNDISCLOSED
  // (2026-09-05, real false positive: two INCLUDE_OVERRIDE_KEYWORDS matches —
  // "AMPLIACIÓN Y MODERNIZACIÓN...SISTEMA DE VIDEOVIGILANCIA..." at $773K and
  // "Modernización datacenter" at $713K — were forced to flagship regardless
  // of their real, disclosed value, both well under FLAGSHIP_VALUE_USD and
  // even under SIGNIFICANT_VALUE_USD. Once a real value is known, it governs
  // the tier the same way it does for every other signal in this file — an
  // override keyword still guarantees the tender is never excluded (see
  // hasIncludeOverride's use above), it just no longer bypasses the value
  // bands once there's a real number to judge by. matchesMajorProject stays
  // value-independent: genuine major-project categories (railway, dam,
  // power plant, national network, new datacenter build — see
  // MAJOR_PROJECT_KEYWORDS) are inherently large-scale regardless of what a
  // specific procurement notice's line-item value happens to disclose.
  // Two demotions before the flagship branch, both for a major-project
  // keyword that names the SITE rather than the job. Neither excludes:
  // the work is real, its scale is just not what the keyword implies.
  const majorIsLocationOnly = matchesMajorProject && MAJOR_PROJECT_LOCATION_ONLY.some((pattern) => pattern.test(haystack));
  const majorIsDemotedToSignificant =
    matchesMajorProject && MAJOR_PROJECT_DEMOTED_TO_SIGNIFICANT.some((pattern) => pattern.test(haystack));

  // The demotion yields to a real flagship-scale number. Without this a $50M
  // bridge would be capped at 中型 by the same rule that exists to stop a
  // village footbridge being 大型 — the keyword is a poor scale estimate, but a
  // disclosed amount is not an estimate at all (2026-09-12: 除非金额很大的项目).
  const hasFlagshipScaleValue = normalizedValue !== undefined && normalizedValue >= FLAGSHIP_VALUE_USD;

  if (majorIsDemotedToSignificant && !majorIsLocationOnly && !hasFlagshipScaleValue) {
    return { tier: "significant", label: LABELS.significant, reason: reasonFor("significant", "scope") };
  }

  if (
    (matchesMajorProject && !majorIsLocationOnly) ||
    // Long duration only speaks when nothing better does. It is a proxy for
    // scale, and a proxy must lose to a measurement: structured_duration_days
    // is written by exactly one mapper (Colombia's, from SECOP's
    // duracion/unidad_de_duracion), so "any Colombian contract running a year
    // or more is 大型项目" was the real rule — which is how a $1.02M
    // multi-year framework contract came out flagship and prompted the user's
    // 为什么哥伦比亚很多项目金额不到都被列为大型项目 (2026-09-12). With a real
    // amount in hand the bands below decide; with none, duration still counts.
    (hasLongDuration && normalizedValue === undefined) ||
    hasFlagshipScaleValue ||
    (hasIncludeOverride &&
      normalizedValue === undefined &&
      !isEquipmentScaleCapped &&
      !OVERRIDE_NOT_FLAGSHIP.some((pattern) => pattern.test(haystack)))
  ) {
    return { tier: "flagship", label: LABELS.flagship, reason: reasonFor("flagship", "value") };
  }

  // A target-industry keyword match counts toward "significant" on its
  // own, but only once a real value is disclosed (2026-09-05, per the
  // user's explicit request: "墨西哥很多项目没有金额...设定一些项目降为常规
  // 项目"). Without this `normalizedValue !== undefined` guard, a bare
  // FLAGSHIP_INDUSTRY_KEYWORDS match (construcción/equipo médico/vehicle
  // purchase/etc.) always promoted straight to "significant" regardless
  // of value — and since most Mexico open-tenders rows carry no value at
  // all, that meant almost any infrastructure/medical/vehicle-flavored
  // title skipped "standard" entirely, which is exactly why that tier
  // stayed empty even after being reactivated above. A genuinely large
  // project without a disclosed value still isn't excluded outright: it
  // now lands on "standard" via the content-industry allowlist gate
  // further down instead of jumping straight to "significant". A
  // disclosed value, even one that doesn't clear SIGNIFICANT_VALUE_USD on
  // its own, still combines with the keyword match to promote — only a
  // completely undisclosed value caps this at "standard".
  if (
    (normalizedValue !== undefined && normalizedValue >= SIGNIFICANT_VALUE_USD) ||
    (matchesFlagshipIndustry && normalizedValue !== undefined) ||
    (isEquipmentScaleCapped && normalizedValue === undefined)
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
  // matched"), isn't a genuine equipment/goods purchase, and has no known
  // value, there is nothing distinguishing it from noise, so it's
  // excluded too rather than shown by default. A tender with a real value
  // (even below SIGNIFICANT_VALUE_USD) still shows as "standard" — a
  // concrete dollar figure is itself a legitimizing signal even when the
  // source text just doesn't use any INDUSTRY_KEYWORDS phrasing.
  // Deliberately NOT gating on FLAGSHIP_INDUSTRY_KEYWORDS here (already
  // checked above) — this uses input.industries, the multi-tag
  // classifyIndustries() result callers already computed, so a tender
  // tagged by a real source field (e.g. "Descripción Ramo") still counts
  // even if its title text alone wouldn't match FLAGSHIP_INDUSTRY_KEYWORDS.
  //
  // Deliberately recomputed from title/summary alone here, NOT
  // input.industries — real bug found in a 2026-09-02 kept-list export:
  // compras-mx-open-tenders-mapper.ts (and dof-mapper.ts, dof-search-
  // mapper.ts, peru-oece-mapper.ts) pass the raw buyer name into
  // classifyIndustries() too, and PEMEX's own buyer name literally
  // contains "pemex" (industry.ts's energy pattern: /\bpemex\b/). That
  // tagged EVERY PEMEX Exploración y Producción tender "energy" —
  // 992 of the ~1900-row kept export were this exact case, e.g. "Servicio
  // de calibración a equipos patrones" (a routine calibration SERVICE)
  // surviving as "standard" for no reason but the buyer's own name,
  // regardless of what was actually being procured. input.industries
  // (the stored, buyer-inclusive tags) stays as-is for the industry
  // filter UI, where a user deliberately browsing "everything PEMEX
  // procures under energy" is a defensible use — but it must not be
  // what keeps a no-value, non-equipment tender out of "excluded" here.
  // Mexico only: an undisclosed value is not a reason to KEEP a tender
  // (2026-09-07, per the user's explicit call — "不是没金额就 Standard，这是
  // 只应用于哥伦比亚的逻辑，墨西哥不能这么做").
  //
  // The platform-wide floor deliberately doesn't fire on a missing value,
  // reasoning that "absence isn't evidence of smallness". That holds for
  // Colombia, where SECOP II publishes values and a blank one is unusual.
  // It does not hold for Compras MX: obra pública there routinely publishes
  // no amount at all, so the floor — the single strongest filter this
  // classifier has — simply never ran on them, and every municipal water
  // main, street paving job and village well fell through to "standard".
  // One real import: 619 new Mexican tenders, 597 of them "standard", the
  // titles being things like "RED DE AGUA POTABLE EN LA COLONIA SAN MIGUEL".
  //
  // Nothing genuinely large is lost here. Every positive signal has already
  // returned above this line — MAJOR_PROJECT_KEYWORDS, INCLUDE_OVERRIDE,
  // FLAGSHIP_INDUSTRY_KEYWORDS, isNationalPriorityProject, the
  // equipment-scale rule — so a no-value Mexican tender only reaches here
  // having matched none of them. "CONSTRUCCIÓN DEL SEGUNDO TRAMO DEL
  // ACUEDUCTO", flagship on keywords alone with no value, never gets this
  // far.
  //
  // Gated on matchesFlagshipIndustry (2026-09-07, same day, after the user
  // caught a real miss): "ADQUISICIÓN DE EXCAVADORA HIDRÁULICA PARA USARSE
  // EN LA REFINERÍA MADERO Y ADQUISICIÓN DE CAMIÓN CON PLATAFORMA Y BRAZO
  // ARTICULADO" was excluded by this gate. It is a PEMEX heavy-equipment
  // purchase — exactly the category this platform exists to surface — and
  // it does match FLAGSHIP_INDUSTRY_KEYWORDS' anchored purchase pattern.
  // It reached this line only because that match promotes to "significant"
  // only once a value is disclosed, so with no value it fell through with
  // nothing marking it as having matched anything.
  //
  // A keyword match that is real but not strong enough to PROMOTE is still
  // a keyword match, and this gate must not treat it as silence. Checked
  // against the same import that motivated the gate: the equipment
  // purchase matches, and not one of the 20 sampled municipal water/paving/
  // well titles does.
  // Municipal tier, undisclosed value, and nothing holding it in but the
  // broadest works word there is (2026-09-07, per the user's call to use
  // the structural field rather than keep guessing at wording).
  //
  // "CONSTRUCCIÓN DE TANQUE" and "MODERNIZACIÓN DE LA CARRETERA:
  // VILLAHERMOSA - FRANCISCO ESCÁRCEGA" are the same word to
  // BARE_WORKS_WHITELIST, and no phrasing rule separated them: the
  // settlement-name rule added earlier reached only 5 of 267. What does
  // separate them is who is buying — a municipality's water main versus a
  // federal highway — and the source states that outright in its "Orden de
  // gobierno" field, so this is read, not inferred.
  //
  // Deliberately narrow in three ways. It needs an UNDISCLOSED value (a
  // real number is judged on its own merits). It requires that the ONLY
  // whitelist match is the bare works word — a municipality buying
  // vehicles, medical equipment or transformers matches an anchored
  // purchase pattern instead and is untouched. And every promotion has
  // already returned above, so a dam or a railway is never reached.
  if (
    input.governmentLevel === "municipal" &&
    normalizedValue === undefined &&
    matchesFlagshipIndustry &&
    !hasIncludeOverride &&
    FLAGSHIP_INDUSTRY_KEYWORDS.filter((pattern) => pattern.test(haystack)).every((pattern) => pattern === BARE_WORKS_WHITELIST)
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "undisclosed_value") };
  }

  // Village/neighbourhood-scale siting, undisclosed value — see
  // SETTLEMENT_SCALE_KEYWORDS. Every promotion above has already returned,
  // so what reaches here matched at most the bare "construcción" and names
  // one comunidad/localidad/colonia as its site.
  if (normalizedValue === undefined && SETTLEMENT_SCALE_KEYWORDS.some((pattern) => pattern.test(haystack))) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "undisclosed_value") };
  }

  // hasIncludeOverride joins matchesFlagshipIndustry here (2026-09-07):
  // demoting a fire-alarm or firewall tender out of flagship left it with no
  // whitelist match, and this gate then excluded it outright — turning a
  // requested demotion into a deletion.
  if (
    input.country !== undefined &&
    UNDISCLOSED_VALUE_IS_NOT_A_KEEP_SIGNAL.has(input.country) &&
    normalizedValue === undefined &&
    !matchesFlagshipIndustry &&
    !hasIncludeOverride
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "undisclosed_value") };
  }

  const contentIndustries = classifyIndustries(subjectTitle, subjectSummary);
  const hasTargetIndustry = contentIndustries.some((i) => i !== "general");
  // Same correction: this gate's comment says everything reaching it failed
  // every positive signal, which stopped being true once demotions began
  // routing keyword-matched tenders past the flagship branch.
  if (!hasTargetIndustry && normalizedValue === undefined && !matchesFlagshipIndustry && !hasIncludeOverride) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "industry") };
  }

  // "standard" reactivated as a real output tier (2026-09-05, per the
  // user's explicit request — the front-end's "常规项目" filter chip was
  // sitting permanently empty since the 2026-09-02 change below stopped
  // producing it). Everything reaching this point already cleared the
  // country value floor (or has a real industry-tag signal with no
  // disclosed value at all) but didn't clear SIGNIFICANT_VALUE_USD or any
  // keyword-based promotion above — exactly the "known-legitimate but not
  // top-tier" bucket "standard" originally existed for. Reverses the prior
  // policy (2026-09-02, "keep only flagship + this whitelist") of routing
  // this same case to "excluded" instead — see reasonFor()'s final branch
  // for this tier's reason text, unchanged since it already described
  // "standard" correctly even while classifyRelevance() itself never
  // returned it.
  return { tier: "standard", label: LABELS.standard, reason: reasonFor("standard", "none") };
}

/**
 * Which positive signal kept a tender in the feed, named.
 *
 * Diagnostic only — it changes no classification and is never called from
 * the pipeline. It exists because "too many are being kept" cannot be acted
 * on by itself: the useful question is which pattern is doing the keeping,
 * since that is the one to tighten. Reports the first signal that fires, in
 * the same order classifyRelevance() checks them, and names the exact regex
 * so a loose pattern is identifiable rather than merely suspected.
 *
 * See scripts/explain-kept.ts, which groups a reclassify export by this.
 */
export function explainKeptSignal(input: {
  title: string;
  summary?: string;
  industries: string[];
  estimatedValue?: number;
  currency?: string;
  buyer?: string;
  /** Required for the same reason classifyRelevance() requires it — an omitted country made this diagnostic report a different tier than the pipeline. */
  country: string | undefined;
  scopeType?: TenderScopeType;
  governmentLevel?: Tender["governmentLevel"];
  isNationalPriorityProject?: boolean;
}): string {
  // The row's real scopeType matters: hardcoding "works" made 26 rows of a
  // real kept export report themselves as "excluded", because scopeType
  // "consulting" is excluded outright and this was overwriting it.
  const result = classifyRelevance({
    ...input,
    scopeType: input.scopeType ?? "works",
    governmentLevel: input.governmentLevel,
    isNationalPriorityProject: input.isNationalPriorityProject,
  });
  // Reported before the tier, because this flag bypasses every exclusion and
  // is the whole reason such a row is in the kept set.
  if (input.isNationalPriorityProject) return "国家战略项目（Proyectos Estratégicos MX，绕过全部排除）";
  if (result.tier === "excluded") return "excluded（不该出现在 kept 里）";

  const haystack = stripKnownFalsePositivePlaceNames(
    [input.title, input.summary, ...input.industries].filter(Boolean).join(" "),
  );
  const value = input.estimatedValue !== undefined ? (convertToUsd(input.estimatedValue, input.currency) ?? undefined) : undefined;
  const show = (pattern: RegExp) => String(pattern).slice(0, 96);

  const major = MAJOR_PROJECT_KEYWORDS.find((pattern) => pattern.test(haystack));
  if (major) return `MAJOR_PROJECT 大型项目关键词 ${show(major)}`;

  const override = INCLUDE_OVERRIDE_KEYWORDS.find((pattern) => pattern.test(haystack));
  if (override && value === undefined) return `INCLUDE_OVERRIDE 白名单（无金额）${show(override)}`;

  if (value !== undefined && value >= FLAGSHIP_VALUE_USD) return `金额 ≥ ${FLAGSHIP_VALUE_USD.toLocaleString()} USD`;
  if (value !== undefined && value >= SIGNIFICANT_VALUE_USD) return `金额 ≥ ${SIGNIFICANT_VALUE_USD.toLocaleString()} USD`;

  const flagshipIndustry = FLAGSHIP_INDUSTRY_KEYWORDS.find((pattern) => pattern.test(haystack));
  if (flagshipIndustry) return `FLAGSHIP_INDUSTRY 白名单 ${show(flagshipIndustry)}`;

  const capped = EQUIPMENT_SCALE_CAPPED_KEYWORDS.find((pattern) => pattern.test(haystack));
  if (capped) return `EQUIPMENT_SCALE_CAPPED ${show(capped)}`;

  if (override) return `INCLUDE_OVERRIDE 白名单（有金额）${show(override)}`;
  if (value !== undefined) return `仅凭有金额保留（未命中任何关键词）`;
  return `仅凭行业标签保留（未命中任何关键词、无金额）`;
}

/**
 * The one source name that marks a tender as a government-declared national
 * priority project (see isNationalPriorityProject above). Exported because
 * three separate files used to hardcode this string — the mapper that writes
 * it, reclassify-tenders.ts, and scripts/explain-kept.ts — and a typo in any
 * one of them silently drops the strongest include signal the platform has.
 */
export const NATIONAL_PRIORITY_SOURCE_NAME = "Proyectos Estratégicos MX (Hacienda)";

/**
 * Exactly the fields of a tender ROW — the shape that gets written to and
 * read back from Supabase — that any relevance decision is allowed to depend
 * on. Anything a connector knows but does not store (Compras MX's "Descripción
 * Ramo", for instance) is deliberately absent: a signal that cannot survive a
 * round-trip through the database cannot be part of a stable classification.
 */
export type StoredTenderClassificationInput = {
  /** tenders.title.es, verbatim. */
  title: string;
  /** tenders.summary.es, verbatim — pass the title again if the source has no separate summary, which is what those mappers already store. */
  summary: string;
  buyer: string;
  country: string;
  governmentLevel: Tender["governmentLevel"];
  scopeType: TenderScopeType;
  estimatedValue?: number;
  currency?: string;
  /** tenders.source_name — the national-priority flag is derived from it here rather than passed, so a connector cannot set or forget it independently. */
  sourceName: string;
  /**
   * tenders.structured_duration_days (migration 0029) — currently written
   * only by colombia-mapper.ts, from SECOP's duracion/unidad_de_duracion.
   * It used to be the one classifier input with no column, which made every
   * Colombian row with a duration >= LONG_DURATION_DAYS flagship at import
   * and demoted at reclassify. Rows ingested before 0029 read back NULL,
   * which means what it has always meant here: unknown duration.
   */
  structuredDurationDays?: number;
};

/**
 * The ONLY way the ingestion path and the reclassify path should ever compute
 * a tier. Both derive `industries` and `relevance` from the same stored fields
 * here, so the two cannot disagree.
 *
 * This exists because they did disagree, in production, on 2026-09-08: the
 * mappers omitted `country` (so the Mexico undisclosed-value gate never fired
 * at ingest) and computed `industries` from a different set of texts than
 * reclassify did. `npm run reclassify:tenders` deleted 623 rows, and the very
 * next import put most of them straight back — 193 rows became 486. Requiring
 * `country` stops that particular field being forgotten; routing both paths
 * through one function stops the next field being forgotten.
 *
 * Rule for anything added later: if a new input changes the tier, it belongs
 * in StoredTenderClassificationInput above AND in a column on `tenders`. A
 * connector-only signal will be right at import and wrong forever after.
 */
export function classifyStoredTender(input: StoredTenderClassificationInput): {
  industries: ReturnType<typeof classifyIndustries>;
  relevance: TenderRelevance;
} {
  const industries = classifyIndustries(input.title, input.summary, input.buyer);
  return {
    industries,
    relevance: classifyRelevance({
      title: input.title,
      summary: input.summary,
      industries,
      scopeType: input.scopeType,
      estimatedValue: input.estimatedValue,
      currency: input.currency,
      buyer: input.buyer,
      country: input.country,
      governmentLevel: input.governmentLevel,
      isNationalPriorityProject: input.sourceName === NATIONAL_PRIORITY_SOURCE_NAME,
      structuredDurationDays: input.structuredDurationDays,
    }),
  };
}
