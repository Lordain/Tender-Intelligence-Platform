import OpenAI from "openai";
import { z } from "zod";
import { sanitizeForApi } from "@/lib/ingestion/text-sanitize";

/**
 * Generate the three derived display strings for a tender, in one call:
 * the member short title (migration 0054), the de-identified public title
 * (0053) and the de-identified public summary (0054).
 *
 * One call rather than three passes because all three are rewrites of the
 * same two Chinese strings for different audiences, and because a separate
 * pass per field can disagree with itself — a public title saying 隧道 above
 * a public summary saying 道路 describes two different projects on one page.
 * Sharing the input also makes the contrast explicit to the model: the short
 * title KEEPS the place and its full-width parenthesis, the public pair drops
 * them, and stating both in one prompt is what stops the middle case (a
 * "public" title that quietly keeps a district name) from looking reasonable.
 *
 * Runs on the CHINESE text, not the Spanish/Portuguese original — which is
 * also what makes one prompt enough for both source languages. The es and pt
 * translation prompts are separate and must be (translate-titles-qwen.ts,
 * translate-titles-pt.ts), but they converge here: by the time this runs,
 * a Peruvian row and a Brazilian one are both Chinese carrying the same
 * full-width-parenthesis anchor, 卡哈马卡区（Cajamarca）and 埃洛伊门德斯
 * （Elói Mendes）, and removing it is one job rather than two. A row is never
 * selected by language (see needsDisplayText), so neither can be forgotten.
 * The translation has already done the hard part — reading procurement prose,
 * placing ordinals, getting the compass abbreviations right — and redoing it
 * from the source would mean a second prompt that can disagree with the
 * first. This prompt only removes and shortens; it never re-translates.
 *
 * Nothing here overwrites `title.zh` or `summary.zh`. Those stay exactly as
 * translated — they are the archival record a subscriber matches against the
 * bid documents, they are guarded by findDroppedIdentifiers(), and clearing
 * the three generated columns returns the site to its previous behaviour.
 *
 * Same provider, transport and pairing discipline as
 * translate-titles-qwen.ts: Qwen3.6-Plus on DashScope's OpenAI-compatible
 * endpoint, JSON mode with manual zod validation, and a positional id rather
 * than the slug — a slug carries a real procurement number, and this is the
 * one prompt in the codebase whose entire job is to not emit one.
 */

const DisplayTextItemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  titleZhShort: z.string(),
  titleZhPublic: z.string(),
  summaryZhPublic: z.string(),
});

const BatchSchema = z.object({ items: z.array(DisplayTextItemSchema) });

const SYSTEM_PROMPT = `你要为一条已经翻译好的中文招标信息生成三段新文本。原来的 titleZh 和 summaryZh 不要改动，它们会照常展示给付费订阅用户。

输入每条包含：id、country（国家）、titleZh（完整中文标题）、summaryZh（完整中文摘要）。
对每一条输出三个字段：titleZhShort、titleZhPublic、summaryZhPublic。

═══ 【1】titleZhShort —— 给付费订阅用户看的短标题 ═══

完整标题是一句行政公文，放进列表就读不下去。短标题要让人一眼看懂「在哪里、干什么」。

保留：
- 地名，以及地名后面括号里的原文，例如 埃洛伊门德斯（Elói Mendes）市。订阅用户要靠这个去对招标文件，绝对不能删。留到市一级即可，州名可留可不留，哪个更好读留哪个。
- 标的物本身：变电站、输电线路、公路、桥梁、隧道、港口、码头、水厂、污水处理厂、医院、学校、光伏电站。
- 工程类型：新建、扩建、改造、修复、维修、养护、采购、特许经营、勘察设计、监理。
- 有意义的规模与等级：34.5kV、双向四车道、约7公里。
- 属于资产本身名字的编号：BR-262、MT-449 这类公路编号要留。

删掉：
- 采购程序的壳：开头的「公开招标（电子）第023/2026号——」、结尾的「招标」「公开招标」「服务采购（含材料与人工）」。
- 招标编号、合同号、协议号、联邦转移支付协议号——这些另有字段。
- 指向文件的话：「技术及条件详见基本项目文件及其附件」。
- 资金来源和项目背景：「依据SINFRA 0560-2026协议」「属于伊泰普不止于能源项目范畴」「由代表伊泰普的联邦储蓄银行签署」。
- 街道级地址：「位于卡瓦柳街（Rua Carvalho）与火烈鸟大道交汇处」「位于大学扩展区地块」。
- 工作内容的长串罗列：「（基础设计/施工图设计/竣工图及工程施工）」压成「设计施工」。

要求：中文正文 12 到 30 个字（括号里的原文不计入，所以地名长不要紧）；必须比原标题短；不许出现原标题里没有的信息，尤其不许出现原标题里没有的外文词——括号里的原文必须逐字来自原标题。

═══ 【2】titleZhPublic —— 给访客和搜索引擎看的品类标题 ═══

这条要让人反查不到原始招标公告。

删掉（比【1】严格得多）：
- 国家以下的一切地名：州、省、大区、市、县、区、镇、村、街道、河流、道路名、园区名。
- 地名后面括号里的原文，整块删掉（马塔德罗（Matadero）泵站 里的「马塔德罗（Matadero）」全部去掉）。
- 具体设施、厂站、项目的专有名称。
- 采购机构、政府部门、国有企业的名称，以及「市政府」「市议会」「某某市X局」这类写法。
- 一切编号与代码：项目编号、招标编号、BPIN、CUI、桩号（K0+000）、路线编号（BR-262、MT-449）、合同号。
- 任何拉丁字母写的专有名词。
- 巴西的州名和州代码：米纳斯吉拉斯州、圣保罗州，以及 MG、SP、RJ 这类两字母代码，全删，只留「巴西」。

保留（这些正是这个页面要被搜索到的词）：
- 国家名，放在开头：墨西哥、巴西、哥伦比亚、秘鲁。
- 工程或采购的类型，标的物本身，技术等级与单位（34.5kV、双向四车道）。
- 行业词，必要时补一个括号说明：（输配电）、（市政给排水）。

要求：8 到 25 个汉字；以国家名开头；除技术单位和 EPC/PPP/GIS 这类通用缩写外不许出现拉丁字母；绝不使用 ███、XX、某某、【已隐藏】之类的遮挡符号——宁可写得更笼统，也不要写成残缺的句子；不确定标的物是什么就写得更笼统（例如「墨西哥 市政基础设施工程」），不要猜。

═══ 【3】summaryZhPublic —— 给访客和搜索引擎看的公开摘要 ═══

这段会出现在搜索结果里，别人不点进来就能读到。要删的东西和【2】完全一样：地名、机构名、设施专名、括号里的原文、各种编号。

另外要处理精确数字：精确到小数的数量本身就能被反查，和地名一样危险。「6.93公里」写成「约7公里」，「新建12间教室」写成「十余间教室」，「面积4,287平方米」写成「四千余平方米」。技术等级不用改（34.5kV、双向四车道照写）。

写什么：这是一类什么采购、大致规模、包含哪些工作内容、对投标人意味着什么。
要求：
- 40 到 90 个汉字，一到两句通顺的中文。
- 必须比 titleZhPublic 多给出信息。把标题换个说法重复一遍是不合格的——读者已经在标题里看过了。
- 不许用遮挡符号；除技术单位和通用缩写外不许出现拉丁字母。
- 不要添加原文没有的信息。摘要本身很短、什么都没多说时，就只写标题里那点内容的展开，不要编造工期、资金来源或政策背景。

═══ 例子 ═══

输入：country=墨西哥；titleZh=瓜纳华托州莱昂市（León）第三环路 34.5kV 变电站扩建工程；summaryZh=本项目为莱昂市第三环路变电站扩建，包含34.5kV开关柜安装、控制保护系统改造及配套土建工程。
输出：
  titleZhShort：莱昂市（León）第三环路34.5kV变电站扩建
  titleZhPublic：墨西哥 34.5kV 变电站扩建工程（输配电）
  summaryZhPublic：城市环路变电站的扩建工程，包含34.5kV开关柜安装、控制保护系统改造以及配套土建施工，投标人需同时具备电气安装与土建施工能力。

输入：country=巴西；titleZh=马托格罗索州卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449号公路6.93公里路段修复与新建工程服务采购（含材料与人工），依据SINFRA 0560-2026协议；summaryZh=对MT-449号公路6.93公里路段实施路面修复与新建，含材料与人工。
输出：
  titleZhShort：卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449公路修复与新建
  titleZhPublic：巴西 公路修复与新建工程
  summaryZhPublic：州级公路约七公里路段的路面修复与新建工程，由承包方包工包料实施，属于州交通主管部门的年度公路养护与改建计划。

输入：country=巴西；titleZh=公开招标（电子）第023/2026号——专业工程公司承建专业社会救助参考中心（CREAS），位于塞乌阿祖尔社区（Bairro Céu Azul）；summaryZh=承建专业社会救助参考中心一座。
输出：
  titleZhShort：塞乌阿祖尔社区（Bairro Céu Azul）社会救助中心新建
  titleZhPublic：巴西 社会救助设施建设工程
  summaryZhPublic：市级社会救助服务设施的新建工程，为单体公共建筑，涵盖土建、装修及配套水电安装，由具备相应资质的工程公司总承包实施。

输入：country=秘鲁；titleZh=卡哈马卡区（Cajamarca）卫生站医疗设备采购；summaryZh=为卡哈马卡区卫生站采购医疗设备。
输出：
  titleZhShort：卡哈马卡区（Cajamarca）卫生站医疗设备采购
  titleZhPublic：秘鲁 医疗设备采购
  summaryZhPublic：基层卫生机构的医疗设备采购项目，由地方卫生主管部门组织，采购范围为诊疗与检查类设备及其安装调试和售后服务。

只返回 JSON，形如 {"items":[{"id":"1","titleZhShort":"...","titleZhPublic":"...","summaryZhPublic":"..."}]}，不要有任何其他文字或 markdown 代码块。`;

export type DisplayTextInput = {
  slug: string;
  titleZh: string;
  summaryZh: string;
  country: string | null;
};

export type GeneratedDisplayText = {
  slug: string;
  titleZhShort: string;
  titleZhPublic: string;
  summaryZhPublic: string;
};

export async function generateDisplayTextBatch(items: DisplayTextInput[]): Promise<GeneratedDisplayText[]> {
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
          summaryZh: sanitizeForApi(item.summaryZh),
          // The country is the one identifier the public output must KEEP, and
          // the Chinese title does not always name it. Sent separately so the
          // model never has to infer it from a place name it is being told to
          // delete.
          country: item.country ?? "",
        }))),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`公开文案生成没有返回内容（finish_reason: ${response.choices[0]?.finish_reason}）`);
  }

  const parsed = BatchSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`公开文案生成结果不符合结构：${parsed.error.message}`);

  return mapDisplayTextToSlugs(items, parsed.data.items);
}

/**
 * Pair positional ids back to slugs.
 *
 * Same shape and same reasoning as mapBatchResultsToSlugs in
 * translate-titles-qwen.ts — an id the batch never issued is dropped rather
 * than guessed at, and a duplicate claim keeps the first. A misattributed
 * title is the worst failure available here: every row would read correctly
 * and one tender would be published under another's name.
 */
export function mapDisplayTextToSlugs(
  items: { slug: string }[],
  results: { id: string; titleZhShort: string; titleZhPublic: string; summaryZhPublic: string }[],
): GeneratedDisplayText[] {
  const claimed = new Set<number>();
  const mapped: GeneratedDisplayText[] = [];

  for (const result of results) {
    const index = Number(result.id) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) continue;
    if (claimed.has(index)) continue;
    claimed.add(index);
    mapped.push({
      slug: items[index].slug,
      titleZhShort: result.titleZhShort.trim(),
      titleZhPublic: result.titleZhPublic.trim(),
      summaryZhPublic: result.summaryZhPublic.trim(),
    });
  }

  return mapped;
}
