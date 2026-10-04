import type { IndustryKey } from "@/lib/industry";
import type { LocalizedText, TenderRelevance } from "@/types/tender";

/**
 * The verdict for a national energy auction (lib/ingestion/energy-auctions.ts).
 *
 * Its own module, and read by classifyStoredTender, so the import and every
 * later reclassify agree: upsert-tenders.ts re-derives each row's tier from
 * its stored fields and keeps that, so a tier set only in the record would
 * not survive the write. Every row of this source is a national auction of
 * hundreds of megawatts, so it is 大型 and 电力 by construction — the same
 * reasoning as a federal concession auction (isFederalConcessionAuction).
 */

export const ENERGY_AUCTIONS_SOURCE_NAME = "能源拍卖 — 各国能源主管部门官方公告（平台整理）";

const REASON: LocalizedText = {
  zh: "国家级能源拍卖/招标，规模达数百兆瓦或数千吉瓦时，由能源主管部门直接组织，建议中资企业（开发商、EPC、光伏组件、逆变器与储能设备供应商）重点关注。",
  en: "A national energy auction of hundreds of megawatts or thousands of gigawatt-hours, run by the energy authority itself. Recommended for close attention by Chinese developers, EPC contractors and PV, inverter and storage suppliers.",
  es: "Subasta nacional de energía de cientos de megavatios o miles de gigavatios-hora, organizada por la propia autoridad energética. Recomendada para seguimiento por desarrolladores, contratistas EPC y proveedores chinos de módulos, inversores y almacenamiento.",
};

export function classifyEnergyAuction(): { industries: IndustryKey[]; relevance: TenderRelevance } {
  return {
    industries: ["power"],
    relevance: { tier: "flagship", label: { zh: "大型项目 · 建议中资企业重点关注", en: "Flagship Project", es: "Proyecto Insignia" }, reason: REASON },
  };
}
