import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { peruInsight } from "@/lib/insight-articles/peru";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("peru")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description:
    "梳理秘鲁2024—2030竞争力规划、2032物流走廊、2026公共投资与PPP项目组合，以及交通、矿业、能源、水务和社会基础设施机会。",
  path: "/insights/peru",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
// 24 h, the same as the tender list it reads (lib/tenders.ts); revalidateTenders() and the
// thrice-daily cron still refresh it on every data change. Was 300 s: rebuilding pages whose
// data had not changed is what filled ISR Writes and Fluid Active CPU (Vercel paused 2026-11-19).
export const revalidate = 86_400;

export default function PeruInsightPage() {
  return <InsightArticleView article={peruInsight} />;
}
