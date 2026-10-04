import { convertToUsd } from "@/lib/currency";
import type { IndustryKey } from "@/lib/industry";
import { foldAccents } from "@/lib/text-fold";
import { isNewEnergy, isNewEnergyPower, NEW_ENERGY_MIN_VALUE_USD } from "@/lib/new-energy";
import type { LocalizedText, TenderRelevance } from "@/types/tender";

/**
 * Relevance for Brazil's Pregão Eletrônico on PNCP — equipment only.
 *
 * Why this source has its own rules (user, 2026-10-02: 土建、水工程类的项目占比
 * 太高 → 补充设备类来源 ← OK, and 巴西电子竞价的具体方案 ← OK). Lei 14.133
 * forbids a pregão for works, so Brazil's equipment purchases all come
 * through it — and nothing else on PNCP does: the Concorrência sweep this
 * platform started with (modalities 4 and 5) is works by law, which is why
 * 104 of Brazil's 122 tenders in September were 土建.
 *
 * A pregão is also a million rows of food, medicine, stationery and school
 * transport. Measured on 2026-10-02 (3,238 pregões published in two days):
 * 196 named a target equipment class, and of those 148 were under US$
 * 500k — a municipality buying one van, one backhoe. Seven cleared US$ 2M,
 * and two of those were not targets (950 endpoint-security licences, office
 * desktops with UPS units). So the rules, in order:
 *
 *   1. What is bought must be one of five equipment classes — medical
 *      equipment, vehicles, heavy plant, power equipment, ICT
 *      infrastructure. Anything else is not read further.
 *   2. Services, upkeep, rental, parts, licences, office IT → excluded.
 *   3. The amount must be published. A sealed or missing estimate cannot be
 *      sized, and in a pregão a missing one is nearly always a small buy.
 *   4. Brazil's own floor, US$ 2M (MIN_VALUE_USD_BY_COUNTRY in
 *      lib/relevance.ts), then the platform's 中型 / 大型 lines.
 *
 * Gated on this source AND the pregão procedure in lib/relevance.ts, so the
 * Concorrência rows from the same source keep the general rules unchanged.
 * Everything it reads is stored (title, procedure, value, currency), so a
 * reclassify gives the same answer as the import.
 */

/** PNCP's search sweep — Concorrência and Pregão alike. Defined here, not in lib/ingestion/ingest-brazil.ts, so lib/relevance.ts can gate on it without importing the ingestion layer. */
export const BRAZIL_PNCP_SOURCE_NAME = "Portal Nacional de Contratações Públicas (PNCP) — busca de editais";

/** A pregão this module may judge. Matches PNCP's "Pregão - Eletrônico" and the presencial variant. */
export function isPregaoProcedure(procedureType: string | undefined): boolean {
  return !!procedureType && /\bpreg[aã]o\b/i.test(procedureType);
}

// Matched against accent-folded, lower-cased text. Bare "servidores" is not
// an ICT word: "professores e servidores administrativos" (a school-kit order
// in the same sample) means civil servants.
const EQUIPMENT_CLASSES: [IndustryKey, RegExp][] = [
  [
    "healthcare",
    /equipamentos? (?:medic|hospitalar|odontolog|de (?:diagnostico|imagem|laboratorio|radiologia|hemodialise))|\btomografo|ressonancia magnetica|\braios?[- ]?x\b|mamografo|ultrassom|ultrassonografo|autoclave|ventiladores? pulmonar|monitor(?:es)? multiparametr|desfibrilador|arco cirurgico|angiografo|acelerador linear|maquinas? de hemodialise|ambulancias?/,
  ],
  [
    "vehicles",
    /\b(?:veiculos?|viaturas?|caminhoes|caminhao|onibus|micro-?onibus|ambulancias?|caminhonetes?|pick-?ups?|furgoes|furgao|vans?)\b/,
  ],
  [
    "heavy_equipment",
    /retroescavadeira|motoniveladora|escavadeira|pa carregadeira|trator(?:es)? de esteira|rolo compactador|mini ?carregadeira|maquinas? pesadas?|vibroacabadora|usina de asfalto|guindaste|empilhadeira|caminh(?:ao|oes) (?:basculante|compactador|munck|guindauto)/,
  ],
  [
    "power",
    /transformador(?:es)? de (?:potencia|forca|distribuicao)|\bsubestac|grupos? geradores?|geradores? de energia|usina (?:solar )?fotovoltaica|sistemas? (?:de energia solar|fotovoltaic)|paineis solares|\breligador|disjuntor(?:es)? de (?:alta|media)|cabos? de (?:alta|media) tensao|aerogerador|banco de baterias/,
  ],
  [
    "ict_telecom",
    /servidor(?:es)? (?:de rede|de dados|rack|blade)|conjunto de servidores|\bstorage\b|data ?center|\bswitch(?:es)?\b|\bfirewall|solucao de (?:rede|armazenamento|infraestrutura)|infraestrutura de (?:ti|rede|tecnologia)|equipamentos? de (?:ti\b|tecnologia da informacao|telecomunica|rede)|videomonitoramento|\bcftv\b|radiocomunicacao|fibra optica|rede (?:wi-?fi|sem fio)/,
  ],
];

/**
 * What a pregão that names a target class is often really buying. Read on the
 * whole object text; any one of these excludes. Each came from the measured
 * sample: "conserto da motoniveladora", "embuchamento de concha … da
 * retroescavadeira", "lavação de veículos grandes … e máquinas pesadas",
 * "transporte escolar", "locação de caminhões limpa-fossa", "950 licenças …
 * Palo Alto", "computadores, notebooks, monitores e nobreaks".
 *
 * "serviços de" excludes except before installation, configuration, assembly
 * or commissioning: "fornecimento de equipamentos de TI … serviços de
 * instalação e configuração" (US$ 3.6M, same sample) is an equipment supply
 * whose installation is ancillary, while "serviços de guinchos", "serviços de
 * extensão de garantia … HPE" and "serviços de coleta" are the contract.
 * "gêneros alimentícios" is here because a food order for a health
 * department names its "Serviço Móvel de Ambulância" unit; "material
 * médico-hospitalar" because it is consumables, not equipment.
 */
const NOT_EQUIPMENT_PURCHASE =
  /prestacao (?:de |dos? )?servicos?|contratacao de servicos?|\bservicos? de (?!instalacao|configuracao|montagem|implantacao)|extensao de garantia|manutencao|conserto|reparo|embuchamento|recuperacao|\bpecas\b|componentes e acessorios|\bpneus?\b|combustive|lubrificante|locacao|aluguel|fretamento|outsourcing|\bhoras?[ /-]?maquinas?|transporte (?:escolar|de pacientes|sanitario)|lavagem|lavacao|higienizacao|seguro\b|rastreamento|licencas?|licenciamento|assinatura|software|\bsaas\b|adesao a ata|curso|treinamento|capacitacao|uniformes?|material(?:is)? de consumo|insumos|reagentes?|medicamentos?|generos alimenticios|material medico/;

/**
 * Office IT is not ICT infrastructure. Applied only when ICT is the class
 * that matched, so an ambulance purchase whose text also lists a notebook for
 * its crew is still an ambulance purchase.
 */
const OFFICE_IT = /computadores|\bdesktops?\b|notebooks?|\bmonitores\b|impressoras?|nobreaks?|estacao de trabalho|tablets?|perifericos|suprimentos de informatica/;

const BRAZIL_FLOOR_USD = 2_000_000;
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

const CLASS_ZH: Record<IndustryKey, string> = {
  healthcare: "医疗设备",
  vehicles: "车辆",
  heavy_equipment: "工程机械",
  power: "电力设备",
  ict_telecom: "ICT 基础设施",
  energy_mining: "能矿",
  transportation: "交通",
  construction: "土建",
  water: "水务",
  general: "综合",
};

const CLASS_EN: Record<IndustryKey, string> = {
  healthcare: "medical equipment",
  vehicles: "vehicles",
  heavy_equipment: "heavy plant",
  power: "power equipment",
  ict_telecom: "ICT infrastructure",
  energy_mining: "energy & mining",
  transportation: "transport",
  construction: "construction",
  water: "water",
  general: "general",
};

const NOTE_ZH = "巴西电子竞价（Pregão Eletrônico）按价格竞拍，投标需在公告指定的电子系统注册，并通常需要巴西本地主体（CNPJ）或代理。";
const NOTE_EN = "A Brazilian pregão eletrônico is awarded on price; bidders register on the electronic system the notice names and usually need a Brazilian entity (CNPJ) or agent.";
const NOTE_ES = "Un pregão eletrônico brasileño se adjudica por precio; los oferentes se registran en el sistema electrónico que indica el aviso y suelen necesitar una entidad brasileña (CNPJ) o un agente.";

const REASONS = {
  not_equipment: {
    zh: "该电子竞价（Pregão）采购的不是医疗设备、车辆、工程机械、电力设备或 ICT 基础设施，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This pregão is not for medical equipment, vehicles, heavy plant, power equipment or ICT infrastructure. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Este pregão no es de equipos médicos, vehículos, maquinaria pesada, equipos eléctricos ni infraestructura TIC. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  service_or_upkeep: {
    zh: "该电子竞价（Pregão）是服务、维修、配件、租赁、软件许可或办公 IT 采购，不是设备采购，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This pregão buys services, upkeep, parts, rental, software licences or office IT — not equipment. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Este pregão contrata servicios, mantenimiento, repuestos, alquiler, licencias de software o informática de oficina — no equipos. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  no_value: {
    zh: "该设备类电子竞价（Pregão）没有公开预算金额，无法判断规模；这类采购多数是小额单台采购，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "This equipment pregão publishes no budget, so its size cannot be judged — most such purchases are single small units. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Este pregão de equipos no publica presupuesto, así que no se puede juzgar su tamaño — la mayoría son compras pequeñas de una unidad. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  small_new_energy: {
    zh: `该新能源类电子竞价（Pregão）预估金额低于 $${NEW_ENERGY_MIN_VALUE_USD.toLocaleString("en-US")} 美元，规模过小，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `This new-energy pregão is estimated under $${NEW_ENERGY_MIN_VALUE_USD.toLocaleString("en-US")} — too small to be worth bidding on from abroad. Filtered from the default feed (metadata is kept, not deleted).`,
    es: `Este pregão de nuevas energías se estima en menos de $${NEW_ENERGY_MIN_VALUE_USD.toLocaleString("en-US")} — demasiado pequeño para ofertar desde el extranjero. Filtrada de la vista predeterminada (los metadatos se conservan).`,
  },
  small: {
    zh: `该设备类电子竞价（Pregão）预估金额低于 $${BRAZIL_FLOOR_USD.toLocaleString("en-US")} 美元，规模过小，默认不进入推荐列表（数据仍保留，可用于统计）。`,
    en: `This equipment pregão is estimated under $${BRAZIL_FLOOR_USD.toLocaleString("en-US")} — too small to be worth bidding on from abroad. Filtered from the default feed (metadata is kept, not deleted).`,
    es: `Este pregão de equipos se estima en menos de $${BRAZIL_FLOOR_USD.toLocaleString("en-US")} — demasiado pequeño para ofertar desde el extranjero. Filtrada de la vista predeterminada (los metadatos se conservan).`,
  },
} satisfies Record<string, LocalizedText>;

function keptReason(classes: IndustryKey[]): LocalizedText {
  return {
    zh: `该项目是巴西政府的${classes.map((c) => CLASS_ZH[c]).join("、")}采购。${NOTE_ZH}`,
    en: `A Brazilian public purchase of ${classes.map((c) => CLASS_EN[c]).join(", ")}. ${NOTE_EN}`,
    es: `Una compra pública brasileña de ${classes.map((c) => CLASS_EN[c]).join(", ")}. ${NOTE_ES}`,
  };
}

function fold(text: string): string {
  return foldAccents(text).toLowerCase();
}

/**
 * The equipment classes a pregão's object text names, after the
 * service/upkeep and office-IT vetoes. Empty means "not an equipment
 * purchase this platform lists". Cheap — the import calls it on every
 * pregão BEFORE spending a request on the amount.
 */
export function pregaoEquipmentClasses(objectText: string): IndustryKey[] {
  const text = fold(objectText);
  // New energy is read past the services veto: a PV pregão is written as
  // "prestação de serviços de engenharia abrangendo o fornecimento, a
  // instalação … de sistemas de geração de energia solar fotovoltaica" — a
  // supply-and-install, not a service. Upkeep, repair and rental are still
  // refused, by NOT_NEW_ENERGY inside isNewEnergyPower.
  const newEnergy = isNewEnergyPower(text);
  if (NOT_EQUIPMENT_PURCHASE.test(text) && !newEnergy) return [];
  const classes = EQUIPMENT_CLASSES.filter(([, pattern]) => pattern.test(text)).map(([key]) => key);
  // Solar, storage, hydrogen and charging phrasings the power class above does
  // not carry — "sistemas de geração de energia solar fotovoltaica" was one
  // (Acre, R$16.9M, 2026-10-01). See lib/new-energy.ts.
  if (!classes.includes("power") && newEnergy) classes.push("power");
  // An ambulance is both a vehicle and medical equipment — the user asked for
  // both tags on that word (lib/industry.ts) — so both stay.
  if (classes.length === 1 && classes[0] === "ict_telecom" && OFFICE_IT.test(text)) return [];
  return classes;
}

function tier(name: TenderRelevance["tier"], reason: LocalizedText): TenderRelevance {
  return { tier: name, label: LABELS[name], reason };
}

export function classifyPncpPregaoRelevance(input: {
  title: string;
  summary?: string;
  estimatedValue?: number;
  currency?: string;
}): { industries: IndustryKey[]; relevance: TenderRelevance } {
  const text = [input.title, input.summary].filter(Boolean).join(" ");
  const classes = pregaoEquipmentClasses(text);
  if (classes.length === 0) {
    const named = EQUIPMENT_CLASSES.some(([, pattern]) => pattern.test(fold(text)));
    return { industries: ["general"], relevance: tier("excluded", named ? REASONS.service_or_upkeep : REASONS.not_equipment) };
  }
  const usd = input.estimatedValue === undefined ? null : convertToUsd(input.estimatedValue, input.currency);
  // New energy with no published amount is kept, as 常规 (user, 2026-10-04:
  // 要保障，没金额的这类项目，不被排除掉). Its scale is unknown, not small.
  if (usd === null && isNewEnergy(text)) return { industries: classes, relevance: tier("standard", keptReason(classes)) };
  if (usd === null) return { industries: classes, relevance: tier("excluded", REASONS.no_value) };
  // New energy is judged against its own, lower floor — lib/new-energy.ts.
  if (isNewEnergy(text)) {
    if (usd < NEW_ENERGY_MIN_VALUE_USD) return { industries: classes, relevance: tier("excluded", REASONS.small_new_energy) };
  } else if (usd < BRAZIL_FLOOR_USD) {
    return { industries: classes, relevance: tier("excluded", REASONS.small) };
  }
  const reason = keptReason(classes);
  if (usd >= FLAGSHIP_USD) return { industries: classes, relevance: tier("flagship", reason) };
  if (usd >= SIGNIFICANT_USD) return { industries: classes, relevance: tier("significant", reason) };
  return { industries: classes, relevance: tier("standard", reason) };
}
