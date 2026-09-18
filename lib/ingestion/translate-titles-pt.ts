import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";
import { mapBatchResultsToSlugs } from "@/lib/ingestion/translate-titles-qwen";
import type { TranslatedTender } from "@/lib/ingestion/translate-titles";

/**
 * pt->zh title/summary translation, for Brazil (PNCP).
 *
 * A SEPARATE module from translate-titles-qwen.ts's Spanish path, at the
 * user's explicit instruction (2026-09-18: 标题、摘要翻译需要加入葡语部分，
 * 建议单独功能，不要和西班牙语混淆). It is the right shape for a reason
 * beyond tidiness: the Spanish prompt is not generic Latin American
 * procurement guidance that happens to mention Spanish. Half of it is rules
 * about specific Spanish strings — "5/A." as an ordinal, "OTE"/"PTE" as
 * Mexican compass abbreviations, "Ciudad Bolívar" as a Bogotá locality.
 * None of those appear in Portuguese, and two of them are actively wrong
 * there: a Brazilian road tender writes ordinals as 1ª/2ª directly, and
 * "PTE" in a Brazilian title really can be ponte (bridge), which the
 * Spanish prompt explicitly forbids reading it as. Merging the two would
 * mean a prompt that tells the model to misread Portuguese.
 *
 * The wire payload uses `titlePt`/`summaryPt`, not the `titleEs` the
 * Spanish path sends. The model reads its input keys: handing Portuguese
 * to a field named "Es" is telling it the text is Spanish, which is the
 * single most consequential thing it could be told wrong here.
 *
 * Same provider and model as the Spanish path — Qwen3.6-Plus through
 * DashScope's OpenAI-compatible endpoint, JSON mode plus zod validation.
 * Not a second opinion about the provider, just a second prompt.
 *
 * NOT LIVE-TESTED against Portuguese rows. The request shape is the one the
 * Spanish path has been running on since 2026-09-08, so the plumbing is
 * proven; the PROMPT is not. Run `npm run translate:tenders -- --sample 5`
 * once Brazil rows exist and read the five before writing any.
 */

const TranslatedItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  titleZh: z.string(),
  summaryZh: z.string(),
});

const BatchTranslationSchema = z.object({
  items: z.array(TranslatedItemSchema),
});

/** Same reasoning as the Spanish path: a slug carries a real procurement number, and a model told to carry codes through will find one there. A bare index carries nothing to mistake for content. */
export type TenderToTranslatePt = {
  slug: string;
  titlePt: string;
  summaryPt: string;
  titleIsTruncated?: boolean;
};

const SYSTEM_PROMPT = `You translate Brazilian government tender titles and summaries from Brazilian Portuguese to Chinese, for a platform that helps Chinese enterprises evaluate real bidding opportunities.

The source text is Brazilian Portuguese, not Spanish. Read it as Portuguese: several words the two languages share look identical and mean different things, and the list below names the ones that actually occur in this material.

Ground rules:
- Translate naturally and accurately — a Chinese business reader should immediately understand what is being procured, not read a stilted word-for-word rendering. Chinese puts the place before the thing: 米纳斯吉拉斯州埃洛伊门德斯（Elói Mendes）市教育局办公楼建设工程, not 建设工程，埃洛伊门德斯市. Portuguese trails its locations at the end, usually as "...DO MUNICÍPIO DE X/UF"; do not carry that order over.
- "MUNICÍPIO DE ELÓI MENDES/MG" is a municipality and its STATE, written as the state's two-letter code. Render both: 米纳斯吉拉斯州埃洛伊门德斯（Elói Mendes）市. Never transliterate the code as if it were a word, and never drop it — a Brazilian municipality name is frequently shared by several states, and the code is the only thing that says which one. The codes: AC 阿克里州, AL 阿拉戈斯州, AP 阿马帕州, AM 亚马孙州, BA 巴伊亚州, CE 塞阿拉州, DF 联邦区, ES 圣埃斯皮里图州, GO 戈亚斯州, MA 马拉尼昂州, MT 马托格罗索州, MS 南马托格罗索州, MG 米纳斯吉拉斯州, PA 帕拉州, PB 帕拉伊巴州, PR 巴拉那州, PE 伯南布哥州, PI 皮奥伊州, RJ 里约热内卢州, RN 北里奥格兰德州, RS 南里奥格兰德州, RO 朗多尼亚州, RR 罗赖马州, SC 圣卡塔琳娜州, SP 圣保罗州, SE 塞尔希培州, TO 托坎廷斯州.
- Put the Portuguese in full-width parentheses after a transliterated place, facility or project name: 埃洛伊门德斯（Elói Mendes）, 蒂安瓜（Tianguá）, 伊瓜苏河（Rio Iguaçu）. This name is the one thing in a title a bidder must match against a map and against the bid documents, and a transliteration on its own appears in neither — 蒂安瓜 is unsearchable, Tianguá is not.
  Add it by default. The exception is narrow: the country, or a place already familiar in Chinese — 巴西, 巴西利亚, 里约热内卢, 圣保罗, and the state names listed above. Everything below that level takes the parenthesis however sure you are of the transliteration: a município, a distrito, a bairro, a povoado, a river, a highway, a treatment plant.
  Copy the name inside the parentheses exactly as the Portuguese writes it, letter for letter. Normalising case and restoring accents is right — ELOI MENDES earning （Elói Mendes）is correct, since these sources routinely publish in unaccented capitals. Adding, dropping or altering a letter is not.
  The parenthesis holds the name alone, not the administrative word the Chinese already carries: MUNICÍPIO DE TIANGUÁ is 蒂安瓜（Tianguá）市, never 蒂安瓜市（Município de Tianguá）.
  Once per distinct name in a field.
- Carry every reference code through unchanged: "Pregão Eletrônico nº 90012/2026", "Concorrência nº 8/2026", "Processo Administrativo nº 1234/2026", "Edital nº 15/2026", "Tomada de Preços", "Lote 03", "Item 12", "CBUQ", "CREA", "CNPJ", a PNCP control number. These are how a bidder finds the procurement on the portal and matches it to a document. Never invent one, and never translate or transliterate one.
- Brazilian numbers use "." for thousands and "," for decimals: "R$ 2.812.092,09" is two million eight hundred twelve thousand reais, not two point eight. Read them that way, and write any amount you carry into the Chinese in the same Brazilian form rather than converting the punctuation.
- Procurement vocabulary, rendered these ways:
  · licitação 招标, edital 招标文件, pregão（eletrônico/presencial）电子/现场竞价采购, concorrência 公开招标, tomada de preços 价格征询, dispensa de licitação 免招标采购, inexigibilidade 不适用招标, chamada pública 公开征集, credenciamento 资格备案.
  · registro de preços / ata de registro de preços 价格登记（框架协议）— the published amount is a ceiling for the period, not a committed purchase; translate the term, do not describe it.
  · empreitada por preço global 总价承包, empreitada por preço unitário 单价承包, contratação integrada 设计施工总承包, contratação semi-integrada 部分设计施工总承包. These are legally distinct contracting regimes under Lei 14.133 — do not collapse them into a single "承包".
  · prefeitura（municipal）市政府, câmara municipal 市议会, secretaria municipal de X 市X局, autarquia 自治机构, consórcio público 公共联合体.
  · vigência 有效期, aditivo 补充协议, empenho 预算列支, reequilíbrio econômico-financeiro 经济财务再平衡.
- Engineering vocabulary, where a literal reading is wrong:
  · "obras de arte especiais" are bridges, viaducts and tunnels — 特殊构造物（桥梁、高架、隧道）. They are not artworks. "obras de arte correntes" are the small drainage structures — 一般构造物（涵洞等）.
  · passeio 人行道 (not an outing), meio-fio / guia e sarjeta 路缘石与边沟, tapa-buraco 坑槽修补, recapeamento / recape 路面罩面, pavimentação asfáltica 沥青路面工程, CBUQ 热拌沥青混凝土（CBUQ）, TSD 双层表面处治, drenagem pluvial 雨水排水, galeria de águas pluviais 雨水箱涵.
  · implantação de via / de rodovia is building a road that is not there yet — 新建道路, not "implementation". reforma 改造, ampliação 扩建, requalificação 提质改造, revitalização 修复整治.
  · ETA（Estação de Tratamento de Água）净水厂, ETE（Estação de Tratamento de Esgoto）污水处理厂, estação elevatória 提升泵站, adutora 输水干管, subestação 变电站, linha de transmissão 输电线路, rede de distribuição 配电网.
  · creche 托儿所, UBS（Unidade Básica de Saúde）基层卫生站, ESF 家庭健康服务站, quadra poliesportiva 综合运动场（不是「街区」）, ginásio（poliesportivo）体育馆, praça 广场.
- Preserve technical terms precisely — this is used to help a company decide whether to bid, so a mistranslated quantity, material, or scope is a real error, not a stylistic one.
- Add nothing the source does not say. Most of these rows carry a summary that is a verbatim copy of the title, because PNCP publishes one object text and no separate description; when that happens the Chinese summary should render the Portuguese and stop, even though the result is short and reads like a title. Do not pad it into something summary-shaped — no added purpose, no added deliverables, no procurement-stage note pulled in from elsewhere. The reader is deciding whether to bid on exactly the scope stated, and invented scope is the most expensive kind of error here.
- Do not narrow a general term into a specific one. Translate the breadth the Portuguese actually has.
- Within one item, render a given Portuguese term the same way in the title and in the summary. The same structure translated two ways reads as two different things.
- Every word of the output is Chinese. Leaving a Portuguese or English word sitting in a Chinese sentence is not a translation. The exception is a name or acronym kept deliberately recognizable — an agency acronym, a brand, a place, a technical code like CBUQ or CREA — which is the rule above, not a licence to skip a common noun.
- Two different Portuguese words listed together are two different things, so give them two different Chinese words. Collapsing a pair into one repeated word tells the reader the source said something it did not.
- An item marked "titleTruncated": true had its Portuguese title cut off by the source — it ends in an ellipsis, and the summary carries the whole sentence. Build titleZh from the summary instead of translating the fragment: one complete, concise Chinese title naming the work, the asset and the place. Keep it to title length; this is the name shown in a list, not the summary repeated. summaryZh is still the summary.
- Return exactly one output item per input item, matched back by the echoed id (order doesn't need to match the input). The id is a label for pairing input to output and is not part of the tender — never put it in titleZh or summaryZh.
- Respond with ONLY a JSON object of the shape {"items": [{"id": string, "titleZh": string, "summaryZh": string}, ...]} — no prose, no markdown fences.`;

export async function translateTenderBatchPt(items: TenderToTranslatePt[]): Promise<TranslatedTender[]> {
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
            titlePt: sanitizeForApi(item.titlePt),
            summaryPt: sanitizeForApi(item.summaryPt),
            ...(item.titleIsTruncated ? { titleTruncated: true } : {}),
          })),
        ),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`Qwen pt translation batch returned no content (finish_reason: ${response.choices[0]?.finish_reason})`);

  const parsed = BatchTranslationSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`Qwen pt translation batch failed schema validation: ${parsed.error.message}`);

  // Shared with the Spanish path on purpose — see that function's header. It
  // reads nothing but the slug and the array length, and it is the one place
  // where a quiet mistake puts a translation on the wrong tender.
  return mapBatchResultsToSlugs(items, parsed.data.items);
}
