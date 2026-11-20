import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { brazilInsight } from "@/lib/insight-articles/brazil";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("brazil")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description:
    "根据BNDES 2026—2029年基础设施投资预测，梳理巴西电力、公路、水务等八类行业的资金分布、重点区域与中国企业可关注方向。",
  path: "/insights/brazil",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
// 24 h, the same as the tender list it reads (lib/tenders.ts); revalidateTenders() and the
// thrice-daily cron still refresh it on every data change. Was 300 s: rebuilding pages whose
// data had not changed is what filled ISR Writes and Fluid Active CPU (Vercel paused 2026-11-19).
export const revalidate = 86_400;

export default function BrazilInsightPage() {
  return <InsightArticleView article={brazilInsight} />;
}
