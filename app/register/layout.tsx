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
  description: `注册拉美招投标信息平台，${TRIAL_DAYS} 天全功能免费试用，无需绑定银行卡。专注于拉美五国政府招标采购信息，一站式中文平台。覆盖墨西哥、巴西、哥伦比亚、秘鲁、智利，汇集各官方采购平台，中文翻译，人工精筛，按国家、行业、项目规模筛选。`,
  path: "/register",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
