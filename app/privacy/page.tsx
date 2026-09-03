import { PolicyPage, type PolicySection } from "@/components/content/PolicyPage";

const sections: PolicySection[] = [
  { id: "collection", title: "我们收集的信息", paragraphs: ["根据用户使用的功能，平台可能处理账户资料、收藏与筛选设置、访问日志、设备和浏览器信息，以及用户主动提交的支持请求。"], items: ["账户信息，例如邮箱与身份验证状态。", "产品使用信息，例如收藏项目、保存的筛选和通知偏好。", "安全与诊断信息，例如访问时间、错误日志和异常活动记录。"] },
  { id: "use", title: "信息的使用方式", paragraphs: ["相关信息用于提供账户功能、保存偏好、发送用户选择接收的提醒、保障系统安全、排查故障并改进服务。平台不会以与这些目的不相容的方式使用个人信息。"] },
  { id: "sharing", title: "信息共享", paragraphs: ["平台可能向承担托管、身份验证、数据库、邮件或分析服务的供应商提供完成服务所必需的信息。除法律要求、保护合法权益或取得用户授权外，不会向无关第三方出售或披露个人信息。"] },
  { id: "retention", title: "保存期限", paragraphs: ["个人信息仅在提供服务、满足安全与审计需要或履行法律义务所需的期间内保存。保存期限结束后，将根据实际能力删除或去标识化处理。"] },
  { id: "security", title: "安全措施", paragraphs: ["平台采用合理的访问控制、权限隔离与技术措施保护信息，但任何网络服务都无法保证绝对安全。用户也应使用安全的登录方式并避免共享账户。"] },
  { id: "rights", title: "用户选择与权利", paragraphs: ["用户可以在账户功能允许的范围内查看或更新资料、管理提醒与收藏，并可通过平台运营方公布的渠道提出访问、更正、删除或其他适用的数据权利请求。具体权利取决于适用法律。"] },
  { id: "changes", title: "政策更新", paragraphs: ["当产品、处理活动或法律要求发生变化时，本政策可能更新。重要变更将通过页面提示或其他适当方式告知，并在页首标明最新日期。"] },
];

export default function PrivacyPage() {
  return <PolicyPage eyebrow="Privacy" title="隐私政策" intro="本政策概述平台可能处理的信息、使用目的和用户可以作出的选择。" updated="2026年9月3日" sections={sections} />;
}
