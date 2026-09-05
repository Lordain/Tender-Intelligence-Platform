import type { LocalizedText, TenderRelevance, TenderScopeType } from "@/types/tender";
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
  /suministro (de )?(partes|herramientas|material(es)?)\b|adquisici[óo]n de (herramientas|refacciones)\b|refacciones, accesorios y herramientas|materiales? y art[íi]culos? de/i, // 物料/工具、物料 — spare parts, tools, consumable materials, not equipment/works
  /servicio m[ée]dico integral/i, // 不参加医疗的Servicio Integral — outsourced integrated medical service
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
const MAINTENANCE_ONLY_KEYWORDS = [/\bmantenimiento\b|servicio t[ée]cnico (preventivo|correctivo)/i];

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
const NON_PROCUREMENT_RECORD_KEYWORDS = [/\bmandato sin representaci[óo]n\b/i, /^sindicato\b/i, /^empr[ée]stito\b/i];

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
  /centro de comando|command center/i,
  /seguridad electr[óo]nica|electronic security/i,
  /datacenter|centro de datos/i,
  /fibra [óo]ptica|fiber optic/i,
  /\b5g\b/i,
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
  /construcci[óo]n|carretera|puente|ferrocarril|puerto|aeropuerto/i,
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
  /equipo m[ée]dico|equipamiento m[ée]dico|medical equipment|equipo de laboratorio/i,
  /bomba de infusi[óo]n|ventilador pulmonar|hemodi[áa]lisis|hemodinamia/i,
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
  /(adquisici[óo]n|adqs?\.?|compra|suministro)\s+de\s+[\d'"\s]{0,15}(veh[íi]culo(s)?|vehs\.?\b|autob[úu]s(es)?|cami[óo]n(es)?|camioneta(s)?|pick\s?-?up(s)?|\bsuv(s)?\b|furgoneta(s)?|maquinaria pesada)/i,
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
  /(adquisici[óo]n|adqs?\.?|compra|suministro)\s+de\s+[\d'"\s]{0,15}(transformador(es)?|generador(es)?|rel[ée]s? de protecci[óo]n|relevador(es)? de protecci[óo]n|\bups\b)/i,
];

// USD-scale thresholds (the whole platform standardizes display and
// classification on USD — see lib/currency.ts). Any value is normalized
// through that shared, approximate rate table before comparing — without
// it, e.g. a real COP 57,333,333 tender (worth roughly USD 13,650) would
// be compared directly against a threshold sized for MXN/USD-scale
// figures and wildly over-classified.
//
// Raised again (2026-09-05, per the user's explicit three-band scheme,
// applied to Mexico and Colombia alike — "哥伦比亚+墨西哥通用"): under
// $1,000,000 = standard, $1,000,000–$5,000,000 = significant, over
// $5,000,000 = flagship. Previously 1,000,000/250,000 (see the "standard
// eliminated" note further down, now reversed — "standard" is a real
// output tier again). A keyword match (MAJOR_PROJECT_KEYWORDS,
// FLAGSHIP_INDUSTRY_KEYWORDS, INCLUDE_OVERRIDE_KEYWORDS) still promotes
// independent of value, same as before — these bands only govern what a
// disclosed value alone is worth. Paired with MAJOR_PROJECT_KEYWORDS
// below, which promotes to flagship on a keyword/duration match alone,
// independent of value.
const FLAGSHIP_VALUE_USD = 5_000_000;
const SIGNIFICANT_VALUE_USD = 1_000_000;

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
  /\bpuentes?\b/i, // 建桥
  /\bpuertos?\b|terminal(es)? portuaria(s)?|recinto(s)? portuario(s)?/i, // 建港口
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
const MIN_VALUE_USD = 500_000;

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
  "keyword" | "industry" | "no_content" | "short_duration" | "short_bridge" | "buyer" | "consulting",
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
    | "none",
  /** Only meaningful for signal === "value" — the actual per-country threshold this tender was measured against (see MIN_VALUE_USD_BY_COUNTRY). */
  valueThresholdUsd: number = MIN_VALUE_USD,
): LocalizedText {
  if (tier === "excluded") {
    if (signal === "value") return valueExcludedReason(valueThresholdUsd);
    return EXCLUDED_REASON_BY_SIGNAL[
      signal === "industry" ||
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

export function classifyRelevance(input: {
  title: string;
  summary?: string;
  industries: string[];
  scopeType: TenderScopeType;
  estimatedValue?: number;
  currency?: string;
  buyer?: string;
  /** Tender.country — currently only used to look up a per-country MIN_VALUE_USD override (see MIN_VALUE_USD_BY_COUNTRY); undefined falls back to the platform-wide floor, same as before this field existed. */
  country?: string;
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
}): TenderRelevance {
  // stripKnownFalsePositivePlaceNames: see its own header comment in
  // industry.ts — bare "puerto"/"puertos"/"puente(s)" below
  // (MAJOR_PROJECT_KEYWORDS/FLAGSHIP_INDUSTRY_KEYWORDS) otherwise also
  // match Colombian place names like "Puerto Boyacá"/"Puerto López"/
  // "Puente Ospina".
  const haystack = stripKnownFalsePositivePlaceNames([input.title, input.summary, ...input.industries].filter(Boolean).join(" "));

  // See MAINTENANCE_ONLY_KEYWORDS' header comment — deliberately checked
  // before, and not gated by, hasIncludeOverride below. Only a real,
  // government-verified national-priority-project designation (never a
  // keyword-based override) can rescue a maintenance-only tender.
  if (input.isNationalPriorityProject !== true && MAINTENANCE_ONLY_KEYWORDS.some((pattern) => pattern.test(haystack))) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  if (
    input.isNationalPriorityProject !== true &&
    (NON_PROCUREMENT_RECORD_KEYWORDS.some((pattern) => pattern.test(haystack)) || isBareInteradministrativeTitle(input.title))
  ) {
    return { tier: "excluded", label: LABELS.excluded, reason: reasonFor("excluded", "keyword") };
  }

  const hasIncludeOverride =
    INCLUDE_OVERRIDE_KEYWORDS.some((pattern) => pattern.test(haystack)) || input.isNationalPriorityProject === true;

  if (!hasIncludeOverride && BARE_BUYER_REF_TITLE.test(input.title.trim())) {
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
  if (
    matchesMajorProject ||
    hasLongDuration ||
    (normalizedValue !== undefined && normalizedValue >= FLAGSHIP_VALUE_USD) ||
    (hasIncludeOverride && normalizedValue === undefined && !isEquipmentScaleCapped)
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
  const contentIndustries = classifyIndustries(input.title, input.summary);
  const hasTargetIndustry = contentIndustries.some((i) => i !== "general");
  if (!hasTargetIndustry && normalizedValue === undefined) {
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
