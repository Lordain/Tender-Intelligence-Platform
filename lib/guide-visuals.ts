import type { BeginnerIconName } from "@/lib/beginner-guide";

/**
 * The platform guides' visual layer (user, 2026-10-05: 现在的内容都是文字，且字
 * 太多、太厚重了 … 多做成流程化、或者多以图形的方式说明，并增加一些Icon).
 *
 * The guide text stays plain data in lib/participation-guides.ts; the icons
 * are picked here from the words, so a new guide gets them without tagging
 * every line. The specific words come before the general ones.
 */
const ICON_RULES: Array<[RegExp, BeginnerIconName]> = [
  [/e\.firma|电子签|签名|签署/i, "key"],
  [/信封|sobre/i, "envelope"],
  [/比索|汇率/, "money"],
  [/风险|延期|前期条件/, "warning"],
  [/不是招标|别照搬|别只看/, "reject"],
  [/看得到|摘要|简讯/, "eye"],
  [/企业身份|企业资料|企业文件|公司文件|企业基本|企业与|采购单位|采购机关|采购机构|采购主体/, "company"],
  [/新法|旧法|法律|条例|异议|官方原文|规则/, "official"],
  [/门槛|金额/, "money"],
  [/门户|入口|平台/, "link"],
  [/监理/, "review"],
  [/联系人|开通/, "register"],
  [/跟进|跟踪|追踪|关注项目/, "bell"],
  [/担保|保函|保证|garant|fianza/i, "guarantee"],
  [/提问|答疑|澄清|问答|问卷|咨询|consult/i, "question"],
  [/翻译|文件认证|资质转换|apostille|西语|葡语/i, "language"],
  [/授权|法定代表|代表人|存在与代表/, "register"],
  [/本地|当地|巴西代表|巴西主体|分支|送达|住所|踏勘|现场/, "local"],
  [/业绩|经验|履约/, "experience"],
  [/财务|融资|出资|银行/, "finance"],
  [/合规|诚信|声明|禁止|反腐|股权|股东/, "official"],
  [/币种|钱|成本|收入|抵税|资金|费用|收费|税费|报价条件|报价与|优惠/, "money"],
  [/税/, "tax"],
  [/联合体|伙伴|分包|供应链|承包链|角色|身份|结构|投资人|团队|适合谁/, "users"],
  [/日期|时间|截止|日程|期限|里程碑|cronograma|fecha|data de/i, "calendar"],
  [/登记|注册|账户|用户|档案|类别|RNP|RPE|SIPRO|SICAF|BDPC|RUP|HIIP/, "register"],
  [/检索|搜索|筛选|查找|找到|找机会|找项目|找遴选|锁定|识别/, "search"],
  [/下载|标书|bases|pliego|edital|DSI|全套文件|完整文件/i, "download"],
  [/读|公告|公报|看什么|文件/, "notice"],
  [/递交|提交|报价|竞价|发送|提案|加入|意向|进入/, "submit"],
  [/认证|资质|标准|技术|规格|预审|审查|评审|评估|开标|验证|分级/, "review"],
  [/授标|签约|合同|证书|中标|结果|执行|设 E\.S\.P/, "award"],
  [/国际|境外|外国/, "globe"],
  [/资格|范围|核对|确认/, "target"],
  [/人员|设备|施工/, "tools"],
  [/企业|公司|设立|章程|存续/, "company"],
  [/长期/, "clock"],
];

/**
 * Guide lines are written 「短标题：说明」 so a card can lead with the short
 * part. A line without a short lead (or whose lead runs long) stays whole.
 */
export function splitGuideLine(line: string): { lead?: string; rest: string } {
  const at = line.indexOf("：");
  if (at <= 0 || at > 48) return { rest: line };
  return { lead: line.slice(0, at), rest: line.slice(at + 1) };
}

/**
 * Every icon that fits a line, best first. A line with a short lead is
 * matched on the lead alone (「授权：法定代表人…」 is about 授权, whatever the
 * rest mentions); words further in fit too loosely to earn an icon.
 */
function iconCandidates(text: string): BeginnerIconName[] {
  const { lead } = splitGuideLine(text);
  return ICON_RULES.filter(([pattern]) => pattern.test(lead ?? text)).map(([, icon]) => icon).filter((icon, index, all) => all.indexOf(icon) === index);
}

/** Each section kind's icon, for its heading and the page's section nav. */
export function guideSectionIcon(id: string): BeginnerIconName {
  switch (id) {
    case "scope": return "info";
    case "first-check": return "eye";
    case "process": return "step-up";
    case "documents": return "folder";
    case "foreign": return "globe";
    case "guarantees": return "guarantee";
    default: return "notice";
  }
}

/** An icon per line of one list, or none where nothing fitting was left. */
export type GuideIconList = Array<BeginnerIconName | undefined>;

export type GuidePageIcons = {
  facts: GuideIconList;
  /** Keyed by section id: one entry per step, or per item. */
  sections: Record<string, GuideIconList>;
};

/**
 * The icons for a whole guide page, each used at most once (user,
 * 2026-10-05: Icon大量重复，如果不适合用icon的地方就不用，但是不要重复).
 *
 * The section headings keep their own marks (shared only with their chip in
 * the page nav, where 一图看懂 and 官方来源 take target and link); nothing
 * else reuses them.
 * The rest are handed out greedily — the flowchart first, then the
 * checklist, the 中国企业重点核对 cards, the other lists, and the fact tiles
 * last — each line taking the best fitting icon still free, and going
 * without when none is. The 先看字段 cards take none: the field name is
 * already the thing to look at.
 */
export function guidePageIcons(guide: {
  quickFacts: Array<{ label: string; value: string }>;
  audience: string;
  sections: Array<{ id: string; items?: string[]; steps?: Array<{ title: string }> }>;
}): GuidePageIcons {
  const used = new Set<BeginnerIconName>(["target", "link", ...guide.sections.map((section) => guideSectionIcon(section.id))]);
  const take = (texts: string[]): GuideIconList =>
    texts.map((text) => {
      const icon = iconCandidates(text).find((candidate) => !used.has(candidate));
      if (icon) used.add(icon);
      return icon;
    });

  const rank = (section: { id: string; steps?: unknown }) =>
    section.steps ? 0 : section.id === "documents" ? 1 : section.id === "foreign" ? 2 : 3;
  const sections: Record<string, GuideIconList> = {};
  for (const section of [...guide.sections].sort((a, b) => rank(a) - rank(b))) {
    if (section.steps) sections[section.id] = take(section.steps.map((step) => step.title));
    else if (section.items) sections[section.id] = section.id === "first-check" ? section.items.map(() => undefined) : take(section.items);
  }
  const facts = take([...guide.quickFacts.map((fact) => fact.label), "适合谁看"]);
  return { facts, sections };
}
