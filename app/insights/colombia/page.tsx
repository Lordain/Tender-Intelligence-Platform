import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { colombiaInsight } from "@/lib/insight-articles/colombia";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("colombia")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description:
    "梳理哥伦比亚国家投资计划、交通基础设施长期路线图，以及铁路、公路、港口、电网、水务和数字基础设施的区域机会。",
  path: "/insights/colombia",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
export const revalidate = 300;

export default function ColombiaInsightPage() {
  return <InsightArticleView article={colombiaInsight} />;
}
