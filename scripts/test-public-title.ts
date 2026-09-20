import {
  GENERIC_PUBLIC_SUMMARY,
  isPublishablePublicTitle,
  publicSummaryOf,
  publicSummaryProblems,
  publicTitleOf,
  publicTitleProblems,
  shortTitleOf,
  shortTitleProblems,
} from "../lib/public-title";
import { mapDisplayTextToSlugs } from "../lib/ingestion/public-title-qwen";
import { checkGenerated, needsDisplayText } from "../lib/ingestion/generate-public-titles";
import { buildRowWithProtectedValues } from "../lib/ingestion/upsert-tenders";
import type { Tender } from "../types/tender";

let ran = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  ran += 1;
  if (actual !== expected) failures.push(`${name}：期望 ${String(expected)}，实际 ${String(actual)}`);
}

function accepts(title: string): void {
  ran += 1;
  const problems = publicTitleProblems(title);
  if (problems.length > 0) failures.push(`应当通过却被拒绝：「${title}」——${problems.join("；")}`);
}

function rejects(title: string, because: string): void {
  ran += 1;
  if (isPublishablePublicTitle(title)) failures.push(`应当被拒绝（${because}）却通过了：「${title}」`);
}

// --- What a good public title looks like ----------------------------------
// These keep the country and the works type — the words these pages are
// meant to rank for — and name no place, agency or code.
accepts("墨西哥 34.5kV 变电站扩建工程（输配电）");
accepts("秘鲁 医疗设备采购");
accepts("巴西 公路养护服务");
accepts("哥伦比亚 污水处理厂新建工程（市政给排水）");
accepts("墨西哥 河道护岸工程（水利）");
accepts("巴西 港口码头特许经营");
accepts("墨西哥 220kV 输电线路工程");
accepts("秘鲁 双向四车道公路改扩建工程");
accepts("巴西 光伏电站 EPC 总承包");
accepts("哥伦比亚 城市轨道交通土建工程");

// --- The failure this column exists to prevent ----------------------------
// The translation prompt puts the source name in full-width parentheses on
// purpose. A "public" title that still carries one has de-identified nothing:
// the Spanish proper noun is the search key.
rejects("墨西哥 马塔德罗（Matadero）泵站改造工程", "保留了括号内的原文名称");
rejects("秘鲁 卡哈马卡区（Cajamarca）卫生站医疗设备采购", "保留了括号内的原文名称");
rejects("墨西哥 韦曼吉约(Huimanguillo)河道护岸工程", "半角括号里的原文名称也要拒绝");

// Bare Latin proper nouns, with no parentheses at all.
rejects("巴西 BR-262 公路养护服务", "路线编号");
rejects("墨西哥 PEMEX 炼油厂检修", "机构名称");
rejects("秘鲁 Piura 供水管网工程", "地名");

// Reference codes in any shape.
rejects("墨西哥 OP088 中低压配电网改造", "项目编号");
rejects("哥伦比亚 BPIN 20241301010259 道路工程", "项目编号");
rejects("秘鲁 CUI 2457630 灌溉渠道工程", "项目编号");
rejects("墨西哥 K0+000 至 K12+500 公路改造", "桩号");

// Masking is not de-identification — it is a broken page that ranks for
// nothing, which is the outcome this whole approach exists to avoid.
rejects("墨西哥 ███████ 变电站扩建工程", "遮挡符号不是合格标题");

// Shape guards.
rejects("", "空标题");
rejects("   ", "只有空白");
rejects(`墨西哥 ${"变电站扩建工程".repeat(10)}`, "超长");

// --- Portuguese rows go through the same rules -----------------------------
// The es and pt translation prompts are separate, but both produce a Chinese
// title carrying the same full-width-parenthesis anchor, so one public-title
// pass covers both. These are real shapes from translate-titles-pt.ts.
accepts("巴西 教育设施建设工程");
accepts("巴西 污水处理厂扩建工程（市政给排水）");
accepts("巴西 桥梁沥青路面罩面工程");
rejects("巴西 埃洛伊门德斯（Elói Mendes）市教育局办公楼建设工程", "葡语地名与括号原文");
rejects("巴西 蒂安瓜（Tianguá）市污水处理厂扩建工程", "葡语地名与括号原文");
rejects("巴西 伊瓜苏河（Rio Iguaçu）大桥路面罩面工程", "葡语河名与括号原文");
// A Brazilian state code names one state; a state is what the public title
// drops, so the code must not survive as an "abbreviation".
rejects("巴西 MG 州公路养护服务", "州代码");
rejects("巴西 SP 州学校建设工程", "州代码");
// But the generic Brazilian facility and material classes are fine — each
// names a kind of thing shared by thousands of tenders.
accepts("巴西 ETE 污水处理厂扩建工程");
accepts("巴西 UBS 基层卫生站建设工程");
accepts("巴西 CBUQ 沥青路面罩面工程");

// --- The allowlist is narrow but real -------------------------------------
// Technical units and delivery-model abbreviations are how Chinese
// engineering copy is actually written, and identify nothing.
accepts("墨西哥 500kV 变电站工程");
accepts("巴西 300MW 风电场工程");
accepts("秘鲁 15km 输水管线工程");
accepts("哥伦比亚 PPP 高速公路特许经营");
accepts("巴西 GIS 组合电器采购");
// A year is not a procurement number; a long digit run is.
accepts("墨西哥 2026 年度公路养护服务");
rejects("墨西哥 1234567 号公路养护服务", "六位以上数字是编号");

// --- Reading the title off a tender ---------------------------------------
const withPublic = { title: { zh: "瓜纳华托州莱昂市（León）变电站扩建工程", es: "AMPLIACIÓN", en: "" }, titleZhPublic: "墨西哥 变电站扩建工程（输配电）" };
check("有公开标题时用公开标题", publicTitleOf(withPublic), "墨西哥 变电站扩建工程（输配电）");

const withoutPublic = { title: { zh: "瓜纳华托州莱昂市（León）变电站扩建工程", es: "AMPLIACIÓN", en: "" }, titleZhPublic: undefined };
check("没有公开标题时回落到完整标题", publicTitleOf(withoutPublic), "瓜纳华托州莱昂市（León）变电站扩建工程");

const blankPublic = { title: { zh: "某变电站扩建工程", es: "AMPLIACIÓN", en: "" }, titleZhPublic: "   " };
check("空白的公开标题按没有处理", publicTitleOf(blankPublic), "某变电站扩建工程");

// --- Reading the short title and the public summary off a tender ----------
const zhTitle = { zh: "马托格罗索州卢卡斯（Lucas）市MT-449号公路修复工程服务采购", es: "AQUISIÇÃO", en: "" };
check("有短标题时用短标题", shortTitleOf({ title: zhTitle, titleZhShort: "卢卡斯（Lucas）市MT-449公路修复" }), "卢卡斯（Lucas）市MT-449公路修复");
check("没有短标题时回落到完整翻译", shortTitleOf({ title: zhTitle, titleZhShort: undefined }), zhTitle.zh);
check("空白短标题按没有处理", shortTitleOf({ title: zhTitle, titleZhShort: "  " }), zhTitle.zh);

// The summary is the one that FAILS CLOSED. publicTitleOf falls back to the
// real title because a blank <h1> is not an option; this one must not, because
// summary.zh restates the project name and the municipality and a fallback
// would keep publishing exactly what the redacted title just removed.
check("有公开摘要时用公开摘要", publicSummaryOf({ summaryZhPublic: "州级公路路面修复工程。" }), "州级公路路面修复工程。");
check("没有公开摘要时返回 undefined，而不是回落到原摘要", publicSummaryOf({ summaryZhPublic: undefined }), undefined);
check("空白公开摘要也返回 undefined", publicSummaryOf({ summaryZhPublic: "   " }), undefined);
ran += 1;
if (GENERIC_PUBLIC_SUMMARY.trim() === "") failures.push("占位摘要不能为空——访客页会出现空白摘要块");

// --- Checking a condensed member title ------------------------------------
// Looser than the public rules on purpose: the place name and its full-width
// parenthesis are REQUIRED here, because that is what a member matches
// against the bid documents. What this guards is invention, not identity.
const fullTitle = "马托格罗索州卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449号公路6.93公里路段修复与新建工程服务采购（含材料与人工），依据SINFRA 0560-2026协议";
function acceptsShort(candidate: string): void {
  ran += 1;
  const problems = shortTitleProblems(candidate, fullTitle);
  if (problems.length > 0) failures.push(`短标题应当通过却被拒绝：「${candidate}」——${problems.join("；")}`);
}
/** Same, against an explicit source title — the real rows below each have their own. */
function acceptsShortFrom(candidate: string, sourceTitleZh: string): void {
  ran += 1;
  const problems = shortTitleProblems(candidate, sourceTitleZh);
  if (problems.length > 0) failures.push(`短标题应当通过却被拒绝：「${candidate}」——${problems.join("；")}`);
}
function rejectsShortFrom(candidate: string, sourceTitleZh: string, because: string): void {
  ran += 1;
  if (shortTitleProblems(candidate, sourceTitleZh).length === 0) {
    failures.push(`短标题应当被拒绝（${because}）却通过了：「${candidate}」`);
  }
}
function rejectsShort(candidate: string, because: string): void {
  ran += 1;
  if (shortTitleProblems(candidate, fullTitle).length === 0) failures.push(`短标题应当被拒绝（${because}）却通过了：「${candidate}」`);
}
acceptsShort("卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449公路修复");
acceptsShort("卢卡斯市MT-449号公路修复与新建");
rejectsShort("", "空标题");
rejectsShort(fullTitle, "跟原标题一样长，等于没有压缩");
// A title that was already short has nothing to condense, and the model
// reordering it is the right answer. Flagging that would reject the rows this
// pass has the least to do with, and the flagged column would then fall back
// to the text the model just agreed with.
ran += 1;
if (shortTitleProblems("实验室设备采购", "采购实验室设备").length > 0) {
  failures.push(`原标题本来就短时不应要求再变短：${shortTitleProblems("实验室设备采购", "采购实验室设备").join("；")}`);
}
// Accepted since the backstops were loosened to 42/80 (2026-09-20). Its prose
// is 37 characters, the same order as the three real titles below that were
// being wrongly refused, and it is a readable list row — the prompt still asks
// for 12–30 and would return the shorter 卢卡斯-杜里奥韦尔德（Lucas do Rio
// Verde）市MT-449公路修复与新建. This backstop is not the target, and a title
// this shape is not the failure it exists to catch.
acceptsShort("马托格罗索州卢卡斯-杜里奥韦尔德市MT-449号公路6.93公里路段修复与新建工程");
// The parenthetical is excluded from the readability budget, but it cannot be
// used to smuggle an unbounded title past the check.
rejectsShort(`卢卡斯市公路修复（${"Lucas do Rio Verde ".repeat(4)}）`, "整体超过 60 字");
rejectsShort("███ 市MT-449公路修复", "用了遮挡符号");
// The dangerous failure: a name carried in from another row of the same batch.
rejectsShort("福塔莱萨（Fortaleza）市MT-449公路修复", "原标题里没有 Fortaleza，属于凭空生成");

// The length backstops, against the real rejections from the first 100-row
// --write run (2026-09-20). Three good titles were refused because the Chinese
// TRANSLITERATION of a Spanish proper noun ate the whole budget before the
// description began. All three must pass now: refusing them falls the column
// back to the full administrative title, which is longer than what was
// rejected.
acceptsShortFrom(
  "贝利萨里奥·多明格斯安戈斯图拉（Belisario Domínguez Angostura）水电站自用断路器及配电盘供货与安装",
  "贝利萨里奥·多明格斯安戈斯图拉（Belisario Domínguez Angostura）水电站自用断路器及配电盘的供货与安装，公开招标第LO-018T0O999-N7-2026号",
);
acceptsShortFrom(
  "拉玛丽亚-托维亚-埃尔雷霍山口-尼迈马-诺凯迈路段旅游主干道改善与修复",
  "拉玛丽亚-托维亚-埃尔雷霍山口-尼迈马-诺凯迈路段旅游主干道的改善与修复工程施工，合同编号 ICCU-LP-055-2025",
);
acceptsShortFrom(
  "费尔南多·伊里亚尔特·巴尔德拉马（Ing. Fernando Hiriart Balderrama）水电站计量系统采购与改造",
  "费尔南多·伊里亚尔特·巴尔德拉马（Ing. Fernando Hiriart Balderrama）水电站计量系统的采购与现代化改造服务",
);
// Loosening is not removing. A "short" title that kept the whole
// administrative sentence is what these backstops exist for.
const ADMIN_SENTENCE = "公开招标（电子）第023/2026号——专业工程公司承建专业社会救助参考中心，位于塞乌阿祖尔社区，技术及条件详见基本项目文件及其附件";
rejectsShortFrom(ADMIN_SENTENCE, ADMIN_SENTENCE, "原封不动照抄了整句行政标题");

// --- Stripping a guessed spelling instead of refusing the row -------------
// Three of six rejections in the first real --write run were an invented Latin
// parenthetical, all Peru. The rule is right to fire — one of the three was
// 阿亚瓦卡区（Ayavaca）, and Peru's province is AyaBaca, so the model produced a
// plausible misspelling that would have been published as a matching key
// against the bid documents. But the Chinese was correct and the rest of the
// title was good, so the remedy is to drop the guess, not the row: refusing
// falls the column back to the full administrative title.
function checkedShort(candidate: string, sourceTitleZh: string) {
  return checkGenerated(
    { slug: "s", title: { zh: sourceTitleZh, es: "FUENTE", en: "" } },
    { titleZhShort: candidate, titleZhPublic: "秘鲁 乡村道路桥梁翻新工程", summaryZhPublic: "乡村道路桥梁的翻新工程，含桥梁本身的技术改造施工。" },
  ).short;
}

const guessed = checkedShort("卡鲁阿帕塔（Carhuapata）HU-712乡村道路桥梁翻新", "卡鲁阿帕塔乡村道路HU-712号桥梁翻新工程");
check("原标题没有的拉丁拼写会被摘掉", guessed.value, "卡鲁阿帕塔HU-712乡村道路桥梁翻新");
check("摘掉之后这条短标题就合格了", guessed.problems.length, 0);

const misspelled = checkedShort("阿亚瓦卡区（Ayavaca）7个聚居区农村饮水与卫生改善扩建", "阿亚瓦卡区7个聚居区的农村饮水与卫生服务改善扩建工程");
check("拼错的地名也当成没有依据的拼写摘掉", misspelled.value, "阿亚瓦卡区7个聚居区农村饮水与卫生改善扩建");
check("摘掉之后不再报外文词", misspelled.problems.length, 0);

// The other direction matters more. A parenthetical the full title DOES carry
// is the anchor a member matches against the bid documents — stripping that
// would quietly destroy the one thing the short title exists to keep.
const verified = checkedShort(
  "卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449公路修复",
  "马托格罗索州卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449号公路6.93公里路段修复与新建工程服务采购",
);
check("原标题里有的括号原文必须保留", verified.value, "卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市MT-449公路修复");
check("保留括号原文的短标题依然合格", verified.problems.length, 0);

// Accents and case must not make a real anchor look invented.
const accented = checkedShort("埃洛伊门德斯（Elói Mendes）市教育局办公楼建设", "米纳斯吉拉斯州埃洛伊门德斯（Eloi Mendes）市教育局办公楼建设工程");
check("重音差异不算凭空生成", accented.value, "埃洛伊门德斯（Elói Mendes）市教育局办公楼建设");

// --- Checking a public summary --------------------------------------------
// Same audience and same surfaces as the public title, so the same rules.
function acceptsSummary(candidate: string): void {
  ran += 1;
  const problems = publicSummaryProblems(candidate);
  if (problems.length > 0) failures.push(`公开摘要应当通过却被拒绝：「${candidate}」——${problems.join("；")}`);
}
function rejectsSummary(candidate: string, because: string): void {
  ran += 1;
  if (publicSummaryProblems(candidate).length === 0) failures.push(`公开摘要应当被拒绝（${because}）却通过了：「${candidate}」`);
}
acceptsSummary("州级公路约七公里路段的路面修复与新建工程，由承包方包工包料实施，属于州交通主管部门的年度公路养护计划。");
acceptsSummary("城市环路变电站的扩建工程，包含34.5kV开关柜安装、控制保护系统改造以及配套土建施工。");
rejectsSummary("", "空摘要");
rejectsSummary("卢卡斯-杜里奥韦尔德（Lucas do Rio Verde）市公路修复工程。", "括号里留了原文地名");
rejectsSummary("位于 Fortaleza 的隧道工程设计施工。", "留了拉丁字母专有名词");
rejectsSummary("公路 K0+000 至 K12+500 路段的路面修复工程。", "留了桩号");
rejectsSummary("项目编号 20241301010259 的公路修复工程。", "留了项目编号");
rejectsSummary("███ 市的公路修复工程，包含路面与排水。", "用了遮挡符号");
rejectsSummary("某某市的公路修复工程，包含路面与排水。", "用了占位符号");
rejectsSummary(`公路修复工程。${"很长的描述".repeat(20)}`, "超过 100 字");
// Talking about the notice instead of about the project. Every one of these
// reached production before this rule existed (2026-09-20), because two of
// the prompt's own worked examples had the annotation written inside the
// example OUTPUT — so the model was shown the commentary as copy to imitate.
rejectsSummary("配电变电站的改善工程，旨在提升区域供电能力。原文未列明具体设备，仅交代至这一层。", "在交代原文而不是介绍项目");
rejectsSummary("供水企业采购一辆罐式卡车，原文未载明其他设备或配件。", "在交代原文而不是介绍项目");
rejectsSummary("乡村道路桥梁的更新工程。原文未提及配套引道或附属设施，摘要到此为止。", "在交代原文而不是介绍项目");
rejectsSummary("市政安全部门的执法记录仪采购项目，采购范围以此为准。", "替读者下了我们没资格下的判断");
rejectsSummary("国家高中学校的新建工程，本平台仅收录到这一层。", "提到了本平台");
// The rewrite of each — same facts, no meta-commentary, and still short.
acceptsSummary("配电变电站及二级电网的供电改善工程，包含配电设施的升级与优化。");
acceptsSummary("供水企业的罐式运水车采购项目，用于供水保障。");
acceptsSummary("乡村道路桥梁的更新工程，含桥梁本身的技术改造施工。");
// The rule must not swallow ordinary prose that happens to contain 说明 or
// 交代 as part of a real word.
acceptsSummary("高中学校的新建工程，包含校舍主体施工，设计说明与施工图由承包方编制。");

// --- Which rows are worth a model call ------------------------------------
const base = {
  slug: "s",
  title: { zh: "中文标题", es: "TÍTULO", en: "" },
  summary: { zh: "中文摘要", es: "RESUMEN", en: "" },
  title_zh_short: null,
  title_zh_public: null,
  summary_zh_public: null,
  country: "Mexico",
  manual_field_overrides: null,
};
const filled = { ...base, title_zh_short: "短标题", title_zh_public: "墨西哥 变电站工程", summary_zh_public: "公开摘要" };
check("三列都空的已翻译行要生成", needsDisplayText(base), true);
check("三列都有的行跳过", needsDisplayText(filled), false);
check("空白列按没有处理", needsDisplayText({ ...filled, summary_zh_public: "  " }), true);
// One call fills all three, so any one missing column is worth the row: a row
// with a public title but no public summary is still publishing the summary
// that restates everything the title just dropped.
check("只缺公开摘要也要生成", needsDisplayText({ ...filled, summary_zh_public: null }), true);
check("只缺短标题也要生成", needsDisplayText({ ...filled, title_zh_short: null }), true);
// An untranslated row mirrors the source into zh — feeding that to the
// prompt would hand it the exact text it exists to remove.
check("还没翻译的行跳过", needsDisplayText({ ...base, title: { zh: "TÍTULO", es: "TÍTULO", en: "" } }), false);
check("人工改过的公开标题不覆盖", needsDisplayText({ ...filled, title_zh_public: null, manual_field_overrides: ["title_zh_public"] }), false);
// Pinning one column must not stop the other two being generated — they are
// independent strings with independent failure modes.
check("人工改过一列不影响其他列生成", needsDisplayText({ ...base, manual_field_overrides: ["title_zh_public"] }), true);
// A filled column whose text the CURRENT rules would refuse counts as needing
// work. Without this, tightening a rule fixes nothing already published: the
// hundred rows carrying 原文未列明具体设备 would have needed a hand-written
// UPDATE … SET summary_zh_public = NULL to become eligible again.
check("存量摘要违反新规则要重生成", needsDisplayText({ ...filled, summary_zh_public: "变电站改善工程。原文未列明具体设备。" }), true);
check("存量公开标题带原文地名要重生成", needsDisplayText({ ...filled, title_zh_public: "墨西哥 莱昂市（León）变电站扩建工程" }), true);
// …but a human's decision still wins over a validator.
check("人工钉住的列即使违反规则也不动", needsDisplayText({
  ...filled,
  summary_zh_public: "变电站改善工程。原文未列明具体设备。",
  manual_field_overrides: ["summary_zh_public"],
}), false);

// --- Pairing model output back to rows ------------------------------------
// A misattributed public title publishes one tender under another's name,
// and every row still reads correctly — so this is tested, not trusted.
const rows = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
const item = (id: string, tag: string) => ({
  id,
  titleZhShort: `${tag}短`,
  titleZhPublic: `${tag}公开`,
  summaryZhPublic: `${tag}摘要`,
});
const paired = mapDisplayTextToSlugs(rows, [item("3", "丙"), item("1", "甲")]);
check("乱序也能配对回正确的行", JSON.stringify(paired), JSON.stringify([
  { slug: "c", titleZhShort: "丙短", titleZhPublic: "丙公开", summaryZhPublic: "丙摘要" },
  { slug: "a", titleZhShort: "甲短", titleZhPublic: "甲公开", summaryZhPublic: "甲摘要" },
]));
check("三个字段都会去掉首尾空白", JSON.stringify(mapDisplayTextToSlugs([{ slug: "a" }], [
  { id: "1", titleZhShort: " 短 ", titleZhPublic: " 公开 ", summaryZhPublic: " 摘要 " },
])), JSON.stringify([{ slug: "a", titleZhShort: "短", titleZhPublic: "公开", summaryZhPublic: "摘要" }]));
check("批次里没发出的编号直接丢弃", mapDisplayTextToSlugs(rows, [item("9", "x")]).length, 0);
check("非数字编号直接丢弃", mapDisplayTextToSlugs(rows, [item("甲", "x")]).length, 0);
check("重复认领同一编号只保留第一条", JSON.stringify(mapDisplayTextToSlugs(rows, [
  item("2", "第一"), item("2", "第二"),
])), JSON.stringify([{ slug: "b", titleZhShort: "第一短", titleZhPublic: "第一公开", summaryZhPublic: "第一摘要" }]));

// --- A re-import must not wipe a generated public title -------------------
// PostgREST's upsert only sets the keys the row builder produces, so the
// protection is that title_zh_public never appears in one. If someone adds
// it for symmetry with its neighbours, every public title resets to NULL on
// the next import of a still-open tender and the site silently goes back to
// publishing the identifying title — with no error anywhere.
const importedTender: Tender = {
  id: "id",
  slug: "slug",
  publicSlug: "p-1",
  tenderNumber: "N-1",
  title: { zh: "中文标题", es: "TÍTULO", en: "" },
  titleZhPublic: "墨西哥 变电站扩建工程",
  titleZhShort: "莱昂市（León）变电站扩建",
  summary: { zh: "中文摘要", es: "RESUMEN", en: "" },
  summaryZhPublic: "配电变电站的扩建工程。",
  buyer: "采购单位",
  country: "Mexico",
  governmentLevel: "federal",
  industries: ["energy"],
  scopeType: "works",
  procedureType: "Licitación Pública",
  publicationDate: "2026-09-15",
  status: "open",
  qualifications: [],
  experienceRequirements: [],
  requiredDocuments: [],
  keyDates: [],
  risks: [],
  relevance: { tier: "significant", label: { zh: "重要", es: "", en: "" }, reason: { zh: "原因", es: "", en: "" } },
  sourceName: "来源",
  sourceUrl: "https://example.test",
  createdAt: "2026-09-15",
  updatedAt: "2026-09-15",
};
const importedRow = buildRowWithProtectedValues(importedTender, undefined);
for (const column of ["title_zh_public", "title_zh_short", "summary_zh_public"] as const) {
  ran += 1;
  if (column in importedRow) {
    failures.push(`导入写入的字段里出现了 ${column}——重新导入会把这一列清空，静默回到旧行为`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`\n${failures.length}/${ran} 项失败`);
  process.exit(1);
}

console.log(`OK  短标题 / 公开标题 / 公开摘要（生成、校验、配对），全部 ${ran} 项通过`);
