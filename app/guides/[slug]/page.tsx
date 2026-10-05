import type { Metadata } from "next";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getParticipationGuide, participationGuides } from "@/lib/participation-guides";
import { getCachedTenderList } from "@/lib/tenders";
import { tenderLinksForGuide } from "@/lib/tender-links";
import { countryKeyForGuide, countryPagePath } from "@/lib/country-pages";
import { TenderLinkCards } from "@/components/tenders/TenderLinkCards";
import { BEGINNER_GUIDE_PATH } from "@/lib/beginner-guide";
import { guideFactIcon, guideSectionIcon } from "@/lib/guide-visuals";
import { BeginnerIcon } from "@/components/guides/BeginnerIcon";
import { GuideSectionBody } from "@/components/guides/GuideVisuals";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

/** The guide text is static; the 在招项目 block under it is not. Same five minutes as the tender list cache. */
export const revalidate = 300;

export function generateStaticParams() {
  return participationGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getParticipationGuide(slug);
  if (!guide) return {};

  // The buyer in Chinese leads the description (user, 2026-09-25): a search
  // for 巴西国家石油公司 招标 should find the Petrobras guide even though its
  // platform name is Portuguese.
  return pageMetadata({
    title: `${guide.platform} 参标指南`,
    description: `${guide.issuer}（${guide.issuerType}）：${guide.summary}`,
    path: `/guides/${guide.slug}`,
    // The 小红书 / 微信公众号 name — see SOCIAL_BRAND.
    author: SOCIAL_BRAND,
  });
}

export default async function GuideDetailPage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getParticipationGuide(slug);
  if (!guide) notFound();

  const countryKey = countryKeyForGuide(guide);
  const openTenders = countryKey
    ? tenderLinksForGuide(await getCachedTenderList(), { slug: guide.slug, countryKey })
    : { links: [], scope: "country" as const };

  const currentIndex = participationGuides.findIndex((item) => item.slug === guide.slug);
  const nextGuide = participationGuides[(currentIndex + 1) % participationGuides.length];

  // Same Article shape as the country insights: authored under the 小红书 /
  // 微信公众号 name, published by the platform.
  const origin = siteOrigin();
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.summary,
    url: `${origin}/guides/${guide.slug}`,
    author: { "@type": "Organization", name: SOCIAL_BRAND },
    publisher: { "@type": "Organization", name: "拉美招投标信息平台" },
    inLanguage: "zh-CN",
  };

  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <header className="bg-[#061b2b] px-5 py-12 text-white sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <Link href="/guides" className="inline-flex items-center gap-2 text-sm font-bold text-white/62 transition hover:text-white">← 返回全部参标指南</Link>
          <div className="mt-9 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">{guide.country}</span>
              <span className="rounded-full border border-white/25 px-3 py-1 text-xs font-black text-white">{guide.issuerType}</span>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/55">{guide.platform}</span>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-black leading-[1.22] tracking-[-0.04em] sm:text-5xl">{guide.title}</h1>
            <p className="mt-4 text-sm font-bold text-[#ffb21c]">采购方：{guide.issuer}</p>
            <p className="mt-3 max-w-3xl text-base leading-8 text-white/68">{guide.summary}</p>
            <p className="mt-6 text-sm text-white/64">作者：<strong className="text-white">{SOCIAL_BRAND}</strong></p>
          </div>
          {/* The page's sections as chips, in place of the old sticky sidebar,
              so the flowchart and the cards get the full width. */}
          <nav aria-label="本页目录" className="mt-9 flex flex-wrap gap-2">
            {[{ id: "overview", title: "一图看懂" }, ...guide.sections, { id: "sources", title: "官方来源" }].map((section) => (
              <a key={section.id} href={`#${section.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/6 px-3.5 py-2 text-sm font-bold text-white/78 transition hover:border-[#ffb21c] hover:text-white">
                <BeginnerIcon name={section.id === "overview" ? "eye" : section.id === "sources" ? "link" : guideSectionIcon(section.id)} className="size-4 text-[#ffb21c]" />
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8 sm:py-14">
        {/* 一图看懂: what the platform is, in two sentences, and the facts as tiles. */}
        <section id="overview" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">At a glance</p>
              <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{guide.platform} 是什么？</h2>
              <p className="mt-4 text-sm leading-7 text-[#52636e] sm:text-base sm:leading-8">{guide.whatIs}</p>
              <Link href={BEGINNER_GUIDE_PATH} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#fff0c9] px-3 py-1.5 text-xs font-black text-[#7a4c00] transition hover:bg-[#ffe3a0]">
                <BeginnerIcon name="lightbulb" className="size-4" />第一次投拉美？先看新手入门 →
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[...guide.quickFacts, { label: "适合谁看", value: guide.audience }].map((fact, index) => (
                <li key={fact.label} className={`flex gap-3 rounded-2xl p-4 ${index === 0 ? "bg-[#061b2b] text-white" : "border border-[#dbe2e5] bg-white"}`}>
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${index === 0 ? "bg-[#ffb21c]/14 text-[#ffb21c]" : "bg-[#fff0c9] text-[#8f5b00]"}`}>
                    <BeginnerIcon name={fact.label === "适合谁看" ? "users" : guideFactIcon(fact.label)} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[11px] font-black uppercase tracking-[0.12em] ${index === 0 ? "text-white/55" : "text-[#8a969d]"}`}>{fact.label}</span>
                    <span className="mt-1 block text-sm font-black leading-6">{fact.value}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {guide.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
            <h2 className="flex items-center gap-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#061b2b] text-[#ffb21c]"><BeginnerIcon name={guideSectionIcon(section.id)} className="size-[22px]" /></span>
              {section.title}
            </h2>
            <GuideSectionBody section={section} />
          </section>
        ))}

        <section id="sources" className="scroll-mt-8 rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">Official sources</p>
          <h2 className="mt-3 text-2xl font-black">官方入口与核验来源</h2>
          <p className="mt-3 text-sm leading-7 text-white/58">准备投标时，回到官方入口再核对一次最新公告和项目文件。</p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {guide.sources.map((source) => (
              <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/6 px-4 py-3.5 text-sm font-bold transition hover:border-[#ffb21c] hover:bg-white/10">
                <BeginnerIcon name="link" className="size-4 text-[#ffb21c]" />
                <span className="min-w-0 flex-1">{source.label}</span>
                <span className="shrink-0 text-[#ffb21c]">↗</span>
              </a>
            ))}
          </div>
          {/* The 重要说明 box, kept but folded down to a line at the foot of the sources. */}
          <p className="mt-6 flex gap-2 border-t border-white/12 pt-5 text-xs leading-6 text-white/55">
            <BeginnerIcon name="info" className="mt-1 size-4" />
            本页帮助企业做前期准备，不代表采购方确认您具备资格。具体项目的公告、招标文件、附件、澄清答复及更正通知具有最终效力。
          </p>
        </section>

        {/* At most three (user, 2026-09-25: 建议不超过3个项目) — the page is
            about the platform, this is only the bridge to its live tenders. */}
        {countryKey && openTenders.links.length > 0 && (
          <section id="open-tenders" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Open tenders</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">
              {openTenders.scope === "platform" ? "该平台当前在招项目" : `${guide.country}当前在招项目`}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[#586873]">
              {openTenders.scope === "platform"
                ? `以下项目通过 ${guide.platform} 发布，目前仍在招标期内。`
                : `${guide.platform} 目前没有仍在招标期内的项目，以下为${guide.country}的其他在招项目。`}
            </p>
            <div className="mt-6">
              <TenderLinkCards links={openTenders.links} />
            </div>
            <Link href={countryPagePath(countryKey)} className="mt-5 inline-flex text-sm font-black text-[#a96100] transition hover:text-[#071826]">
              查看{guide.country}全部在招项目 →
            </Link>
          </section>
        )}

        <section className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">继续阅读</p>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-[#64717c]">下一篇指南</p>
              <h2 className="mt-1 text-xl font-black">{nextGuide.platform}</h2>
            </div>
            <Link href={`/guides/${nextGuide.slug}`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ffb21c] px-6 font-black transition hover:bg-[#ffc34d]">查看指南 →</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
