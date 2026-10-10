import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { boliviaInsight } from "@/lib/insight-articles/bolivia";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("bolivia")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description: insight.description,
  path: "/insights/bolivia",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

export const revalidate = 300;

export default function BoliviaInsightPage() {
  return <InsightArticleView article={boliviaInsight} />;
}
