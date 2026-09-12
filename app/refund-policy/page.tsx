import { PolicyPage, type PolicySection } from "@/components/content/PolicyPage";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "退款政策",
  description: "订阅退款的适用情形、例外情况与申请方式。",
};

const sections: PolicySection[] = [
  {
    id: "principle",
    title: "核心原则",
    paragraphs: [
      "除本政策所列例外及适用法律规定的强制性权利外，订阅费用按计费周期（月度/半年度/年度）预先收取，已开始的当前计费周期通常不退款，也不因用户在周期内较少使用或未使用而按比例退款。",
      "半年度和年度方案是以相应完整周期定价的一次性预付方案，不等同于逐月付款；确认付款前，页面会显示方案总价、币种和周期。",
    ],
  },
  {
    id: "cancel",
    title: "取消自动续费",
    paragraphs: [
      "用户可随时在账户页面取消自动续费，取消请求立即生效且不会产生新一期扣费。依法适用时，平台还会在自动续费日前至少五个自然日提醒用户，并允许无罚取消。",
      "取消操作本身不会立即终止当前周期内的服务访问权限——用户在已付费周期内仍可正常使用平台，直到该周期到期。",
    ],
  },
  {
    id: "exceptions",
    title: "个案例外",
    paragraphs: [
      `以下情形不适用上述"不退款"原则，但是否退款及退款范围由平台方个案审核，不构成对所有类似情形的统一承诺：`,
    ],
    items: [
      "因平台方原因导致的重复扣费或计费错误（例如系统故障导致同一周期被扣费两次）。",
      "因平台方原因（非计划内维护、非不可抗力）导致服务在已付费周期内长时间无法访问。",
      "法律法规另有强制性规定的情形。",
      "平台在个案审核后同意的其他情形。",
    ],
  },
  {
    id: "invoice",
    title: "发票处理",
    paragraphs: [
      "发票（CFDI）由平台人工开具，需用户在付款后主动通过 WhatsApp 或邮箱申请并提供开票资料，详见《服务条款》「发票（CFDI）」一节。",
      "若某笔款项已开具发票且后续获得退款，平台将按适用规则作相应的发票冲销或开具贷记凭证；该过程可能需要用户配合提供必要信息。",
    ],
  },
  {
    id: "how-to-request",
    title: "如何申请",
    paragraphs: [`如认为符合上述例外情形，请发送邮件至 ${LEGAL_CONTACT_EMAIL}，说明账户邮箱、涉及的计费周期、付款日期和具体情况；如有 Stripe 账单号、SPEI 参考号或人工电汇申请编号，也请一并提供。平台会在合理期限内审核并答复。`],
  },
];

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Billing"
      title="订阅退款政策"
      intro="本政策说明订阅费用的退款规则，请在订阅付费方案前仔细阅读；本页与《服务条款》「订阅退款政策」一节内容一致，单独列出便于查阅。"
      updated="2026年9月11日"
      sections={sections}
    />
  );
}
