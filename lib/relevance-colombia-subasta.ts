import { convertToUsd } from "@/lib/currency";
import type { IndustryKey } from "@/lib/industry";
import { foldAccents } from "@/lib/text-fold";
import { isNewEnergy, isNewEnergyPower, NEW_ENERGY_MIN_VALUE_USD } from "@/lib/new-energy";
import type { LocalizedText, TenderRelevance } from "@/types/tender";

/**
 * Relevance for Colombia's *Selección abreviada subasta inversa* — equipment
 * only, US$ 1M and up.
 *
 * Everywhere else a subasta inversa is excluded outright as a price-only
 * reverse auction (PRICE_ONLY_AUCTION_PROCEDURES in lib/relevance.ts, user,
 * 2026-09-14). The exception is the user's (2026-10-02: 哥伦比亚只对设备类、
 * 100 万美元以上的逆向竞价放行 ← OK), after measuring where Colombian
 * equipment goes: Licitación pública is works and complex services, and the
 * other Selección Abreviada (menor cuantía) is capped near US$ 450K by law. A
 * police motorcycle fleet, armoured pickups, nine ambulances, LED street
 * lighting, a hyperconverged data-centre build — September's real equipment
 * purchases above US$ 1M — were all subastas.
 *
 * Of the 1,236 subastas published that month, about 70 cleared US$ 1M and
 * roughly 15 of those were equipment; the rest were aviation fuel, food,
 * lab reagents, uniforms, office computers and air tickets. Hence, in order:
 *
 *   1. What is bought must be one of five equipment classes.
 *   2. Consumables, services, upkeep, rental, licences, office IT → excluded.
 *   3. A published amount of at least US$ 1M (the platform floor), then the
 *      platform's 中型 / 大型 lines.
 *
 * Peru's subasta inversa (SIE) stays excluded: this is gated on Colombia in
 * lib/relevance.ts, and reads only stored fields, so a reclassify agrees with
 * the import.
 */

/** SECOP II's "Selección abreviada subasta inversa", accent-insensitively. */
export function isColombianSubastaInversa(procedureType: string | undefined): boolean {
  return !!procedureType && /subasta\s+inversa/i.test(foldAccents(procedureType));
}

// Accent-folded, lower-cased text.
const EQUIPMENT_CLASSES: [IndustryKey, RegExp][] = [
  [
    "healthcare",
    /equipos? (?:medic|biomedic|hospitalari|de (?:diagnostico|imagenes|imagenologia|laboratorio clinico|rayos))|equipamiento (?:medic|biomedic|hospitalari)|tomografo|resonador|resonancia magnetica|\brayos x\b|mamografo|ecografo|angiografo|acelerador lineal|ventiladores? mecanic|monitores? de signos vitales|desfibrilador|ambulancias?/,
  ],
  [
    "vehicles",
    /\bvehiculos?\b|\bcamionetas?\b|\bcamiones\b|\bcamion\b|\bvolquetas?\b|\bmotocicletas?\b|\bbuses\b|\bbus\b|\bbusetas?\b|ambulancias?|carros? (?:de bomberos|tanque)|maquinas? de bomberos/,
  ],
  [
    "heavy_equipment",
    /retroexcavadora|motoniveladora|excavadora|vibrocompactador|compactador|bulldozer|buldocer|cargador(?:a)? (?:frontal|sobre llantas)|minicargador|maquinaria (?:amarilla|pesada)|grua|montacargas/,
  ],
  [
    "power",
    /transformador(?:es)?|subestacion|plantas? electricas?|grupos? electrogenos?|paneles solares|sistemas? (?:solar|fotovoltaic)|luminarias?|alumbrado publico|respaldo energetico|\bups\b|banco de baterias/,
  ],
  [
    "ict_telecom",
    /servidor(?:es)?\b|almacenamiento(?! (?:de energia|energetico|en baterias))|hiperconvergen|centro de (?:datos|computo)|data ?center|\bswitch(?:es)?\b|firewall|ciberseguridad|solucion de conectividad|infraestructura tecnologica|camaras? de (?:video ?)?vigilancia|video ?vigilancia|circuito cerrado de television|\bcctv\b|radios? (?:de comunicacion|portatiles)|radio ?comunicacion|aeronaves? no tripuladas|\bdrones?\b/,
  ],
];

/**
 * Not an equipment purchase, whatever class word appears. Each from the
 * measured month: "SUMINISTRO DE COMBUSTIBLE DE AVIACIÓN", "INSUMOS Y
 * REACTIVOS PARA LOS LABORATORIOS", "PASAJES AÉREOS", "VÍVERES FRESCOS",
 * "ELEMENTOS DE PROTECCIÓN PERSONAL", "DOTACIÓN", "RENOVACIÓN GARANTÍAS
 * HIPERCONVERGENCIA", "LICENCIAMIENTO DE LA PLATAFORMA DE SEGURIDAD".
 */
const NOT_EQUIPMENT_PURCHASE =
  /\bconstruccion\b|\bobras?\b|combustible|lubricante|\binsumos?\b|reactivos?|pasajes|viveres|aliment|medicamento|elementos de proteccion|\bdotacion\b|uniformes?|calzado|confeccion|papeleria|materia prima|mantenimiento|reparacion|repuestos|llantas|arrendamiento|alquiler|renovacion|extension de garantia|licencia|licenciamiento|suscripcion|software|soporte tecnico|prestacion de servicios|servicio de (?!instalacion|configuracion|puesta en)|mezcla asfaltica|emulsion asfaltica|implementos deportivos/;

/** Office IT is not ICT infrastructure — applied only when ICT is the only class that matched. */
const OFFICE_IT = /equipos? de computo|computadores|portatiles|todo en uno|perifericos|impresoras?|tabletas?|\bworkstation/;

const FLOOR_USD = 1_000_000;
const SIGNIFICANT_USD = 5_000_000;
const FLAGSHIP_USD = 10_000_000;

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

const CLASS_ZH: Partial<Record<IndustryKey, string>> = {
  healthcare: "医疗设备",
  vehicles: "车辆",
  heavy_equipment: "工程机械",
  power: "电力设备",
  ict_telecom: "ICT 基础设施",
};
const CLASS_EN: Partial<Record<IndustryKey, string>> = {
  healthcare: "medical equipment",
  vehicles: "vehicles",
  heavy_equipment: "heavy plant",
  power: "power equipment",
  ict_telecom: "ICT infrastructure",
};

const NOTE_ZH = "哥伦比亚逆向竞价（Subasta Inversa）在技术条件合格的投标人之间按价格竞拍，需在 SECOP II 注册投标。";
const NOTE_EN = "A Colombian subasta inversa is awarded on price among technically compliant bidders; bids are submitted through SECOP II.";
const NOTE_ES = "La subasta inversa se adjudica por precio entre los oferentes que cumplen los requisitos técnicos; las ofertas se presentan en SECOP II.";

const REASONS = {
  not_equipment: {
    zh: "该项目是逆向竞价（Subasta Inversa）——按价格竞拍的标准化采购，只有医疗设备、车辆、工程机械、电力设备或 ICT 基础设施类且金额达 100 万美元以上的才收录，本项目不属于这几类，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "A subasta inversa — a price-only auction for standardised goods. Only medical equipment, vehicles, heavy plant, power equipment or ICT infrastructure of US$1M and up is listed, and this is none of those. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Una subasta inversa — subasta solo por precio de bienes estandarizados. Solo se listan equipos médicos, vehículos, maquinaria pesada, equipos eléctricos o infraestructura TIC desde US$1M, y esta no es ninguno. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  consumable_or_service: {
    zh: "该逆向竞价（Subasta Inversa）采购的是耗材、燃料、服务、维修、租赁、软件许可或办公电脑，不是设备采购，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This subasta inversa buys consumables, fuel, services, upkeep, rental, software licences or office computers — not equipment. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Esta subasta inversa compra insumos, combustible, servicios, mantenimiento, arriendo, licencias o computadores de oficina — no equipos. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  small_new_energy: {
    zh: `该新能源类逆向竞价（Subasta Inversa）没有公开金额或金额低于 $${NEW_ENERGY_MIN_VALUE_USD.toLocaleString("en-US")} 美元，规模过小，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `This new-energy subasta inversa publishes no amount or is under $${NEW_ENERGY_MIN_VALUE_USD.toLocaleString("en-US")} — too small to be worth bidding on from abroad. Filtered from the default feed (metadata is kept, not deleted).`,
    es: `Esta subasta inversa de nuevas energías no publica monto o es menor a $${NEW_ENERGY_MIN_VALUE_USD.toLocaleString("en-US")} — demasiado pequeña para ofertar desde el extranjero. Filtrada de la vista predeterminada (los metadatos se conservan).`,
  },
  small: {
    zh: `该设备类逆向竞价（Subasta Inversa）没有公开金额或金额低于 $${FLOOR_USD.toLocaleString("en-US")} 美元，规模过小，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `This equipment subasta inversa publishes no amount or is under $${FLOOR_USD.toLocaleString("en-US")} — too small to be worth bidding on from abroad. Filtered from the default feed (metadata is kept, not deleted).`,
    es: `Esta subasta inversa de equipos no publica monto o es menor a $${FLOOR_USD.toLocaleString("en-US")} — demasiado pequeña para ofertar desde el extranjero. Filtrada de la vista predeterminada (los metadatos se conservan).`,
  },
} satisfies Record<string, LocalizedText>;

function fold(text: string): string {
  return foldAccents(text).toLowerCase();
}

/**
 * What is being bought, without what it comes with or what it is for.
 * "Adquirir una solución integral de ciberseguridad incluyendo la
 * instalación, configuración, soporte y garantía" is a purchase whose
 * support is ancillary, and "COMPRAVENTA DE LUMINARIAS DE TECNOLOGIA LED PARA
 * EL MANTENIMIENTO DEL ALUMBRADO PÚBLICO" buys luminaires — both September
 * rows, both lost to the service words of their trailing clause until the
 * vetoes and classes read only the head of each text.
 */
const TRAILING_CLAUSE = /\b(?:incluyendo|incluid[oa]s?|para (?:el|la|los|las|su)|con (?:el )?fin|destinad[oa]s?|a fin de)\b/;

function objectOf(text: string): string {
  return fold(text)
    .split(/\n/)
    .map((part) => part.split(TRAILING_CLAUSE)[0]!)
    .join(" ");
}

/** The equipment classes named, after the consumable/service and office-IT vetoes. Empty: not listed. */
export function subastaEquipmentClasses(objectText: string): IndustryKey[] {
  const text = objectOf(objectText);
  if (NOT_EQUIPMENT_PURCHASE.test(text)) return [];
  const classes = EQUIPMENT_CLASSES.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
  // Storage, hydrogen, charging and the wider solar phrasings — lib/new-energy.ts.
  // Read against the whole text as well: objectOf() drops "para los ambientes
  // de formación", which is exactly the clause that marks a training kit.
  if (!classes.includes("power") && isNewEnergyPower(text) && isNewEnergy(objectText)) classes.push("power");
  if (classes.length === 1 && classes[0] === "ict_telecom" && OFFICE_IT.test(text)) return [];
  return classes;
}

function tier(name: TenderRelevance["tier"], reason: LocalizedText): TenderRelevance {
  return { tier: name, label: LABELS[name], reason };
}

export function classifyColombiaSubastaRelevance(input: {
  title: string;
  summary?: string;
  estimatedValue?: number;
  currency?: string;
}): { industries: IndustryKey[]; relevance: TenderRelevance } {
  const text = [input.title, input.summary].filter(Boolean).join("\n");
  const classes = subastaEquipmentClasses(text);
  if (classes.length === 0) {
    const named = EQUIPMENT_CLASSES.some(([, pattern]) => pattern.test(objectOf(text)));
    return { industries: ["general"], relevance: tier("excluded", named ? REASONS.consumable_or_service : REASONS.not_equipment) };
  }
  const usd = input.estimatedValue === undefined ? null : convertToUsd(input.estimatedValue, input.currency);
  // New energy has its own, lower floor — lib/new-energy.ts.
  const newEnergy = isNewEnergy(text);
  const floor = newEnergy ? NEW_ENERGY_MIN_VALUE_USD : FLOOR_USD;
  if (usd === null || usd < floor) return { industries: classes, relevance: tier("excluded", newEnergy ? REASONS.small_new_energy : REASONS.small) };
  const reason: LocalizedText = {
    zh: `该项目是哥伦比亚政府的${classes.map((c) => CLASS_ZH[c]).join("、")}采购。${NOTE_ZH}`,
    en: `A Colombian public purchase of ${classes.map((c) => CLASS_EN[c]).join(", ")}. ${NOTE_EN}`,
    es: `Una compra pública colombiana de ${classes.map((c) => CLASS_EN[c]).join(", ")}. ${NOTE_ES}`,
  };
  if (usd >= FLAGSHIP_USD) return { industries: classes, relevance: tier("flagship", reason) };
  if (usd >= SIGNIFICANT_USD) return { industries: classes, relevance: tier("significant", reason) };
  return { industries: classes, relevance: tier("standard", reason) };
}
