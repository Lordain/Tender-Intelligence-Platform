import { PolicyPage, type PolicySection } from "@/components/content/PolicyPage";

const sections: PolicySection[] = [
  { id: "scope", title: "服务范围", paragraphs: ["本平台对公开招标信息进行汇集、翻译、分类与结构化展示，帮助用户发现和评估潜在机会。平台不是采购机构、招标代理，也不代表任何政府部门。"] },
  { id: "account", title: "账户与使用责任", paragraphs: ["用户应提供真实、有效的账户信息，并妥善保护登录凭证。用户对通过其账户进行的操作及对平台信息的使用承担责任。"], items: ["不得以违法、欺诈或干扰平台正常运行的方式使用服务。", "不得绕过访问控制、批量抓取受限内容或损害其他用户权益。", "发现账户被未经授权使用时，应及时联系平台运营方。"] },
  { id: "information", title: "信息准确性与更新", paragraphs: ["平台尽力保持信息准确和及时，但公开来源可能出现延迟、更正、撤回或访问限制。中文标题、摘要和分析属于辅助性整理，不应替代原始文件。", "用户在投标、签约或作出资金投入前，应自行核实资格要求、截止日期、金额、税务、合规与技术条款。"] },
  { id: "ip", title: "知识产权", paragraphs: ["平台界面、整理结构与原创分析受适用法律保护。政府公告与第三方文件的权利归相应权利人所有；平台展示这些内容不代表取得其所有权。"] },
  { id: "availability", title: "服务可用性与变更", paragraphs: ["平台可能因维护、安全、第三方服务变化或不可抗力暂时中断，并可在合理范围内调整功能。重大条款变更将在平台内以适当方式提示。"] },
  { id: "liability", title: "责任限制", paragraphs: ["在适用法律允许的范围内，平台不对因依赖辅助翻译、摘要、筛选结果或第三方来源而产生的投标损失、机会损失或间接损失承担责任。任何资格与投标决定均应结合官方文件和专业意见作出。"] },
  { id: "termination", title: "暂停与终止", paragraphs: ["若用户违反本条款、危及平台安全或侵害他人权益，平台运营方可限制或终止其访问。用户也可按照账户页面提供的方式停止使用服务。"] },
];

export default function TermsPage() {
  return <PolicyPage eyebrow="Legal" title="服务条款" intro="本条款说明平台提供什么、用户如何使用信息，以及双方责任的基本边界。" updated="2026年9月3日" sections={sections} />;
}
