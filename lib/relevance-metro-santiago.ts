import type { LocalizedText, TenderRelevance } from "@/types/tender";
import { foldAccents } from "@/lib/text-fold";

/**
 * Relevance for Metro de Santiago's announced tenders
 * (lib/ingestion/connectors/metro-santiago-live.ts).
 *
 * Own rules for the reason lib/relevance-codelco.ts gives: the source states
 * no amount, so the general "no amount, no priority keyword" gate excluded
 * every row — L7 station civil works included. The mapper already keeps only
 * line-building items; this says how large each one is:
 *
 *   civil works, tunnels, rolling stock, CBTC, track and catenary → 大型项目
 *   the other systems a line is built from (ticketing, platform doors,
 *     electrical, communications, EMAS …)                          → 中型项目
 *   studies, inspection, archaeology, training, licences            → excluded
 *
 * The last line matters only to the reclassifier: the mapper never imports
 * those rows, but reclassify-tenders.ts re-runs this on stored rows and must
 * reach the same answer.
 */

const NOT_LARGE_WORK = /\bing\.?\s|ingenieria|consultoria|asesoria|\bito\b|inspeccion tecnica|arqueol|paleontol|monitoreo|capacitaci|coffee|licencia|concepto de arquitectura|estudio/;
const FLAGSHIP_WORK = /obras? civiles|oo\.?\s?cc|\bobras\b|construccion|tunel|piques|galerias|estaciones|material rodante|cbtc|vias y catenarias|\bcatenaria/;

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

const NOTE_ZH = "这是圣地亚哥地铁公布的招标预告，正式招标尚未发布；地铁公司不公布金额，参与需先在其供应商门户注册。";
const NOTE_EN = "An announcement by Metro de Santiago; the tender itself is not out yet. Metro publishes no amount, and bidders register on its supplier portal first.";
const NOTE_ES = "Aviso previo de Metro de Santiago; la licitación aún no se publica. Metro no publica montos y exige inscribirse antes en su portal de proveedores.";

const REASONS = {
  flagship: {
    zh: `该项目是圣地亚哥地铁新线建设的土建、隧道、车辆、信号（CBTC）或轨道与接触网工程，属于大型轨道交通项目。${NOTE_ZH}`,
    en: `Civil works, tunnels, rolling stock, CBTC signalling or track and catenary for a new Santiago Metro line — a large rail project. ${NOTE_EN}`,
    es: `Obras civiles, túneles, material rodante, CBTC o vías y catenaria de una nueva línea de Metro de Santiago — un proyecto ferroviario de gran escala. ${NOTE_ES}`,
  },
  significant: {
    zh: `该项目是圣地亚哥地铁新线的机电或运营系统（如票务、站台门、供电、通信）供货与安装。${NOTE_ZH}`,
    en: `Electromechanical or operating systems (ticketing, platform doors, power, communications) for a new Santiago Metro line. ${NOTE_EN}`,
    es: `Sistemas electromecánicos u operativos (ticketing, puertas de andén, energía, comunicaciones) de una nueva línea de Metro de Santiago. ${NOTE_ES}`,
  },
  excluded: {
    zh: "该项目是地铁新线的咨询、设计、监理、考古或培训等服务，不属于工程或设备供货，默认不进入推荐列表（数据仍保留，可用于统计）。",
    en: "Consulting, design, inspection, archaeology or training for a new line — not works or equipment supply. Filtered from the default feed (metadata is kept, not deleted).",
    es: "Consultoría, ingeniería, inspección, arqueología o capacitación para una nueva línea — no obras ni suministro. Filtrada de la vista predeterminada (los metadatos se conservan).",
  },
} satisfies Record<string, LocalizedText>;

export function classifyMetroSantiagoRelevance(input: { title: string }): TenderRelevance {
  const text = foldAccents(input.title).toLowerCase();
  if (NOT_LARGE_WORK.test(text)) return { tier: "excluded", label: LABELS.excluded, reason: REASONS.excluded };
  if (FLAGSHIP_WORK.test(text)) return { tier: "flagship", label: LABELS.flagship, reason: REASONS.flagship };
  return { tier: "significant", label: LABELS.significant, reason: REASONS.significant };
}
