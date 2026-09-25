import type { LocalizedText, TenderRelevance } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";

/**
 * Relevance for CFE (Comisión Federal de Electricidad) calls read from the
 * DOF — the same idea as lib/relevance-pemex.ts, asked for the same day
 * (2026-09-25: 大宗采购白名单…也同样适用于墨西哥吗？包括CFE, PEMEX? and, after the
 * audit was offered, 请你也看看).
 *
 * What the audit found, on every CFE call the DOF published in the three
 * months to 2026-09-25 (224): the DOF mapper files every notice as a SERVICE,
 * because the DOF has no supply-type field. So a purchase of valves, boiler
 * tube, concrete transmission poles, capacitor banks or conductors was
 * excluded as "日常性服务采购" — 48 of the 168 exclusions.
 *
 * CFE does say what each call is, in its own procedure number:
 *
 *   CFE-0001-CA A A T-0151-2026
 *             │ │   └ coverage: N nacional, T internacional bajo TLC, A internacional abierto
 *             │ └ A adquisición (goods), S servicio, O obra
 *             └ CA concurso abierto
 *
 * The number is a stored column, so a reclassify reads what the import read.
 * Rows the DOF gave no CFE number for (the CNLV nuclear plant's "a ruego"
 * notices) fall back to the title's head: "Adquisición/Suministro…" is goods,
 * anything else a service.
 *
 *   services → excluded (maintenance, overhauls, support, insurance…) — by the
 *              number, or by a title that opens as upkeep whatever the number;
 *              a service-coded "suministro e instalación" of equipment counts as goods
 *   works: new substations, lines, plants → 中型 if international, else 常规;
 *          other works → 常规 if international, else excluded
 *   goods: spare parts, tools, safety kit, IT terminals, paper, vehicles → excluded
 *          international: grid and plant equipment, material, fuel, chemicals → 常规
 *          national: only major equipment (transformers, switchgear, turbines,
 *                    generators, pumps, capacitor banks, conductors, poles) → 常规
 */

/** CFE's procedure-number shape: CFE-<area>-CA<kind><x><coverage>-<seq>-<year>. */
const CFE_NUMBER = /^CFE-\d{4}-CA([ASO])[A-Z]([NTA])-/i;

/** Whether a stored row is a CFE call (buyer or number), which is when these rules apply. */
export function isCfeCall(input: { buyer?: string; tenderNumber?: string }): boolean {
  return CFE_NUMBER.test(input.tenderNumber?.trim() ?? "") || /comisi[oó]n federal de electricidad/i.test(input.buyer ?? "");
}

const GOODS_HEAD = /^\W*(?:adquisicion|suministro|compra)/;
/** A title that opens as upkeep is a service whatever its number says: "SERVICIO DE MANTENIMIENTO MAYOR A TRANSFORMADORES" is filed CAAAT. */
const SERVICE_HEAD = /^\W*(?:servicio|mantenimiento|rehabilitacion|reparacion|inspeccion|desmontaje|examinacion|pruebas|soporte|asistencia)/;

const NOT_TARGET_GOODS =
  /refaccion|repuesto|partes de repuesto|herramienta|proteccion personal|proteccion respiratoria|equipo de seguridad|proteccion civil|terminales portatiles|papel|cajeros|vehiculo|mantas de plomo|andamio|soldadura|electrodo|uniforme|oficina|computo|mobiliario|consumible|profauna|cuchillas|equipos? de uso menor|equipos? hidraulicos de torque|pruebas de electromovilidad|poliza|garantia|rodamiento|filtro|escobilla|interruptores de presion|medicion termica|internet/;

const EQUIPMENT_OR_MATERIAL =
  /transformador|interruptor|seccionador|tablero|subestacion|regulador|capacitor|conductor|\bcables?\b|\bpostes?\b|aislador|torres?\b|valvula|\bbombas?\b|tuberia|generador|turbina|enfriador|chiller|variador|sistema de control|control distribuido|reductor|embrague|medicion|combustible|diesel|carbon\b|quimic|amplificacion optica|proteccion(?:es)?,? comunicacion|protecciones|baterias|compresor|motor|caldera|intercambiador|ventilador|alabes|filtracion|precalentador|control de velocidad/;

/** A national purchase must be one of these to count as 大量 rather than a plant's spot buy. */
const NATIONAL_MAJOR =
  /transformador|interruptor|seccionador|tablero|subestacion|turbina|generador|\bbombas?\b|capacitor|conductor|\bpostes?\b|aislador|torres?\b|caldera|compresor|motor/;

const MAJOR_WORKS = /subestacion|lineas? de (?:transmision|distribucion)|central|construccion|ampliacion|modernizacion/;

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

const NOTE_ZH = "CFE 不在公告中公布预算金额；招标文件在 CFE 采购微网站（Micrositio de Concursos）上。";
const NOTE_EN = "CFE publishes no budget in the notice; the bid documents are on CFE's Micrositio de Concursos.";
const NOTE_ES = "CFE no publica presupuesto en el aviso; las bases están en el Micrositio de Concursos de CFE.";
const FILTERED_ZH = "默认不进入推荐列表（数据仍保留，可用于统计）。";
const FILTERED_EN = "Filtered from the default feed (metadata is kept, not deleted).";
const FILTERED_ES = "Filtrada de la vista predeterminada (los metadatos se conservan).";

const REASONS = {
  service: {
    zh: `该项目是 CFE 的服务类采购（维修、大修、技术支持、保险等），需要在墨西哥常驻的服务团队，${FILTERED_ZH}`,
    en: `A CFE service contract (maintenance, overhaul, support, insurance…) that needs a resident team in Mexico. ${FILTERED_EN}`,
    es: `Un contrato de servicios de CFE (mantenimiento, rehabilitación, soporte, seguros…) que requiere un equipo residente en México. ${FILTERED_ES}`,
  },
  not_target_goods: {
    zh: `该项目采购的是备件、工具、安全防护、终端设备、纸张或车辆等，不属于电网/电厂设备或大宗材料，${FILTERED_ZH}`,
    en: `Spare parts, tools, safety kit, terminals, paper or vehicles — not grid or plant equipment or bulk material. ${FILTERED_EN}`,
    es: `Refacciones, herramientas, equipo de seguridad, terminales, papel o vehículos — no equipos de red o de central ni materiales a granel. ${FILTERED_ES}`,
  },
  national_spot: {
    zh: `该项目是国内招标的零星采购（单个电厂的阀门、仪表、材料等），${FILTERED_ZH}`,
    en: `A national spot purchase for one plant (valves, instruments, materials…). ${FILTERED_EN}`,
    es: `Una compra puntual nacional para una central (válvulas, instrumentos, materiales…). ${FILTERED_ES}`,
  },
  no_signal: {
    zh: `该项目未命中电网/电厂设备或大宗材料类别，${FILTERED_ZH}`,
    en: `Not recognisable as grid or plant equipment or bulk material. ${FILTERED_EN}`,
    es: `No se reconoce como equipo de red o de central ni material a granel. ${FILTERED_ES}`,
  },
  small_works: {
    zh: `该项目是国内招标的小型工程，${FILTERED_ZH}`,
    en: `A small nationally tendered works contract. ${FILTERED_EN}`,
    es: `Una obra menor licitada a nivel nacional. ${FILTERED_ES}`,
  },
  major_works: {
    zh: `该项目是 CFE 的变电站、输配电线路或电厂工程。${NOTE_ZH}`,
    en: `A CFE substation, transmission/distribution line or power plant works contract. ${NOTE_EN}`,
    es: `Una obra de CFE en subestación, línea de transmisión/distribución o central. ${NOTE_ES}`,
  },
  works: {
    zh: `该项目是 CFE 国际招标的工程项目。${NOTE_ZH}`,
    en: `An internationally tendered CFE works contract. ${NOTE_EN}`,
    es: `Una obra de CFE licitada internacionalmente. ${NOTE_ES}`,
  },
  goods: {
    zh: `该项目是 CFE 的电网/电厂设备或大宗材料采购。${NOTE_ZH}`,
    en: `A CFE purchase of grid or power-plant equipment or bulk material. ${NOTE_EN}`,
    es: `Una compra de CFE de equipos de red o de central, o materiales a granel. ${NOTE_ES}`,
  },
} satisfies Record<string, LocalizedText>;

function tier(name: TenderRelevance["tier"], reason: LocalizedText): TenderRelevance {
  return { tier: name, label: LABELS[name], reason };
}

export function classifyCfeRelevance(input: { title: string; tenderNumber: string | undefined }): TenderRelevance {
  const text = foldAccents(input.title).toLowerCase().replace(/\s+/g, " ").trim();
  const code = CFE_NUMBER.exec(input.tenderNumber?.trim() ?? "");
  const kind = code ? code[1].toUpperCase() : GOODS_HEAD.test(text) ? "A" : "S";
  // No number means no stated coverage; treated as national, the stricter reading.
  const international = code ? code[2].toUpperCase() !== "N" : false;

  if (SERVICE_HEAD.test(text)) return tier("excluded", REASONS.service);
  // A service-coded "suministro e instalación" of plant equipment is a supply
  // contract with installation — kept on the same terms as a purchase.
  if (kind === "S" && !(GOODS_HEAD.test(text) && EQUIPMENT_OR_MATERIAL.test(text))) return tier("excluded", REASONS.service);

  if (kind === "O") {
    if (MAJOR_WORKS.test(text)) return international ? tier("significant", REASONS.major_works) : tier("standard", REASONS.major_works);
    return international ? tier("standard", REASONS.works) : tier("excluded", REASONS.small_works);
  }

  if (NOT_TARGET_GOODS.test(text)) return tier("excluded", REASONS.not_target_goods);
  // Judged on what is bought, not what it is for.
  const subject = text.split(/ (?:para|con destino) /)[0];
  if (!international) return NATIONAL_MAJOR.test(subject) ? tier("standard", REASONS.goods) : tier("excluded", REASONS.national_spot);
  return EQUIPMENT_OR_MATERIAL.test(text) ? tier("standard", REASONS.goods) : tier("excluded", REASONS.no_signal);
}
