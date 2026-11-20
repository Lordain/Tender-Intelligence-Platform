import type { Metadata } from "next";
import { InsightArticleView } from "@/components/insights/InsightArticle";
import { getCountryInsight } from "@/lib/country-insights";
import { mexicoInsight } from "@/lib/insight-articles/mexico";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";

const insight = getCountryInsight("mexico")!;

export const metadata: Metadata = pageMetadata({
  title: insight.title,
  description:
    "基于墨西哥2026年官方资料，拆解5.6万亿比索基础设施投资基准、行业配置、重点项目、区域分布及中国企业可参与空间。",
  path: "/insights/mexico",
  image: insight.heroImage,
  author: SOCIAL_BRAND,
});

/** The insight text is static; the 在招项目精选 inside its closing panel refreshes with the tender list. */
// 24 h, the same as the tender list it reads (lib/tenders.ts); revalidateTenders() and the
// thrice-daily cron still refresh it on every data change. Was 300 s: rebuilding pages whose
// data had not changed is what filled ISR Writes and Fluid Active CPU (Vercel paused 2026-11-19).
export const revalidate = 86_400;

export default function MexicoInsightPage() {
  return <InsightArticleView article={mexicoInsight} />;
}
