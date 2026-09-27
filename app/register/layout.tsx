import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { TRIAL_DAYS } from "@/lib/access-control";

/**
 * Why this file exists: see app/login/layout.tsx. Same cause, same fix — a
 * Client Component cannot export `metadata`, so the page had no canonical and
 * no title of its own.
 *
 * The description is the one thing here worth writing carefully. This is the
 * page a search for the product by name should land on, and the trial length
 * is read from TRIAL_DAYS rather than typed, because it has already changed
 * once (3 → 5 days) and a description that says "3 天" after the fact is worse
 * than no description.
 *
 * Renders `children` and nothing else.
 */
export const metadata: Metadata = pageMetadata({
  title: "注册",
  description: `注册拉美招投标信息平台，${TRIAL_DAYS} 天全功能免费试用，无需绑定银行卡。聚合墨西哥、巴西、哥伦比亚、秘鲁、智利等拉美国家十余个政府和国企采购平台，规则筛选加人工精筛，只保留值得中国企业投的项目。`,
  path: "/register",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
