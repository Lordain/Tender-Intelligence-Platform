import type { LocalizedText, TenderRelevance } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";

/**
 * Relevance for Petrobras / Transpetro opportunities read from Petronect.
 *
 * ── Why this source has its own rules ─────────────────────────────────────
 *
 * The general rules were tuned on municipal and ministry portals, where "no
 * amount and no priority-industry keyword" really does mean "too little to
 * go on". Run over Petronect's 309 open opportunities on 2026-09-25 they got
 * it backwards: all 16 opportunities open to foreign suppliers — the compressor
 * set for the Mexilhão project, 16/20-inch pipe for the SEAP gas pipeline,
 * refinery catalysts, heat exchangers — were excluded, because Petrobras
 * never publishes an amount (Lei 13.303 lets a state company keep its budget
 * confidential) and "Permutador de calor" matches no industry keyword, while
 * a travel-agency contract was kept.
 *
 * What Petronect does publish, and the municipal portals do not, is the
 * buyer's own statement of who may bid: every opportunity is either
 * "Nacional" (Brazilian suppliers only) or "Internacional" (foreign suppliers
 * may bid directly). That flag is the scale evidence here, the way the
 * procedure letter is for Mexico (isMexicoInternationalBulkPurchase). It is
 * carried in the stored `procedureType` — see petronectProcedureType() — so
 * an import and a reclassify read the same thing.
 *
 * ── The decision, in order ────────────────────────────────────────────────
 *
 *   1. Pregão → excluded. Price-only electronic auction, short and local.
 *   2. Routine services (security, cleaning, travel, legal, IT, training,
 *      health, vehicles, admin support, waste…) → excluded, whatever else the
 *      title says.
 *   3. What is being bought:
 *        works     — industrial construction/assembly, EPC/EPCI, revamps,
 *                    project + supply + install packages
 *        upstream  — well and offshore operations (completion, slickline,
 *                    drilling fluids, G&G, subsea tie-in, vessel charter)
 *        goods     — equipment, materials, chemicals, petroleum products
 *      Anything else (maintenance, inspection, studies, rentals, turnaround
 *      work) → excluded.
 *   4. Goods open to Brazilian suppliers only are kept only when they are a
 *      bulk purchase: a framework ("por contrato global", "a granel") or a
 *      category Petrobras only ever buys in volume (OCTG, catalysts, process
 *      chemicals). A single national valve or relay is a spare part.
 *   5. Tier: EPC/revamp/new unit, or an international purchase for a named
 *      project → 大型; any other international opportunity → 中型; the rest → 常规.
 *
 * Brazil's $2M value floor never applies, because there is never a value.
 */

/** The source name every Petronect row is stored under. classifyStoredTender() routes on it. */
export const PETRONECT_SOURCE_NAME = "Petronect — Petrobras / Transpetro";

const PREGAO_PROCEDURE = "Pregão Eletrônico Petrobras (Lei 13.303, art. 32, IV)";
const INTERNATIONAL_PROCEDURE = "Licitação Petrobras (Lei 13.303) · Internacional";
const NATIONAL_PROCEDURE = "Licitação Petrobras (Lei 13.303) · Nacional";

/**
 * The stored procedureType for one opportunity.
 *
 * DISPUTE_MODE "03" is Pregão (header YPCON_MODALITY 102, "Pregão, Lei 13.303,
 * Art. 32, inciso IV"); every other mode measured on 2026-09-25 was modality
 * 101, "Licitação, Lei 13.303, Art. 28, CAPUT". NAT_COVERAGE is "I" or "N".
 */
export function petronectProcedureType(disputeMode: string, natCoverage: string): string {
  if (disputeMode === "03") return PREGAO_PROCEDURE;
  return natCoverage === "I" ? INTERNATIONAL_PROCEDURE : NATIONAL_PROCEDURE;
}

function isPregao(procedureType: string | undefined): boolean {
  return procedureType === PREGAO_PROCEDURE;
}

function isInternational(procedureType: string | undefined): boolean {
  return procedureType === INTERNATIONAL_PROCEDURE;
}

/**
 * Routine services. Checked before anything else, so a travel contract that
 * happens to mention a refinery is still a travel contract.
 */
const ROUTINE_SERVICE =
  /vigilancia|seguranca patrimonial|limpeza|conservacao|areas? verdes?|alimentacao|refeitorio|cozinha|agenciamento de viagens|passagens aereas|hospedagem|traducao|juridic|legal advis|advocac|contencioso|\bseguro\b|despachante|vistos?\b|treinamento|\bcurso\b|capacitacao|atendimento de saude|remocao de urgencia|\bbrigada\b|cartao combustivel|frota de veiculos|veiculos leves|conducao de veiculos|rotinas administrativas|apoio administrativo|suporte a gestao|gestao e apoio|multisservicos|manejo de fauna|gerenciamento de residuos|gestao de residuos|extintores|ergonomi|licenciamento de uso|software|\bsap\b|s ?4 ?hana|\btic\b|tecnologia da informacao|conectividade|internet|comunicacao multimidia|ciberneti|devsecops|microcomputador|informatica|servidores|projecoes de mercado|microambiente|inventario|gestao de estoque|ambientais?\b|remediacao|descontaminacao|demolicao|trepanacao|lodo oleoso|tratamento de agua|apoio portuario|servicos gerais|auxilio as operacoes|aquifero|pocos de monitoramento|investigacao geotecnica|sondagens?\b/;

/** Maintenance, inspection, testing, studies, rentals and turnaround work — services that need a resident local team. Only applied when the title is NOT works. */
const SERVICE_NOT_TARGET =
  /manutencao|reparo|inspec|ensaios?\b|analises?\b|termografia|vibracao|monitoramento|\bparadas?\b|suporte|\bapoio\b|assessoria|consultoria|fiscalizacao|pareceres|estudos|elaboracao de projetos?|projetos? de engenharia|projeto de poco|servicos? (?:tecnicos? )?(?:especializados? )?(?:de|em) engenharia|engserv|multiprojetos|planejamento|^locacao|\blocacao de (?:balsas|veiculos|empilhadeiras|subestacao|transformador)|operacao e manutencao|investigacao|credenciamento de interessados para prestacao de servicos de (?!interligacao)|centralizacao/;

/** Industrial construction and assembly. The verbs that make a service contract a works contract. */
const WORKS_VERB = /construcao|montagem|\bobras?\b|\bepci?\b|revamp|implantacao|fabricacao|instalacao/;
/** "com fornecimento de bens" plus a rehabilitation verb is works too: project, supply and install. */
const SUPPLY_AND_REHAB = /fornecimento de bens|com fornecimento de materiais/;
const REHAB_VERB = /adequacao|reabilitacao|substituicao|recuperacao|revitalizacao|fechamento/;
/** Small building work at an office, gate or canteen: works by verb, not what this platform is for. */
const SMALL_BUILDING = /edificac|portaria|centro de convivencia|cozinha|refeitorio|climatizacao|galpao|predial|banheiros?|mobiliario/;

/** Well and offshore operations, where foreign oilfield-service companies compete. */
const UPSTREAM =
  /geologia e geofisica|geofisic|sismic|slickline|completacao|fluidos? para operacoes|fluidos? de perfuracao|perfuracao (?:de|em) poc|avaliacao de formacoes|medicao fiscal|interligacao submarina|afretamento|controle de poco/;

/** A goods title: the purchase verb, or a bare equipment/material noun with no service in front of it. */
const GOODS_HEAD = /^\W*(?:aquisicao|fornecimento|compra|acquisition|supply|contratacao para fornecimento)\b/;
const INDUSTRIAL_GOODS =
  /valvul|bomba|compressor|soprador|turbina|gerador|motor|transformador|disjuntor|subestac|\bcabos?\b|\btubos?\b|tubulac|octg|revestimento|chapa|\baco\b|inox|perfil|flange|joelho|conexo|porcas?|arruelas?|parafuso|catalisador|peneira molecular|carbonato|metanol|alcool metilico|aldeido|\bsoda\b|acido|clarificante|antiespumante|produtos? quimicos?|depressor|melhorador|aditivo|permutador|trocador de calor|caldeira|forno|vaso de pressao|tanques?|umbilica|\bdutos?\b|riser|painel|paineis|inversor|fotovoltaic|energia solar|garrafas? instrumentadas|bucha de isolamento|corta chama|redes laminadas|cromatografo|analisador|instrumenta|atuador|redutor|selo mecanico/;
/** Goods that are never the target, even in bulk or from abroad. */
const NOT_TARGET_GOODS =
  /bebedouro|filtros? de agua|lanterna|divisoria|acustic|tomadas?\b|plugs?\b|mobiliario|informatic|periferic|vestimenta|uniforme|protecao para bombeiro|protecao individual|cartucho|lacre|palete|papelao|escritorio|desengraxante|lubrificantes?|graxas?|oleo combustivel|oleo diesel|ar-condicionado|ar condicionado|maquina de lavar|bioimpedancia|\bbd\b/;
/** A national purchase that is a framework, not a single order. */
const FRAMEWORK = /contrato global|a granel/;
/** Categories Petrobras only buys in volume: casing and tubing, catalysts, process chemicals. */
const BULK_BY_NATURE = /octg|tubos? de producao|catalisador|peneira molecular|depressor do ponto|melhorador de cetano|cestas? de produtos quimicos/;

/** Flagship: a named project of refinery or pipeline scale. */
const FLAGSHIP_WORKS = /\bepci?\b|\brevamp\b|\bhdt\b|coqueamento|\bcoques\b/;
const NAMED_PROJECT = /\bprojeto\b|\bproject\b|gasoduto|oleoduto/;

type PetronectSignal =
  | "pregao"
  | "routine"
  | "not_target_service"
  | "spot_purchase"
  | "not_target_goods"
  | "no_signal"
  | "flagship"
  | "international"
  | "national_bulk"
  | "national_works"
  | "national_upstream";

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

const BUDGET_NOTE_ZH = "Petrobras 按巴西国企采购法（13.303 号法）不公开预算，因此没有金额。";
const BUDGET_NOTE_EN = "Petrobras does not publish budgets (Lei 13.303), so there is no amount.";
const BUDGET_NOTE_ES = "Petrobras no publica presupuestos (Ley 13.303), por lo que no hay monto.";

const REASONS: Record<PetronectSignal, LocalizedText> = {
  pregao: {
    zh: "该项目是 Petrobras 的电子竞价（Pregão），只比价格、周期短，面向本地常规采购，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "A Petrobras Pregão — a short, price-only electronic auction for routine local purchases. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Un Pregão de Petrobras — subasta electrónica corta, solo por precio, para compras locales rutinarias. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  routine: {
    zh: "该项目属于日常性服务（安保、保洁、差旅、法律、IT、培训、医疗、车辆、行政支持、环保清理等），通常不属于中资企业出海投标的重点范围，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "A routine service (security, cleaning, travel, legal, IT, training, health, vehicles, admin support, environmental clean-up). Filtered from the default feed (metadata is kept, not deleted).",
    es: "Un servicio rutinario (vigilancia, limpieza, viajes, legal, TI, capacitación, salud, vehículos, apoyo administrativo, remediación). Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  not_target_service: {
    zh: "该项目是运维、检修、检测、分析、咨询或租赁类服务（含装置停工检修），需要在巴西常驻的服务团队，不是设备/材料采购或工程建设，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "Maintenance, inspection, testing, study, consulting or rental work (including turnarounds) — it needs a resident team in Brazil and is neither a goods purchase nor a construction contract. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Mantenimiento, inspección, ensayos, estudios, consultoría o alquiler (incluidas paradas de planta): requiere un equipo residente en Brasil y no es compra de bienes ni obra. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  spot_purchase: {
    zh: `该项目是国内招标（只允许巴西本地供应商参与）的零星设备/备件采购，不是框架合同，通常金额很小，默认不进入推荐列表（数据仍保留，可用于统计）。${BUDGET_NOTE_ZH}`,
    en: `A one-off equipment or spare-parts order open to Brazilian suppliers only, not a framework contract — usually small. Filtered from the default feed (metadata is kept, not deleted). ${BUDGET_NOTE_EN}`,
    es: `Una compra puntual de equipo o repuestos abierta solo a proveedores brasileños, no un contrato marco — normalmente pequeña. Filtrada de la vista predeterminada (los metadatos se conservan). ${BUDGET_NOTE_ES}`,
  },
  not_target_goods: {
    zh: "该项目采购的是办公、生活或低值消耗品（家具、饮水机、照明灯具、劳保用品、润滑油、燃油等），不属于工业设备或大宗材料，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "Office, facilities or low-value consumables (furniture, water coolers, lamps, protective clothing, lubricants, fuel) — not industrial equipment or bulk materials. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Consumibles de oficina, instalaciones o bajo valor (mobiliario, bebederos, lámparas, ropa de protección, lubricantes, combustible), no equipos industriales ni materiales a granel. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
  no_signal: {
    zh: `该项目未识别为设备/材料大宗采购、工业工程或油田作业服务，默认不进入推荐列表（数据仍保留，可用于统计）。${BUDGET_NOTE_ZH}`,
    en: `Not recognised as a bulk equipment/materials purchase, industrial works or an oilfield-service contract. Filtered from the default feed (metadata is kept, not deleted). ${BUDGET_NOTE_EN}`,
    es: `No se reconoce como compra de equipos/materiales a granel, obra industrial ni servicio petrolero. Filtrada de la vista predeterminada (los metadatos se conservan). ${BUDGET_NOTE_ES}`,
  },
  flagship: {
    zh: `该项目是 Petrobras 的大型工程或项目设备包（EPC/EPCI 总承包、炼厂装置改造或新建、管道项目等）。${BUDGET_NOTE_ZH}`,
    en: `A major Petrobras project: EPC/EPCI, a refinery unit revamp or new unit, or equipment for a named pipeline or field project. ${BUDGET_NOTE_EN}`,
    es: `Un proyecto mayor de Petrobras: EPC/EPCI, revamp o nueva unidad de refinería, o equipos para un proyecto de ducto o campo. ${BUDGET_NOTE_ES}`,
  },
  international: {
    zh: `该项目是 Petrobras 的国际招标，外国供应商可以直接参与，采购标的为工业设备、材料、化学品或油田作业服务。${BUDGET_NOTE_ZH}`,
    en: `An international Petrobras tender — foreign suppliers may bid directly — for industrial equipment, materials, chemicals or oilfield services. ${BUDGET_NOTE_EN}`,
    es: `Una licitación internacional de Petrobras — los proveedores extranjeros pueden ofertar directamente — de equipos industriales, materiales, químicos o servicios petroleros. ${BUDGET_NOTE_ES}`,
  },
  national_bulk: {
    zh: `该项目是 Petrobras 的大宗工业品框架采购（设备、材料或化学品，按「整体合同/散装」采购）。注意：本项目为国内招标，只允许在巴西注册的供应商参与。${BUDGET_NOTE_ZH}`,
    en: `A Petrobras framework purchase of industrial equipment, materials or chemicals ("contrato global" / bulk). Note: national tender — only Brazil-registered suppliers may bid. ${BUDGET_NOTE_EN}`,
    es: `Una compra marco de Petrobras de equipos, materiales o químicos industriales ("contrato global" / a granel). Nota: licitación nacional — solo pueden ofertar proveedores registrados en Brasil. ${BUDGET_NOTE_ES}`,
  },
  national_works: {
    zh: `该项目是 Petrobras/Transpetro 的工业工程（设计、供货、施工安装）。注意：本项目为国内招标，只允许在巴西注册的企业参与。${BUDGET_NOTE_ZH}`,
    en: `Petrobras/Transpetro industrial works (design, supply, construction and assembly). Note: national tender — only Brazil-registered companies may bid. ${BUDGET_NOTE_EN}`,
    es: `Obra industrial de Petrobras/Transpetro (diseño, suministro, construcción y montaje). Nota: licitación nacional — solo pueden ofertar empresas registradas en Brasil. ${BUDGET_NOTE_ES}`,
  },
  national_upstream: {
    zh: `该项目是 Petrobras 的油田/海上作业服务（完井、钢丝作业、钻井液、地质物探、海底连接、船舶租赁等）。注意：本项目为国内招标，只允许在巴西注册的企业参与。${BUDGET_NOTE_ZH}`,
    en: `A Petrobras oilfield or offshore service (completion, slickline, fluids, G&G, subsea tie-in, vessel charter). Note: national tender — only Brazil-registered companies may bid. ${BUDGET_NOTE_EN}`,
    es: `Un servicio petrolero u offshore de Petrobras (completación, slickline, fluidos, G&G, interconexión submarina, fletamento). Nota: licitación nacional — solo pueden ofertar empresas registradas en Brasil. ${BUDGET_NOTE_ES}`,
  },
};

function result(tier: TenderRelevance["tier"], signal: PetronectSignal): TenderRelevance {
  return { tier, label: LABELS[tier], reason: REASONS[signal] };
}

/** What the title says is being bought. Exported for the fixture report. */
export function petronectSubjectKind(title: string): "works" | "upstream" | "goods" | "other" {
  const text = foldAccents(title).toLowerCase();
  // A purchase verb first: "Aquisição de X com serviços de instalação" and
  // "Aquisição de Junta … para completação" are purchases of X, not works or
  // well services.
  if (GOODS_HEAD.test(text)) return "goods";
  const works =
    (WORKS_VERB.test(text) || (SUPPLY_AND_REHAB.test(text) && REHAB_VERB.test(text))) &&
    !/\bparadas?\b/.test(text);
  if ((works || FLAGSHIP_WORKS.test(text)) && !SMALL_BUILDING.test(text)) return "works";
  if (UPSTREAM.test(text)) return "upstream";
  if (!/^\W*(?:servic|prestacao)/.test(text) && INDUSTRIAL_GOODS.test(text)) return "goods";
  return "other";
}

export function classifyPetronectRelevance(input: { title: string; procedureType: string | undefined }): TenderRelevance {
  if (isPregao(input.procedureType)) return result("excluded", "pregao");

  const text = foldAccents(input.title).toLowerCase();
  if (ROUTINE_SERVICE.test(text)) return result("excluded", "routine");

  const kind = petronectSubjectKind(input.title);
  const international = isInternational(input.procedureType);

  if (kind === "other") {
    return result("excluded", SERVICE_NOT_TARGET.test(text) || SMALL_BUILDING.test(text) ? "not_target_service" : "no_signal");
  }
  // "Afretamento de Unidade de Manutenção e Segurança" is a vessel charter —
  // the UMS is a ship type, not a maintenance contract.
  if (kind === "upstream" && !/^\W*afretamento/.test(text) && SERVICE_NOT_TARGET.test(text)) {
    return result("excluded", "not_target_service");
  }

  if (kind === "goods") {
    if (NOT_TARGET_GOODS.test(text)) return result("excluded", "not_target_goods");
    if (!international && !(FRAMEWORK.test(text) && INDUSTRIAL_GOODS.test(text)) && !BULK_BY_NATURE.test(text)) {
      return result("excluded", "spot_purchase");
    }
  }

  if ((kind === "works" && FLAGSHIP_WORKS.test(text)) || (international && NAMED_PROJECT.test(text))) {
    return result("flagship", "flagship");
  }
  if (international) return result("significant", "international");
  if (kind === "works") return result("standard", "national_works");
  if (kind === "upstream") return result("standard", "national_upstream");
  return result("standard", "national_bulk");
}
