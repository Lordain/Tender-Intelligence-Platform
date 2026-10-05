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

export type FlowStep = {
  title: string;
  detail: string;
  /** Where the step happens or what it is usually called locally. */
  term?: string;
};

/** The common path. Every country names the steps differently; the order holds. */
export const flowSteps: FlowStep[] = [
  { title: "找到项目", detail: "确认采购方、金额、截标日期", term: "本站 / 官方平台" },
  { title: "读公告", detail: "外国企业能否参加？语言、币种、递交方式", term: "Convocatoria / Edital" },
  { title: "下载招标文件", detail: "主文件、附件、技术规格、合同范本", term: "Pliego / Bases / Edital" },
  { title: "注册供应商", detail: "平台账户、供应商名录，有的要当地税号", term: "RUP / RPE / SICAF…" },
  { title: "提问澄清", detail: "在规定期限内书面提问，关注补遗", term: "Consultas / Adendas" },
  { title: "递交投标", detail: "资格 + 技术 + 报价 + 投标保函，截止前递交", term: "Oferta / Propuesta" },
  { title: "开标评审", detail: "公开开标，可能要求补正材料", term: "Apertura / Evaluación" },
  { title: "授标签约", detail: "中标通知、履约保函、签合同", term: "Adjudicación / Contrato" },
];

/** The fork after reading the notice: bid directly, or come in through a partner. */
export const flowDecision = {
  question: "公告允许外国企业直接投标吗？",
  yes: { label: "可以", detail: "按流程注册并直接投标；国际招标（Internacional）通常对外国企业开放" },
  no: { label: "不可以或门槛太高", detail: "和当地企业组成联合体（Consorcio），或作为分包商、设备供应商进入" },
};

export type ChecklistGroup = { title: string; items: string[] };

/** What a first bid usually asks for. The tender's own list is what counts. */
export const prepareGroups: ChecklistGroup[] = [
  { title: "公司主体文件", items: ["营业执照、公司章程", "法定代表人授权书", "通常要海牙认证（Apostille）+ 西语 / 葡语翻译"] },
  { title: "业绩与资质", items: ["同类项目合同、验收或完工证明", "资质证书、产品认证", "金额、规模要能对上门槛"] },
  { title: "财务能力", items: ["近 2–3 年审计报表", "银行资信证明", "部分项目有净资产、流动比率门槛"] },
  { title: "保函", items: ["投标保函（多数项目要求）", "中标后的履约保函", "金额、格式、出具机构以文件为准"] },
  { title: "当地注册", items: ["平台账户与供应商名录", "当地税号：RFC、CNPJ、NIT、RUC、RUT、CUIT、RNC", "部分平台要电子签名或数字证书"] },
  { title: "技术与报价", items: ["技术方案、产品规格书", "按指定格式、币种填报价表", "当地税费、运费、关税算进报价"] },
];

/** Where first bids most often go wrong, one line each. */
export const cautionItems: Array<{ title: string; detail: string }> = [
  { title: "时间比想象的紧", detail: "公告到截标常只有 2–6 周，认证和翻译就要 2–4 周。" },
  { title: "以原文为准", detail: "文件是西班牙语（巴西是葡萄牙语），翻译只作参考，递交按原文要求。" },
  { title: "补遗必须逐份看", detail: "截标前常有多次修改和澄清答复，漏看一份可能整份标作废。" },
  { title: "格式错误直接废标", detail: "漏签字、漏页、保函不符、超时一分钟，都会被直接淘汰。" },
  { title: "算清税费和汇率", detail: "增值税、预扣税、关税、汇率波动和付款周期都要算进报价。" },
  { title: "只走官方渠道", detail: "所有问题通过官方澄清提问；各国反腐法都很严，不要私下接触评标人员。" },
];

/** Our advice, as numbered points. */
export const adviceItems: Array<{ title: string; detail: string }> = [
  { title: "先选准，再投标", detail: "从允许国际投标、金额适中、你有同类业绩的项目开始。" },
  { title: "做一套投标资料库", detail: "认证、翻译好的公司文件和业绩包，在有效期内可以反复使用。" },
  { title: "找可靠的当地伙伴", detail: "当地律所、代理或联合体伙伴，能帮你注册、递交和履约。" },
  { title: "先演练一次", detail: "选一个真实项目，完整读一遍招标文件、走一遍注册，哪怕这次不投。" },
  { title: "每天跟踪新项目", detail: "在本站按国家、行业筛选并保存搜索，看中文摘要，不错过截标。" },
];
