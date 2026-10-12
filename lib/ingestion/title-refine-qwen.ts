import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";

/**
 * Fix the member short title and the visitor title only where the 一句话总结
 * shows they are unclear; leave the rest exactly as they are.
 *
 * The first version regenerated both titles from scratch
 * (generateDisplayTextBatch). The user's 20-row preview on 2026-10-12 showed
 * what that costs. It fixed the titles that needed it (H.M.E.M. Y N., SSYRA,
 * HGSMF, 「E总部」, a bare campus name, 配给管网 that the summary shows is a
 * power network), but it also reworded 12 titles that were fine. One of those
 * dropped two place names a subscriber matches against the bid documents
 * (帕卡西（Pacasi）和普纳（Puna） → 等三区). So this prompt sees the current
 * titles and must return them unchanged unless one of three named reasons
 * applies, and refine checks in code that no source spelling was dropped.
 *
 * Same provider and pairing discipline as public-title-qwen.ts.
 */

const ItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  titleZhShort: z.string(),
  titleZhPublic: z.string(),
});
const BatchSchema = z.object({ items: z.array(ItemSchema) });

const SYSTEM_PROMPT = `你会收到若干条已经上线的招标标题，判断要不要改。绝大多数应该原样保留。

每条输入：id、country（国家）、titleZh（完整中文标题）、oneLineSummary（读过招标文件后写的一句话说明，比标题可靠）、titleZhShort（现在给订阅用户看的短标题）、titleZhPublic（现在给访客看的标题）。
每条输出：titleZhShort、titleZhPublic。

只有下面三种情况才改，而且只改有问题的那一处：
1. 标题里有读者看不懂的拉丁字母缩写、简称或单个字母（例如 SSYRA、HGSMF、H.M.E.M. Y N.、「E总部」），而 oneLineSummary 说明了它指什么 → 用中文写出它是什么。
2. 标题没说清楚是什么工程或采购（例如只有一个校区或设施的名字），而 oneLineSummary 说了 → 补上工作内容。
3. 标题和 oneLineSummary 明显矛盾，说明翻译错了（例如 oneLineSummary 说的是配电网，标题却写成「配给管网」）→ 按 oneLineSummary 改正。

除此以外一律原样返回，一个字都不要动，包括标点、空格和括号。不要为了更顺口、更简洁、换个说法、加行业括号（例如（市政给排水））而改。拿不准就不改。

改订阅用户短标题（titleZhShort）时：
- 现有短标题里的地名和地名后面括号里的原文，必须全部保留，例如 帕卡西（Pacasi）、埃洛伊门德斯（Elói Mendes）。不许删，不许合并成「等三区」。
- 中文正文 12 到 30 个字（括号里的原文不计入）。
- 不许出现 titleZh 和 oneLineSummary 里都没有的信息，也不许出现它们里面都没有的外文词。
- 保留正常的标点，不要把几段话挤成一串。

改访客标题（titleZhPublic）时：
- 以国家名开头；8 到 25 个汉字。
- 不许出现国家以下的地名、机构名、设施或项目的专有名称、任何编号，以及除技术单位和 EPC/PPP/GIS 这类通用缩写外的拉丁字母。
- 不许用 ███、XX、某某 之类的遮挡符号。

例子：
输入：titleZh=H.M.E.M. Y N.（军事妇女与新生儿专科医院）改造、扩建与设备配置（第二次招标）；oneLineSummary=为国防部军事妇女与新生儿专科医院改造、扩建及设备采购；titleZhShort=H.M.E.M. Y N.改造、扩建与设备配置；titleZhPublic=墨西哥 医疗设施改造扩建与设备配置工程
输出：titleZhShort=军事妇女与新生儿专科医院改造、扩建与设备配置；titleZhPublic=墨西哥 医疗设施改造扩建与设备配置工程
（访客标题已经清楚，原样返回。）

输入：titleZh=比拉卡亚（Vilacaya）、帕卡西（Pacasi）和普纳（Puna）区农村电气化施工工程；oneLineSummary=在波托西省高海拔农村地区建设中低压配电线路及变压器安装工程；titleZhShort=比拉卡亚（Vilacaya）、帕卡西（Pacasi）和普纳（Puna）区农村电气化施工；titleZhPublic=玻利维亚 农村电气化施工工程
输出：两个都原样返回。

只返回 JSON，形如 {"items":[{"id":"1","titleZhShort":"...","titleZhPublic":"..."}]}，不要有任何其他文字或 markdown 代码块。`;

export type RefineInput = {
  slug: string;
  country: string | null;
  titleZh: string;
  oneLineSummary: string;
  titleZhShort: string;
  titleZhPublic: string;
};
export type RefineResult = { slug: string; titleZhShort: string; titleZhPublic: string };

export async function refineTitlesBatch(items: RefineInput[]): Promise<RefineResult[]> {
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });
  const response = await client.chat.completions.create({
    model: "qwen3.7-plus",
    max_tokens: 6000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(items.map((item, index) => ({
          id: String(index + 1),
          country: item.country ?? "",
          titleZh: sanitizeForApi(item.titleZh),
          oneLineSummary: sanitizeForApi(item.oneLineSummary),
          titleZhShort: sanitizeForApi(item.titleZhShort),
          titleZhPublic: sanitizeForApi(item.titleZhPublic),
        }))),
      },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`标题修正没有返回内容（finish_reason: ${response.choices[0]?.finish_reason}）`);
  const parsed = BatchSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`标题修正结果不符合结构：${parsed.error.message}`);

  const claimed = new Set<number>();
  const results: RefineResult[] = [];
  for (const item of parsed.data.items) {
    const index = Number(item.id) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length || claimed.has(index)) continue;
    claimed.add(index);
    results.push({ slug: items[index].slug, titleZhShort: item.titleZhShort.trim(), titleZhPublic: item.titleZhPublic.trim() });
  }
  return results;
}

const SOURCE_SPELLING = /（[^（）]*[A-Za-z][^（）]*）/g;

/**
 * Source spellings in the old short title that the new one dropped, e.g.
 * 「（Pacasi）」. They are what a subscriber matches against the bid documents,
 * so a refined title that loses one is refused.
 */
export function droppedSourceSpellings(before: string, after: string): string[] {
  return [...new Set(before.match(SOURCE_SPELLING) ?? [])].filter((spelling) => !after.includes(spelling));
}
