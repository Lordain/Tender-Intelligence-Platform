import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";

/**
 * Chinese notes after the abbreviations in a full title, taken from the
 * tender's 一句话总结.
 *
 * User, 2026-10-12: 现在有很多项目的标题不清晰，用各种缩写 … 能不能通过一句话
 * 总结来优化标题. The example was 「H.M.E.M. Y N.改造、扩建与设备配置」: the
 * translation keeps the source's abbreviation, as it should, because title.zh
 * is what a subscriber matches against the bid documents. The 一句话总结 is
 * written after reading those documents, and usually says what the
 * abbreviation stands for.
 *
 * So the full title is never rewritten. The model only names abbreviations
 * and their meaning; the code inserts 「（meaning）」 after each one
 * (applyAbbreviationNotes). Every original character stays where it was, and
 * removing the inserted parentheses gives back the title exactly. A note is
 * kept only when the abbreviation occurs in the title and the meaning is a
 * verbatim piece of the 一句话总结. Anything else is dropped rather than
 * trusted.
 *
 * Same provider and pairing discipline as public-title-qwen.ts: Qwen3.7-Plus
 * on DashScope, JSON mode with zod validation, positional ids.
 */

const NoteSchema = z.object({ abbr: z.string(), zh: z.string() });
const BatchSchema = z.object({
  items: z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String), notes: z.array(NoteSchema) })),
});

const SYSTEM_PROMPT = `你会收到若干条招标信息，每条包含：id、titleZh（中文标题，里面可能夹着原文的拉丁字母缩写）、oneLineSummary（读过招标文件后写的一句话说明）。

任务：找出 titleZh 里读者看不懂的拉丁字母缩写或简称，并且只在 oneLineSummary 明确说明了它指什么的时候，给出中文说明。

每条输出 notes 数组，每个元素是 {"abbr": "...", "zh": "..."}：
- abbr：逐字照抄 titleZh 里的写法，包括大小写、点号和空格。例如 titleZh 写「H.M.E.M. Y N.」，abbr 就是「H.M.E.M. Y N.」。
- zh：从 oneLineSummary 里原样摘出的一段中文，正好说明这个缩写指什么。不许改写、不许加字、不许自己补全。oneLineSummary 里找不到就不要输出这一项。

不用处理的：
- 地名后面括号里的原文，例如 莱昂市（León）里的 León。那是原文拼写，不是缩写。
- 技术单位和中文读者熟悉的缩写：kV、MW、kWp、km、EPC、PPP、BOT、GIS、SCADA、LED、BIM、CCTV、LNG、HDPE、PVC、BRT 等。
- 招标编号、合同号、公路编号（BR-262、MT-449）。

没有需要说明的缩写，notes 返回 []。

例子：
输入：titleZh=H.M.E.M. Y N.改造、扩建与设备配置（第二次招标）；oneLineSummary=国防部为军队妇女与新生儿专科医院进行改造、扩建并配置医疗设备的工程。
输出：{"id":"1","notes":[{"abbr":"H.M.E.M. Y N.","zh":"军队妇女与新生儿专科医院"}]}

输入：titleZh=CESFAM 新建工程；oneLineSummary=在市镇新建一座家庭健康中心，含土建与设备。
输出：{"id":"2","notes":[{"abbr":"CESFAM","zh":"家庭健康中心"}]}

输入：titleZh=SLEP 学校维修；oneLineSummary=对多所公立学校进行维修。
输出：{"id":"3","notes":[]}
（oneLineSummary 没有说 SLEP 是什么，就不输出。）

只返回 JSON，形如 {"items":[{"id":"1","notes":[...]}]}，不要有任何其他文字或 markdown 代码块。`;

export type AbbreviationInput = { slug: string; titleZh: string; oneLineSummary: string };
export type AbbreviationNote = { abbr: string; zh: string };
export type AbbreviationResult = { slug: string; notes: AbbreviationNote[] };

export async function findAbbreviationNotesBatch(items: AbbreviationInput[]): Promise<AbbreviationResult[]> {
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY,
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  });
  const response = await client.chat.completions.create({
    model: "qwen3.7-plus",
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(items.map((item, index) => ({
          id: String(index + 1),
          titleZh: sanitizeForApi(item.titleZh),
          oneLineSummary: sanitizeForApi(item.oneLineSummary),
        }))),
      },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error(`缩写说明没有返回内容（finish_reason: ${response.choices[0]?.finish_reason}）`);
  const parsed = BatchSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`缩写说明结果不符合结构：${parsed.error.message}`);

  // Positional ids back to slugs; an id the batch never issued is dropped,
  // a duplicate keeps the first (same as mapDisplayTextToSlugs).
  const claimed = new Set<number>();
  const results: AbbreviationResult[] = [];
  for (const item of parsed.data.items) {
    const index = Number(item.id) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length || claimed.has(index)) continue;
    claimed.add(index);
    results.push({ slug: items[index].slug, notes: item.notes.map((note) => ({ abbr: note.abbr.trim(), zh: note.zh.trim() })) });
  }
  return results;
}

const LATIN = /[A-Za-z]/;
const MIN_NOTE = 2;
const MAX_NOTE = 30;

/**
 * Insert 「（zh）」 after each abbreviation in the title, and say why any note
 * was refused. Pure, so scripts/test-abbreviation-notes.ts can pin it.
 *
 * A note is refused when:
 * - the abbreviation is not in the title, or has no Latin letter;
 * - it sits inside a parenthesis already (莱昂市（León）), or is already
 *   followed by one: that is a spelling or an earlier note;
 * - the meaning is not a verbatim piece of the 一句话总结, holds Latin letters,
 *   or is outside 2–30 characters;
 * - the meaning is already in the title (a second run adds nothing).
 */
export function applyAbbreviationNotes(
  titleZh: string,
  oneLineSummary: string,
  notes: AbbreviationNote[],
): { title: string; applied: AbbreviationNote[]; refused: { note: AbbreviationNote; reason: string }[] } {
  let title = titleZh;
  const applied: AbbreviationNote[] = [];
  const refused: { note: AbbreviationNote; reason: string }[] = [];
  for (const note of notes) {
    const { abbr, zh } = note;
    const at = title.indexOf(abbr);
    let reason: string | null = null;
    if (abbr === "" || !LATIN.test(abbr)) reason = "不是拉丁字母缩写";
    else if (at < 0) reason = "标题里没有这个缩写";
    else if (/[（(][^）)]*$/.test(title.slice(0, at)) && /^[^（(]*[）)]/.test(title.slice(at + abbr.length))) reason = "在括号里（原文拼写）";
    else if (/^\s*[（(]/.test(title.slice(at + abbr.length))) reason = "后面已经有括号";
    else if (zh.length < MIN_NOTE || zh.length > MAX_NOTE) reason = `说明长度 ${zh.length} 字，不在 ${MIN_NOTE}–${MAX_NOTE} 字之间`;
    else if (LATIN.test(zh)) reason = "说明里有拉丁字母";
    else if (!oneLineSummary.includes(zh)) reason = "说明不是一句话总结里的原话";
    else if (title.includes(zh)) reason = "标题里已经有这个说明";
    if (reason !== null) {
      refused.push({ note, reason });
      continue;
    }
    title = `${title.slice(0, at + abbr.length)}（${zh}）${title.slice(at + abbr.length)}`;
    applied.push(note);
  }
  return { title, applied, refused };
}
