import { PolicyPage, type PolicySection } from "@/components/content/PolicyPage";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie 政策",
  description: "本平台使用的 Cookie 与同类技术，以及它们各自的用途。",
};

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
      "统计标识（localStorage，非 Cookie）——首次访问时生成一个随机、不含姓名或邮箱的标识，用于记录页面访问、筛选类别、项目查看和收藏操作。登录期间产生的事件可能与账户标识关联，以形成运营统计；不记录搜索框输入的具体文字，也不用于第三方广告。该标识会保留至用户清除本网站数据。",
      "收藏与搜索设置（localStorage，非 Cookie）——收藏的项目和已保存搜索条件保存在浏览器本地，仅存于用户自己的设备上。",
    ],
  },
  {
    id: "control",
    title: "如何管理",
    paragraphs: [
      "登录会话 Cookie：可在浏览器设置中清除，但清除后需要重新登录。",
      "localStorage 内容：可在浏览器的网站数据或存储设置中针对本网站清除；清除后，本机保存的收藏与搜索设置会丢失，统计标识会在下次访问时重新生成。",
      "大多数浏览器也提供整体关闭或限制 Cookie 的选项，但关闭登录相关 Cookie 会导致无法使用需要登录的功能。",
    ],
  },
  {
    id: "more",
    title: "更多信息",
    paragraphs: [`本页与《隐私政策》「Cookie 与同类技术」一节内容一致，单独列出便于查阅。如有疑问，请发送邮件至 ${LEGAL_CONTACT_EMAIL}。`],
  },
];

export default function CookiesPage() {
  return <PolicyPage eyebrow="Cookies" title="Cookie 政策" intro="本政策说明平台使用哪些 Cookie 和类似的本地存储技术，以及用户可以如何管理它们。" updated="2026年9月9日" sections={sections} />;
}
