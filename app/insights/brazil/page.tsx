import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { brazilInsight } from "@/lib/insight-articles/brazil";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("brazil")!;

export const metadata: Metadata = pageMetadata({
  title: "巴西国家洞察：Novo PAC、特许经营与区域基础设施机会",
  description:
    "梳理巴西Novo PAC、PPI项目组合，以及交通、能源、港口、水务、城市建设和区域供应链机会。",
  path: "/insights/brazil",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
export const revalidate = 300;

export default function BrazilInsightPage() {
  return <InsightArticleView article={brazilInsight} />;
}
