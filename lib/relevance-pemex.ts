import type { LocalizedText, TenderRelevance, TenderScopeType } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";

/**
 * Relevance for PEMEX's own "Concursos Abiertos" lists
 * (lib/ingestion/import-pemex-live.ts).
 *
 * Own rules, asked for by the user on 2026-09-25 (要不要给 PEMEX 单独做一套规则
 * （和 Petronect 一样） ← 要，请做), after a measurement: of the 71 procedures
 * PEMEX's seven lists published in the month to 2026-09-25, the general
 * rules kept 3. PEMEX publishes no amounts, so the general "no amount, no
 * industry keyword" gate excluded exactly the purchases the site is for —
 * MDEA solvent, aluminium alkyls for a polyethylene plant, activated carbon,
 * valves, line pipe, a heat exchanger, a jack-up rig lease.
 *
 * What PEMEX does say, and this reads, is:
 *   - the coverage ("Internacional", "Internacional bajo TLC", "Nacional" —
 *     the list's own tipoevento), stored at the end of procedureType so a
 *     reclassify sees what the import saw;
 *   - the supply type (Bienes / Servicios / Obra pública / Arrendamientos),
 *     stored as scopeType.
 *
 *   services → excluded, except well work (perforación, reactivación de pozos…)
 *   leases → kept only for rigs and vessels
 *   works: EPC → 大型; small or upkeep works → excluded; international → 中型;
 *          national → 常规 only when it builds or rebuilds a plant, line, tank or boiler
 *   goods: drill pipe / casing / tubing → 常规
 *          office, lab, tools, safety kit, spare parts, vehicles → excluded
 *          international: chemicals, petroleum products, equipment, pipe,
 *                         plate and other industrial material → 常规
 *          national: only major equipment and catalysts → 常规; the rest is a
 *                    refinery's spot purchase → excluded
 *
 * 材料 counts here (pipe, plate, conductors, refractory…), unlike the Compras
 * MX international-purchase rule where the user said 材料不算: in the same
 * message that asked for this, the user listed 大量材料采购 among the
 * purchases to keep, and Cemig's rule was approved as 设备和材料类.
 */

export const PEMEX_SOURCE_NAME = "PEMEX — Concursos Abiertos";

/** The list's tipoevento, appended to the stored procedureType: "Concurso Abierto (…) · Internacional". */
export function pemexProcedureType(base: string, tipoevento: string | undefined): string {
  const coverage = tipoevento?.trim();
  return coverage ? `${base} · ${coverage}` : base;
}

const INTERNATIONAL = /· internacional/;

const UPSTREAM_SERVICE = /(?<!simuladores de operaciones de )perforacion de pozos|terminacion de pozos|reactivacion de pozos|estimulacion de pozos|registros? geofisic|servicios? integral(?:es)? de pozos|cementacion de pozos/;
const RIG_OR_VESSEL = /plataforma de perforacion|equipo de perforacion|autoelevable|embarcacion|\bbuques?\b|barcaza/;
const EPC = /ingenieria,? procura y construccion|\bepc\b/;
const SMALL_WORKS = /techumbre|caminos|vias de acceso|puentes|almacen|oficinas?\b|edificio|barda|banquetas|pintura|impermeabiliz/;
const BUILDS = /construccion|instalacion de sistema|sustitucion de lineas|integracion de linea|cambio de circuitos|reparacion mayor|rehabilitacion del tanque|rehabilitacion de la caldera/;
const UPKEEP = /^\W*(?:mantenimiento|rehabilitacion de caminos|atencion a)/;
/**
 * A national works contract is kept only when it builds or rebuilds a plant,
 * a line, a tank or a boiler. The rest of what the refineries tender
 * nationally is upkeep — fire walls, drains, lighting, a workshop roof, one
 * expansion joint — measured at roughly two a week on 2026-09-25.
 */
const NATIONAL_WORKS_MAJOR =
  /construccion|sustitucion de lineas|reparacion mayor de planta|rehabilitacion de (?:la )?(?:planta|unidad)|rehabilitacion del tanque|caldera|torres de proceso|instalacion de sistema/;

const GOODS_HEAD = /^\W*(?:adquisicion|suministro de|compra de)/;
/** Drill pipe, casing and tubing — bulk by nature, and bought with "herramientas de perforación" in the same title. */
const OCTG = /tuberia de (?:perforacion|revestimiento|produccion)|\boctg\b/;

const NOT_TARGET_GOODS =
  /laboratorio|reactivo|consumible|insumo|dosimetro|detector|herramienta|andamio|eslinga|izaje|respiracion|extintor|pintura|papeleria|uniforme|proteccion personal|drager|sellos de seguridad|camara termografica|camion|vehiculo|excavadora|material de construccion|soldadura|electrodo|refaccion|repuesto|rodamiento|chumacera|filtr|tarjetas?\b|material recurrente|contencion|mobiliario|computo|oficina|medicament|material electrico|empaquetadura|barras y bujes|impresora|taller|hidrolavadora|pitot|maletin|especialidad de mantenimiento|discos de ruptura|acoplamiento|equipos? de medicion|pruebas no destructivas|seguridad industrial/;

const CHEMICALS =
  /quimic|solvente|inhibidor|percloroetileno|alquiluro|resina|carbonato|dicloroetano|catalizador|catalitic|alumina|carbon activado|aditivo|\bamina|mdea|glicol|metanol|\bsosa\b|\bacido|hipoclorito|gases industriales/;
const PETROLEUM_PRODUCTS = /aceites? (?:industrial|lubricante)|lubricante|combustible|\bdiesel|gasolina|turbosina|asfalto/;
const EQUIPMENT =
  /\bbombas?\b|bombeo|motobomba|compresor|cambiador(?:es)? de calor|intercambiador|(?:haz|haces) de tubos|turbina|turbogenerador|generador|transformador|interruptor|arrancador|relevador|valvula|equipos? dinamico|\bgruas?\b|reformador|caldera|\bhorno|calentador|instrumentacion|motores? electrico|tablero|subestacion|separador|recipiente/;
const MATERIALS = /tuberia|tubular|placas?\b|perfiles|laminas|conductores|\bcables?\b|fluxeria|aislamiento termico|refractario|conexiones|esparrago|malla|\bacero/;

/** What a national (CAN / "Nacional") purchase must be to count as 大量 rather than a plant's spot buy. */
const NATIONAL_MAJOR =
  /compresor|motocompresor|cambiador(?:es)? de calor|intercambiador|(?:haz|haces) de tubos|turbina|turbogenerador|generador|transformador|caldera|reformador|tuberia de perforacion|catalizador|alumina/;

const LABELS: Record<TenderRelevance["tier"], LocalizedText> = {
  flagship: { zh: "大型项目 · 建议中资企业重点关注", en: "Flagship Project", es: "Proyecto Insignia" },
  significant: { zh: "中型项目 · 中资出海相关度较高", en: "Significant Project", es: "Proyecto Significativo" },
  standard: { zh: "常规项目", en: "Standard Project", es: "Proyecto Estándar" },
  excluded: {
    zh: "日常服务类/小额标 · 默认不推荐",
    en: "Routine/Low-Value (filtered by default)",
    es: "Rutinario/Bajo Valor (filtrado por defecto)",
  },
};

const NOTE_ZH = "PEMEX 不公布预算金额，招标文件可在 PEMEX 采购门户下载。";
const NOTE_EN = "PEMEX publishes no budget; the bid documents are on PEMEX's procurement portal.";
const NOTE_ES = "PEMEX no publica presupuesto; las bases están en el portal de procura de PEMEX.";
const FILTERED_ZH = "默认不进入推荐列表（数据仍保留，可用于统计）。";
const FILTERED_EN = "Filtered from the default feed (metadata is kept, not deleted).";
const FILTERED_ES = "Filtrada de la vista predeterminada (los metadatos se conservan).";

const REASONS = {
  service: {
    zh: `该项目是服务类采购（维修、检测、培训、运输等），需要在墨西哥常驻的服务团队，${FILTERED_ZH}`,
    en: `A service contract (maintenance, testing, training, transport…) that needs a resident team in Mexico. ${FILTERED_EN}`,
    es: `Un contrato de servicios (mantenimiento, pruebas, capacitación, transporte…) que requiere un equipo residente en México. ${FILTERED_ES}`,
  },
  lease: {
    zh: `该项目是一般设备或车辆租赁，${FILTERED_ZH}`,
    en: `A lease of ordinary equipment or vehicles. ${FILTERED_EN}`,
    es: `Un arrendamiento de equipo común o vehículos. ${FILTERED_ES}`,
  },
  small_works: {
    zh: `该项目是小型土建或日常维护工程（道路、屋面、仓库等），${FILTERED_ZH}`,
    en: `Small civil or upkeep works (roads, roofs, warehouses…). ${FILTERED_EN}`,
    es: `Obra civil menor o de conservación (caminos, techumbres, almacenes…). ${FILTERED_ES}`,
  },
  not_target_goods: {
    zh: `该项目采购的是实验室用品、工具、安全防护、备件、车辆或办公用品等，不属于大宗设备、化学品、石油制品或工业材料，${FILTERED_ZH}`,
    en: `Laboratory supplies, tools, safety kit, spare parts, vehicles or office goods — not bulk equipment, chemicals, petroleum products or industrial material. ${FILTERED_EN}`,
    es: `Insumos de laboratorio, herramientas, equipo de seguridad, refacciones, vehículos o artículos de oficina — no equipos, químicos, petrolíferos ni materiales industriales a granel. ${FILTERED_ES}`,
  },
  national_spot: {
    zh: `该项目是国内招标的零星采购（单个炼厂或装置的阀门、管件、材料等），${FILTERED_ZH}`,
    en: `A national spot purchase for one refinery or plant (valves, fittings, materials…). ${FILTERED_EN}`,
    es: `Una compra puntual nacional para una refinería o planta (válvulas, conexiones, materiales…). ${FILTERED_ES}`,
  },
  no_signal: {
    zh: `该项目未命中设备、化学品、石油制品或工业材料类别，${FILTERED_ZH}`,
    en: `Not recognisable as equipment, chemicals, petroleum products or industrial material. ${FILTERED_EN}`,
    es: `No se reconoce como equipo, químicos, petrolíferos ni material industrial. ${FILTERED_ES}`,
  },
  epc: {
    zh: `该项目是 PEMEX 的 EPC（设计、采购、施工）总承包工程。${NOTE_ZH}`,
    en: `An EPC (engineering, procurement and construction) contract for PEMEX. ${NOTE_EN}`,
    es: `Un contrato IPC (ingeniería, procura y construcción) de PEMEX. ${NOTE_ES}`,
  },
  international_works: {
    zh: `该项目是 PEMEX 国际招标的工程项目。${NOTE_ZH}`,
    en: `An internationally tendered works contract for PEMEX. ${NOTE_EN}`,
    es: `Una obra de PEMEX licitada internacionalmente. ${NOTE_ES}`,
  },
  works: {
    zh: `该项目是 PEMEX 的工程项目（管线、装置、储罐等）。${NOTE_ZH}`,
    en: `A works contract for PEMEX (pipelines, plants, tanks…). ${NOTE_EN}`,
    es: `Una obra de PEMEX (ductos, plantas, tanques…). ${NOTE_ES}`,
  },
  rig: {
    zh: `该项目是钻井平台或船舶租赁。${NOTE_ZH}`,
    en: `A drilling rig or vessel charter. ${NOTE_EN}`,
    es: `Arrendamiento de plataforma de perforación o embarcación. ${NOTE_ES}`,
  },
  upstream: {
    zh: `该项目是油气井作业服务（钻井、完井、修井等）。${NOTE_ZH}`,
    en: `Well services (drilling, completion, workover…). ${NOTE_EN}`,
    es: `Servicios a pozos (perforación, terminación, reactivación…). ${NOTE_ES}`,
  },
  goods: {
    zh: `该项目是 PEMEX 的大宗设备、化学品、石油制品或工业材料采购。${NOTE_ZH}`,
    en: `A PEMEX purchase of equipment, chemicals, petroleum products or industrial material. ${NOTE_EN}`,
    es: `Una compra de PEMEX de equipos, químicos, petrolíferos o materiales industriales. ${NOTE_ES}`,
  },
} satisfies Record<string, LocalizedText>;

function tier(name: TenderRelevance["tier"], reason: LocalizedText): TenderRelevance {
  return { tier: name, label: LABELS[name], reason };
}

export function classifyPemexRelevance(input: { title: string; procedureType: string | undefined; scopeType: TenderScopeType | string }): TenderRelevance {
  const text = foldAccents(input.title).toLowerCase().replace(/\s+/g, " ").trim();
  const international = INTERNATIONAL.test(foldAccents(input.procedureType ?? "").toLowerCase());
  const lease = /^\W*arrendamiento/.test(text);
  // A title that says it buys something is a purchase whatever the list's
  // supply type says: "Adquisición de material eléctrico…" is filed under
  // Servicios on the PTI list.
  const goods = !lease && (input.scopeType === "equipment" || GOODS_HEAD.test(text));

  if (lease) return RIG_OR_VESSEL.test(text) ? tier("significant", REASONS.rig) : tier("excluded", REASONS.lease);

  if (input.scopeType === "works" && !goods) {
    if (EPC.test(text)) return tier("flagship", REASONS.epc);
    if (SMALL_WORKS.test(text) || (UPKEEP.test(text) && !BUILDS.test(text))) return tier("excluded", REASONS.small_works);
    if (international) return tier("significant", REASONS.international_works);
    return NATIONAL_WORKS_MAJOR.test(text) ? tier("standard", REASONS.works) : tier("excluded", REASONS.small_works);
  }

  if (!goods) return UPSTREAM_SERVICE.test(text) ? tier("standard", REASONS.upstream) : tier("excluded", REASONS.service);

  if (OCTG.test(text)) return tier("standard", REASONS.goods);
  if (NOT_TARGET_GOODS.test(text)) return tier("excluded", REASONS.not_target_goods);
  // Judged on what is bought, not what it is for: "concretos refractarios
  // para mantenimiento en calderas" is refractory, not a boiler.
  const subject = text.split(/ para /)[0];
  if (!international) return NATIONAL_MAJOR.test(subject) ? tier("standard", REASONS.goods) : tier("excluded", REASONS.national_spot);
  if (CHEMICALS.test(text) || PETROLEUM_PRODUCTS.test(text) || EQUIPMENT.test(text) || MATERIALS.test(text)) return tier("standard", REASONS.goods);
  return tier("excluded", REASONS.no_signal);
}
