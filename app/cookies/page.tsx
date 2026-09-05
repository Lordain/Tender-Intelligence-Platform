import { PolicyPage, type PolicySection } from "@/components/content/PolicyPage";

// 【占位符提示】见 app/terms/page.tsx 顶部同样的说明。
const CONTACT_EMAIL = "【联系邮箱，待补充】";

const sections: PolicySection[] = [
  {
    id: "what",
    title: "什么是 Cookie",
    paragraphs: ["Cookie 是网站在用户浏览器中存储的小文件，用于记住登录状态等信息。本页同时涵盖浏览器本地存储（localStorage）等类似技术，因为平台对它们的使用方式和目的相近。"],
  },
  {
    id: "what-we-use",
    title: "平台使用的 Cookie 与本地存储",
    paragraphs: ["平台只使用以下两类，不使用广告类、跨站追踪类或第三方营销 Cookie；也不会向广告网络共享这些信息。"],
    items: [
      "登录会话 Cookie（严格必要）——由 Supabase 身份验证服务设置，用于保持用户登录状态。这类 Cookie 是使用账户功能（收藏、通知设置、后台管理等）所必需的，无法关闭；不使用即代表不登录账户。",
      "匿名统计标识（localStorage，非 Cookie）——首次访问时生成一个随机、不含个人信息的会话标识，用于统计访问路径、筛选类别使用情况等汇总数据，不记录搜索框输入的具体文字，也不与账户身份关联用于广告目的。",
      "收藏与筛选偏好（localStorage，非 Cookie）——未登录状态下，收藏的标书和搜索条件保存在浏览器本地，仅存于用户自己的设备上。",
    ],
  },
  {
    id: "control",
    title: "如何管理",
    paragraphs: [
      "登录会话 Cookie：可在浏览器设置中清除，但清除后需要重新登录。",
      "localStorage 内容：可在浏览器的网站数据/存储设置中针对本网站清除；清除后，未登录状态下的收藏与筛选偏好会丢失，匿名统计标识会重新生成。",
      "大多数浏览器也提供整体关闭或限制 Cookie 的选项，但关闭登录相关 Cookie 会导致无法使用需要登录的功能。",
    ],
  },
  {
    id: "more",
    title: "更多信息",
    paragraphs: [`本页与《隐私政策》「Cookie 与同类技术」一节内容一致，单独列出便于查阅。如有疑问，请发送邮件至 ${CONTACT_EMAIL}。`],
  },
];

export default function CookiesPage() {
  return <PolicyPage eyebrow="Cookies" title="Cookie 政策" intro="本政策说明平台使用哪些 Cookie 和类似的本地存储技术，以及用户可以如何管理它们。" updated="2026年9月5日" sections={sections} />;
}
