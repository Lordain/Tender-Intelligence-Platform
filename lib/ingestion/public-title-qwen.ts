import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";

/**
 * Generate the de-identified public title (migration 0053, lib/public-title.ts).
 *
 * Runs on the CHINESE title, not the Spanish/Portuguese original — which is
 * also what makes one prompt enough for both source languages. The es and pt
 * translation prompts are separate and must be (translate-titles-qwen.ts,
 * translate-titles-pt.ts), but they converge here: by the time this runs,
 * a Peruvian row and a Brazilian one are both Chinese carrying the same
 * full-width-parenthesis anchor, 卡哈马卡区（Cajamarca）and 埃洛伊门德斯
 * （Elói Mendes）, and removing it is one job rather than two. A row is never
 * selected by language (see needsPublicTitle), so neither can be forgotten. The
 * translation has already done the hard part — reading procurement prose,
 * placing ordinals, getting the compass abbreviations right — and redoing it
 * from the source would mean a second prompt that can disagree with the
 * first, so the two titles on one tender could describe different work. This
 * prompt only removes.
 *
 * Same provider, transport and pairing discipline as
 * translate-titles-qwen.ts: Qwen3.6-Plus on DashScope's OpenAI-compatible
 * endpoint, JSON mode with manual zod validation, and a positional id rather
 * than the slug — a slug carries a real procurement number, and this is the
 * one prompt in the codebase whose entire job is to not emit one.
 *
 * NOT LIVE-TESTED: this sandbox has no DASHSCOPE_API_KEY and cannot reach
 * Supabase. Everything that can be checked without the network is —
 * scripts/test-public-title.ts covers the pairing and the publishability
 * rules — but the prompt itself has never met a real row. Run
 * `npm run titles:public -- --sample 20` before any write.
 */

const PublicTitleItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  titleZhPublic: z.string(),
});

const BatchSchema = z.object({ items: z.array(PublicTitleItemSchema) });

const SYSTEM_PROMPT = `你的任务是把一条已经翻译好的中文招标标题，改写成一条「可公开的品类标题」。

这条公开标题会展示给未订阅的访客和搜索引擎。原标题会展示给付费订阅用户，不需要你改动。

要删掉的（这些能让人反查到原始招标公告）：
- 国家以下的一切地名：州、省、大区、市、县、区、镇、村、街道、河流、道路名、园区名。
- 地名后面括号里的原文（例如 马塔德罗（Matadero）泵站 里的「马塔德罗（Matadero）」整个要去掉）。
- 具体设施、厂站、项目的专有名称（某某炼油厂、某某医院、某某大桥的名字）。
- 采购机构、政府部门、国有企业的名称。
- 一切编号与代码：项目编号、招标编号、BPIN、CUI、桩号（K0+000）、路线编号（BR-262、BR 262）、合同号。
- 任何拉丁字母写的专有名词。
- 巴西项目里的州名和州代码：米纳斯吉拉斯州、圣保罗州，以及 MG、SP、RJ 这类两字母州代码，全部删掉，只留「巴西」。
- 「市政府」「市议会」「某某市X局」这类机构写法（prefeitura、câmara municipal、secretaria）也要删掉。

要保留的（这些正是这个页面要被搜索到的词）：
- 国家名，而且放在开头：墨西哥、巴西、哥伦比亚、秘鲁。
- 工程或采购的类型：新建、扩建、改造、维修、采购、特许经营、勘察设计、监理。
- 标的物本身：变电站、输电线路、公路、桥梁、隧道、港口、码头、水厂、污水处理厂、医院、学校、光伏电站、数据中心。
- 技术等级与单位，如果原标题里有：34.5kV、220kV、双向四车道。这些可以保留拉丁字母单位（kV、MW、km）。
- 行业词，必要时补一个括号说明：（输配电）、（市政给排水）。

写法要求：
- 输出必须是一条通顺的中文标题，像一个分类名，不是一句被涂黑的话。绝对不要用 ███、XX、某某、【已隐藏】之类的遮挡符号——宁可写得更笼统，也不要写成残缺的句子。
- 以国家名开头。
- 长度控制在 8 到 25 个汉字。
- 除了技术单位和 EPC/PPP/GIS 这类通用缩写，输出里不允许出现任何拉丁字母。
- 不要添加原标题里没有的信息。不确定标的物是什么，就写得更笼统（例如「墨西哥 市政基础设施工程」），不要猜。

例子：
输入：瓜纳华托州莱昂市（León）第三环路 34.5kV 变电站扩建工程
输出：墨西哥 34.5kV 变电站扩建工程（输配电）

输入：OP088.- 韦曼吉约（Huimanguillo）梅斯卡拉帕河（Río Mezcalapa）护岸工程
输出：墨西哥 河道护岸工程（水利）

输入：卡哈马卡区（Cajamarca）卫生站医疗设备采购
输出：秘鲁 医疗设备采购

输入：巴西国家陆路运输管理局 BR-262 公路养护服务
输出：巴西 公路养护服务

输入：米纳斯吉拉斯州埃洛伊门德斯（Elói Mendes）市教育局办公楼建设工程
输出：巴西 教育设施建设工程

输入：塞阿拉州蒂安瓜（Tianguá）市 ETE 污水处理厂扩建及雨水箱涵工程
输出：巴西 污水处理厂扩建工程（市政给排水）

输入：巴拉那州伊瓜苏河（Rio Iguaçu）大桥 CBUQ 沥青路面罩面工程
输出：巴西 桥梁沥青路面罩面工程

只返回 JSON，形如 {"items":[{"id":"1","titleZhPublic":"..."}]}，不要有任何其他文字或 markdown 代码块。`;

export type PublicTitleInput = { slug: string; titleZh: string; country: string | null };
export type GeneratedPublicTitle = { slug: string; titleZhPublic: string };

export async function generatePublicTitleBatch(items: PublicTitleInput[]): Promise<GeneratedPublicTitle[]> {
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
        content: JSON.stringify(items.map((item, index) => ({
          id: String(index + 1),
          titleZh: sanitizeForApi(item.titleZh),
          // The country is the one identifier the output must KEEP, and the
          // Chinese title does not always name it. Sent separately so the
          // model never has to infer it from a place name it is being told
          // to delete.
          country: item.country ?? "",
        }))),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`公开标题生成没有返回内容（finish_reason: ${response.choices[0]?.finish_reason}）`);
  }

  const parsed = BatchSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`公开标题生成结果不符合结构：${parsed.error.message}`);

  return mapPublicTitlesToSlugs(items, parsed.data.items);
}

/**
 * Pair positional ids back to slugs.
 *
 * Same shape and same reasoning as mapBatchResultsToSlugs in
 * translate-titles-qwen.ts — an id the batch never issued is dropped rather
 * than guessed at, and a duplicate claim keeps the first. A misattributed
 * public title is the worst failure available here: every row would read
 * correctly and one tender would be published under another's name.
 */
export function mapPublicTitlesToSlugs(
  items: { slug: string }[],
  results: { id: string; titleZhPublic: string }[],
): GeneratedPublicTitle[] {
  const claimed = new Set<number>();
  const mapped: GeneratedPublicTitle[] = [];

  for (const result of results) {
    const index = Number(result.id) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) continue;
    if (claimed.has(index)) continue;
    claimed.add(index);
    mapped.push({ slug: items[index].slug, titleZhPublic: result.titleZhPublic.trim() });
  }

  return mapped;
}
