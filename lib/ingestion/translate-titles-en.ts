import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";
import { mapBatchResultsToSlugs } from "@/lib/ingestion/translate-titles-qwen";
import type { TranslatedTender } from "@/lib/ingestion/translate-titles";

/**
 * en->zh title/summary translation, for Guyana (eprocure.gov.gy, added
 * 2026-09-27). A separate prompt for the reason translate-titles-pt.ts gives
 * for Portuguese: the Spanish prompt is half rules about Spanish strings, and
 * handing English to a field named "titleEs" tells the model the wrong
 * language. Same provider, model and wire shape as the other two paths.
 *
 * Guyana is staged (lib/staged-countries.ts), so what this writes is read in
 * the admin pages first. Run `npm run translate:tenders -- --sample 5` on the
 * first Guyanese rows and read them before trusting the prompt.
 */

const TranslatedItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  titleZh: z.string(),
  summaryZh: z.string(),
});

const BatchTranslationSchema = z.object({
  items: z.array(TranslatedItemSchema),
});

export type TenderToTranslateEn = {
  slug: string;
  titleEn: string;
  summaryEn: string;
  titleIsTruncated?: boolean;
};

const SYSTEM_PROMPT = `You translate Guyanese government tender titles and summaries from English to Chinese, for a platform that helps Chinese enterprises evaluate real bidding opportunities.

Guyana is an English-speaking country in South America. Its tenders are published by ministries and state companies through the National Procurement and Tender Administration Board (NPTAB), in British-influenced English.

Ground rules:
- Translate naturally and accurately — a Chinese business reader should immediately understand what is being procured. Chinese puts the place before the thing: 第三区莱瓜恩岛（Leguan）输水干管供应与安装, not 输水干管供应与安装，莱瓜恩岛.
- Guyana is divided into ten numbered administrative regions. "Region # 3", "Region No. 3" and "Region 3" are all 第三区; keep the region's name in parentheses only when the source gives one ("Region 4 (Demerara-Mahaica)" → 第四区（Demerara-Mahaica）).
- Put the English in full-width parentheses after a transliterated place, river, village, facility or project name: 莱瓜恩岛（Leguan）, 马海卡（Mahaica）, 阿伯里（Abary）. A transliteration alone is unsearchable; the English is what a bidder matches against the map and the bid documents. The exceptions are the country itself (圭亚那) and its capital 乔治敦. Copy the name inside the parentheses exactly as the source writes it. Once per distinct name in a field.
- Carry every reference code through unchanged: "GPL-PD-030-2026", "ICB No: GWI – CDB – W104 – 2026", "RFB No: P501759-CW-1", "Credit No.: IDA-77040", "Lot 1-4", a PROC number. Never invent one, never translate one.
- Amounts: "EE$36,086,600" is an engineer's estimate in Guyana dollars — render it as 工程师估价 36,086,600 圭亚那元, keeping the digits exactly. "G$" and "GY$" are Guyana dollars too; "US$" is US dollars.
- Procurement vocabulary, rendered these ways:
  · International Competitive Bidding (ICB) 国际竞争性招标（ICB）, National Competitive Bidding (NCB) 国内竞争性招标（NCB）, Request for Bids (RFB) 招标（RFB）, Request for Quotation (RFQ) 询价采购（RFQ）, Expression of Interest (EOI) 意向征集, Invitation to Bid 招标公告.
  · Procuring Entity 采购单位, the Tender Board / NPTAB 国家采购与招标管理委员会（NPTAB）, bid security 投标保证金, tender opening 开标, lot 标段.
  · Guyana Power & Light (GPL) 圭亚那电力照明公司（GPL）, Guyana Water Inc. (GWI) 圭亚那水务公司（GWI）, Hinterland Electrification Company Inc. (HECI) 内陆电气化公司（HECI）, GuySuCo 圭亚那糖业公司（GuySuCo）, Ministry of Public Works 公共工程部, Ministry of Public Utilities and Aviation 公用事业和航空部, Ministry of Housing 住房部, Ministry of Agriculture 农业部.
  · World Bank 世界银行, International Development Association (IDA) 国际开发协会（IDA）, Inter-American Development Bank (IDB) 美洲开发银行, Caribbean Development Bank (CDB) 加勒比开发银行.
- Engineering vocabulary, where a literal reading is wrong:
  · transmission mains 输水干管 (water pipelines — not electricity transmission lines); potable water well 饮用水井; kettle filters 压力滤罐; conservancy 蓄水区（灌溉排水蓄水区）; koker / sluice 排水闸; drainage and irrigation (D&I) 排灌; sea defence 海堤防护.
  · road corridor 道路走廊, rehabilitation and upgrade 改造升级, dual carriageway 双向分隔车道, asphalt concrete 沥青混凝土, culvert 涵洞, revetment 护岸.
  · pole mounted transformer 杆上变压器, transmission & distribution (T&D) materials 输配电材料, insulators 绝缘子, electrification 电气化（通电）工程, solar PV system 光伏系统.
- Preserve technical terms precisely — a mistranslated quantity, material or scope is a real error, not a stylistic one.
- Add nothing the source does not say. Many summaries restate the title; when that happens the Chinese summary renders the English and stops. Do not invent purpose, deliverables or procurement stages.
- Do not narrow a general term into a specific one, and render a term the same way in the title and the summary.
- Every word of the output is Chinese, except a name, acronym or code kept deliberately recognizable under the rules above.
- An item marked "titleTruncated": true had its title cut off by the source; build titleZh from the summary instead — one complete, concise Chinese title naming the work, the asset and the place.
- Return exactly one output item per input item, matched back by the echoed id (order doesn't need to match). The id is a pairing label, never part of the tender — never put it in titleZh or summaryZh.
- Respond with ONLY a JSON object of the shape {"items": [{"id": string, "titleZh": string, "summaryZh": string}, ...]} — no prose, no markdown fences.`;

export async function translateTenderBatchEn(items: TenderToTranslateEn[]): Promise<TranslatedTender[]> {
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });

  const response = await client.chat.completions.create({
    model: "qwen3.6-plus",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(
          items.map((item, index) => ({
            id: String(index + 1),
            titleEn: sanitizeForApi(item.titleEn),
            summaryEn: sanitizeForApi(item.summaryEn),
            ...(item.titleIsTruncated ? { titleTruncated: true } : {}),
          })),
        ),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Qwen en translation batch returned no content (finish_reason: ${response.choices[0]?.finish_reason})`);

  const parsed = BatchTranslationSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`Qwen en translation batch failed schema validation: ${parsed.error.message}`);

  return mapBatchResultsToSlugs(items, parsed.data.items);
}
