/**
 * The 新手入门 guide: for a company that has never bid in Latin America, the
 * common path through a tender, what to have ready, where first bids go
 * wrong, and our advice, before the platform-by-platform guides (user,
 * 2026-10-05: 对从未参加过拉美项目招标的企业的新手指导，置顶，加首页参标
 * 指南侧展示 … 简单易懂不要大量文字 … 画流程图).
 *
 * Kept apart from participationGuides: those are one platform each, with a
 * country, an icon and an issuer; this one is about none of them, so it has
 * its own page (app/guides/getting-started) and its own short shape here.
 * Every line is a sentence or less on purpose.
 */

export const BEGINNER_GUIDE_PATH = "/guides/getting-started";

export const beginnerGuide = {
  title: "第一次参加拉美招标？新手入门",
  shortTitle: "拉美招标新手入门",
  summary: "一张流程图看懂拉美招标从找项目到签约的全过程，以及要准备什么、哪里最容易出错。",
};

/** The line icons in components/guides/BeginnerIcon.tsx. */
export type BeginnerIconName =
  | "search" | "notice" | "download" | "register" | "question" | "submit" | "review" | "award"
  | "company" | "experience" | "finance" | "guarantee" | "local" | "pricing"
  | "clock" | "language" | "amendments" | "reject" | "tax" | "official" | "partner-warning"
  | "target" | "local-company" | "step-up" | "folder" | "partner" | "bell"
  // Added for the platform guides' visual layout (app/guides/[slug]).
  | "key" | "globe" | "money" | "calendar" | "lightbulb" | "info" | "eye" | "link" | "envelope" | "users" | "tools" | "warning";

export type FlowStep = {
  title: string;
  icon: BeginnerIconName;
  detail: string;
  /** Where the step happens or what it is usually called locally. */
  term?: string;
};

/** The common path. Every country names the steps differently; the order holds. */
export const flowSteps: FlowStep[] = [
  { title: "找到项目", icon: "search", detail: "确认采购方、金额、截标日期", term: "本站 / 官方平台" },
  { title: "读公告", icon: "notice", detail: "外国企业能否参加？语言、币种、递交方式", term: "Convocatoria / Edital" },
  { title: "下载招标文件", icon: "download", detail: "主文件、附件、技术规格、合同范本", term: "Pliego / Bases / Edital" },
  { title: "注册供应商", icon: "register", detail: "平台账户、供应商名录，有的要当地税号", term: "RUP / RPE / SICAF…" },
  { title: "提问澄清", icon: "question", detail: "在规定期限内书面提问，关注补遗", term: "Consultas / Adendas" },
  { title: "递交投标", icon: "submit", detail: "资格 + 技术 + 报价 + 投标保函，截止前递交", term: "Oferta / Propuesta" },
  { title: "开标评审", icon: "review", detail: "公开开标，可能要求补正材料", term: "Apertura / Evaluación" },
  { title: "授标签约", icon: "award", detail: "中标通知、履约保函、签合同", term: "Adjudicación / Contrato" },
];

/** The fork after reading the notice: bid directly, or come in through a partner. */
export const flowDecision = {
  question: "公告允许外国企业直接投标吗？",
  /** The diamond's own label on the flowchart, and the bypass box's two lines. */
  shortQuestion: "外国企业能直接投吗？",
  bypass: ["注册当地公司（推荐）", "或联合体、分包、供货"],
  yes: { label: "可以", detail: "按流程注册并直接投标；国际招标（Internacional）通常对外国企业开放" },
  no: { label: "不可以或门槛太高", detail: "注册一家当地公司去投标（通常更可行）；也可以和当地企业组成联合体（Consorcio），或作为分包商、设备供应商进入" },
};

export type ChecklistGroup = { title: string; icon: BeginnerIconName; items: string[] };

/** What a first bid usually asks for. The tender's own list is what counts. */
export const prepareGroups: ChecklistGroup[] = [
  { title: "公司主体文件", icon: "company", items: ["营业执照、公司章程", "法定代表人授权书", "通常要海牙认证（Apostille）+ 西语 / 葡语翻译"] },
  { title: "业绩与资质", icon: "experience", items: ["同类项目合同、验收或完工证明", "资质证书、产品认证", "金额、规模要能对上门槛"] },
  { title: "财务能力", icon: "finance", items: ["近 2–3 年审计报表", "银行资信证明", "部分项目有净资产、流动比率门槛"] },
  { title: "保函", icon: "guarantee", items: ["投标保函（多数项目要求）", "中标后的履约保函", "金额、格式、出具机构以文件为准"] },
  { title: "当地注册", icon: "local", items: ["平台账户与供应商名录", "当地税号：RFC、CNPJ、NIT、RUC、RUT、CUIT、RNC", "部分平台要电子签名或数字证书", "也可以直接注册一家当地公司"] },
  { title: "技术与报价", icon: "pricing", items: ["技术方案、产品规格书", "按指定格式、币种填报价表", "当地税费、运费、关税算进报价"] },
];

/** Where first bids most often go wrong, one line each. */
export const cautionItems: Array<{ title: string; icon: BeginnerIconName; detail: string }> = [
  { title: "时间比想象的紧", icon: "clock", detail: "公告到截标常只有 2–6 周，认证和翻译就要 2–4 周。" },
  { title: "以原文为准", icon: "language", detail: "文件是西班牙语（巴西是葡萄牙语），翻译只作参考，递交按原文要求。" },
  { title: "补遗必须逐份看", icon: "amendments", detail: "截标前常有多次修改和澄清答复，漏看一份可能整份标作废。" },
  { title: "格式错误直接废标", icon: "reject", detail: "漏签字、漏页、保函不符、超时一分钟，都会被直接淘汰。" },
  { title: "算清税费和汇率", icon: "tax", detail: "增值税、预扣税、关税、汇率波动和付款周期都要算进报价。" },
  { title: "只走官方渠道", icon: "official", detail: "所有问题通过官方澄清提问；各国反腐法都很严，不要私下接触评标人员。" },
  // User, 2026-10-05: 在风险里面也提示一下，本地合作伙伴不是那么好找，且不要随便相信的.
  { title: "当地伙伴难找，别轻信", icon: "partner-warning", detail: "有实力的当地公司未必愿意和新手合作；自称「有关系、包中标」的中间人要警惕。合作前核实公司登记、业绩和诉讼记录，分工和费用写进合同。" },
];

/**
 * Our advice, as numbered points. A local partner is one option, not the
 * plan (user, 2026-10-05: 找可靠的当地合作伙伴太难了，而且这类公司为什么一定
 * 要跟你一起参标？… 新手也可以选择本地注册公司 <- 反而更可行，只是要积累经验，
 * 所以可以看要求相对比较不那么高的项目).
 */
export const adviceItems: Array<{ title: string; icon: BeginnerIconName; detail: string }> = [
  { title: "先选准，再投标", icon: "target", detail: "选你有资格参加、有同类经验、金额适中的项目。" },
  { title: "考虑注册当地公司", icon: "local-company", detail: "以当地公司身份投标，税号、供应商注册、保函和收款都更顺，通常比找伙伴更可行。" },
  { title: "从要求不高的项目做起", icon: "step-up", detail: "新公司当地业绩少，先投资格和业绩门槛低的中小项目，积累经验再冲大项目。" },
  { title: "做一套投标资料库", icon: "folder", detail: "认证、翻译好的公司文件和业绩包，在有效期内可以反复使用。" },
  { title: "当地伙伴是选项之一", icon: "partner", detail: "遇到门槛高、必须本地业绩的项目，可以找联合体伙伴或做分包，但别把它当唯一路径。" },
  { title: "每天跟踪新项目", icon: "bell", detail: "在本站按国家、行业筛选并保存搜索，看中文摘要，不错过截标。" },
];
