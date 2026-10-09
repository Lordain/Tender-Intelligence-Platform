import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { panamaInsight } from "@/lib/insight-articles/panama";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("panama")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description: insight.description,
  path: "/insights/panama",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

export const revalidate = 300;

export default function PanamaInsightPage() {
  return <InsightArticleView article={panamaInsight} />;
}
