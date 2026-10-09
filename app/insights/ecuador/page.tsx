import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { ecuadorInsight } from "@/lib/insight-articles/ecuador";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("ecuador")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description: insight.description,
  path: "/insights/ecuador",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

export const revalidate = 300;

export default function EcuadorInsightPage() {
  return <InsightArticleView article={ecuadorInsight} />;
}
