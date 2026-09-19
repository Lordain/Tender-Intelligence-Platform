import { publicTitleOf, publicTitleProblems, isPublishablePublicTitle } from "../lib/public-title";
import { mapPublicTitlesToSlugs } from "../lib/ingestion/public-title-qwen";
import { needsPublicTitle } from "../lib/ingestion/generate-public-titles";
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

// --- Which rows are worth a model call ------------------------------------
const base = { slug: "s", title: { zh: "中文标题", es: "TÍTULO", en: "" }, title_zh_public: null, country: "Mexico", manual_field_overrides: null };
check("已翻译且没有公开标题的行要生成", needsPublicTitle(base), true);
check("已有公开标题的行跳过", needsPublicTitle({ ...base, title_zh_public: "墨西哥 变电站工程" }), false);
check("空白公开标题的行仍要生成", needsPublicTitle({ ...base, title_zh_public: "  " }), true);
// An untranslated row mirrors the source into zh — feeding that to the
// prompt would hand it the exact text it exists to remove.
check("还没翻译的行跳过", needsPublicTitle({ ...base, title: { zh: "TÍTULO", es: "TÍTULO", en: "" } }), false);
check("人工改过的公开标题不覆盖", needsPublicTitle({ ...base, manual_field_overrides: ["title_zh_public"] }), false);

// --- Pairing model output back to rows ------------------------------------
// A misattributed public title publishes one tender under another's name,
// and every row still reads correctly — so this is tested, not trusted.
const rows = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
const paired = mapPublicTitlesToSlugs(rows, [
  { id: "3", titleZhPublic: "巴西 港口工程" },
  { id: "1", titleZhPublic: " 墨西哥 变电站工程 " },
]);
check("乱序也能配对回正确的行", JSON.stringify(paired), JSON.stringify([
  { slug: "c", titleZhPublic: "巴西 港口工程" },
  { slug: "a", titleZhPublic: "墨西哥 变电站工程" },
]));
check("批次里没发出的编号直接丢弃", mapPublicTitlesToSlugs(rows, [{ id: "9", titleZhPublic: "x" }]).length, 0);
check("非数字编号直接丢弃", mapPublicTitlesToSlugs(rows, [{ id: "甲", titleZhPublic: "x" }]).length, 0);
check("重复认领同一编号只保留第一条", JSON.stringify(mapPublicTitlesToSlugs(rows, [
  { id: "2", titleZhPublic: "第一条" },
  { id: "2", titleZhPublic: "第二条" },
])), JSON.stringify([{ slug: "b", titleZhPublic: "第一条" }]));

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
  summary: { zh: "中文摘要", es: "RESUMEN", en: "" },
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
ran += 1;
if ("title_zh_public" in importedRow) {
  failures.push("导入写入的字段里出现了 title_zh_public——重新导入会清空所有公开标题");
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`\n${failures.length}/${ran} 项失败`);
  process.exit(1);
}

console.log(`OK  访客公开标题（生成、校验、配对），全部 ${ran} 项通过`);
