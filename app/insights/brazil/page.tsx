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
export const revalidate = 300;

export default function BrazilInsightPage() {
  return <InsightArticleView article={brazilInsight} />;
}
