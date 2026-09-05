import { PolicyPage, type PolicySection } from "@/components/content/PolicyPage";

// 【占位符提示】见 app/terms/page.tsx 顶部同样的说明。
const CONTACT_EMAIL = "【联系邮箱，待补充】";

const sections: PolicySection[] = [
  {
    id: "principle",
    title: "核心原则",
    paragraphs: [
      "订阅费用按计费周期（月度/半年度/年度）预先收取。已经开始或已经完成的计费月份——即该月份对应的服务已经提供——费用不予退还，无论用户在该月份内实际使用平台的频率或程度如何。",
      "这一原则适用于所有订阅方案与计费周期：半年度、年度订阅按整个周期一次性预付，同样按「已发生服务的月份不退款」计算，不因预付周期较长而产生额外的按比例退款。",
    ],
  },
  {
    id: "cancel",
    title: "取消自动续费",
    paragraphs: [
      "用户可随时在账户页面取消自动续费。取消后不会产生新一期的扣费，但已支付的当前周期费用不退还，服务将持续至当前已付费周期结束后才停止续费。",
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
    ],
  },
  {
    id: "how-to-request",
    title: "如何申请",
    paragraphs: [`如认为符合上述例外情形，请发送邮件至 ${CONTACT_EMAIL}，说明账户信息、涉及的计费周期与具体情况，平台会在合理期限内审核并答复。`],
  },
];

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Billing"
      title="订阅退款政策"
      intro="本政策说明订阅费用的退款规则，请在订阅付费方案前仔细阅读；本页与《服务条款》「订阅退款政策」一节内容一致，单独列出便于查阅。"
      updated="2026年9月5日"
      sections={sections}
    />
  );
}
