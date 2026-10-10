import Image from "next/image";
import Link from "next/link";
import { InsightHeroCredit } from "@/components/insights/InsightHeroCredit";
import { InsightOpenTenders } from "@/components/insights/InsightOpenTenders";
import { SectorIcon } from "@/components/insights/SectorIcon";
import { GuideNote, GuideStepFlow } from "@/components/guides/GuideVisuals";
import { getCountryInsight } from "@/lib/country-insights";
import type { InsightArticle, InsightBar } from "@/lib/insight-articles/types";
import { SOCIAL_BRAND } from "@/lib/seo";

/**
 * A country insight, drawn rather than written out (user, 2026-10-05: 对所有的
 * 国家洞察页，一样执行你在参标指南做的优化，包括：精简内容、优化排版、优化设计风格、
 * 图形化内容). Same palette and card language as the platform guides: section
 * nav as numbered chips in the hero, the headline numbers as tiles, the money
 * as bar charts, the entry steps as the guides' flowchart.
 *
 * Icons only on the 工程方向 cards, one sector each; everything else leans on
 * numbers, colour and soft gradients (user, 2026-10-05: 不要这种几个有icon、
 * 几个没有 … 卡片微渐变 (Subtle Gradients)).
 */

function Section({ id, index, label, title, intro, children }: { id: string; index: number; label: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
      <p className="flex items-center gap-2 text-xs font-black tracking-[0.14em] text-[#b86e00]">
        <span className="font-mono">{String(index).padStart(2, "0")}</span>
        <span aria-hidden="true" className="h-px w-6 bg-[#e6c98a]" />
        {label}
      </p>
      <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{title}</h2>
      {intro && <p className="mt-3 max-w-3xl text-sm leading-7 text-[#64717c]">{intro}</p>}
      {children}
    </section>
  );
}

/** Bars against the chart's largest value, the figure beside each. */
function BarChart({ bars }: { bars: InsightBar[] }) {
  const max = Math.max(...bars.map((bar) => bar.value));
  return (
    <ul className="space-y-4">
      {bars.map((bar) => (
        <li key={bar.name}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
            <span className="font-black">
              {bar.name}
              {bar.tag && <span className="ml-2 font-mono text-xs font-black text-[#b86e00]">{bar.tag}</span>}
            </span>
            <span className="text-xs font-bold text-[#64717c] sm:text-sm">{bar.amount}</span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-[#e9eef0]">
            <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${Math.max((bar.value / max) * 100, 1.2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The shares as one strip, so the split reads at a glance before the bars. */
function ShareStrip({ bars }: { bars: InsightBar[] }) {
  return (
    <div className="mb-7">
      <div className="flex h-5 overflow-hidden rounded-full ring-1 ring-[#e3e8ea]" role="img" aria-label={bars.map((bar) => `${bar.name}${bar.tag ?? ""}`).join("，")}>
        {bars.map((bar) => (
          <span key={bar.name} className={`${bar.color} h-full border-r-2 border-[#fffdf9] last:border-r-0`} style={{ width: `${bar.value}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-bold text-[#52636e]">
        {bars.map((bar) => (
          <li key={bar.name} className="flex items-center gap-1.5">
            <i aria-hidden="true" className={`size-2.5 rounded-full ${bar.color}`} />
            {bar.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The last card widens to close its row, so a 2- or 3-column grid never ends on an empty cell. */
function lastSpan(count: number) {
  return `${count % 2 === 1 ? "md:col-span-2" : ""} ${count % 3 === 1 ? "lg:col-span-3" : count % 3 === 2 ? "lg:col-span-2" : "lg:col-span-1"}`;
}

function Takeaways({ items }: { items: Array<{ lead: string; text: string }> }) {
  return (
    <ul className={`grid gap-3 md:grid-cols-2 ${items.length === 3 ? "lg:grid-cols-3" : ""}`}>
      {items.map((item) => (
        <li key={item.lead} className="rounded-xl border border-[#dce8ed] bg-gradient-to-br from-white via-white to-[#e8f2f6] p-4 text-[#43545f] shadow-[0_1px_2px_rgba(7,24,38,0.04)] sm:p-5 md:last:odd:col-span-2 lg:last:odd:col-span-1">
          <span aria-hidden="true" className="mb-2.5 block h-1 w-7 rounded-full bg-[#6fb3cf]" />
          <span className="block text-sm font-black leading-6 text-[#071826]">{item.lead}</span>
          <span className="mt-0.5 block text-sm leading-6 opacity-80">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function InsightArticleView({ article }: { article: InsightArticle }) {
  const insight = getCountryInsight(article.slug)!;
  const { strategy } = article;
  const nav: Array<[string, string]> = [
    ["overview", "投资总览"],
    ["sectors", "资金投向"],
    ...(strategy ? [["strategy", strategy.nav] as [string, string]] : []),
    ["pipeline", "工程方向"],
    ["regions", "区域分布"],
    ["opportunities", "企业机会"],
    ["entry", "进入路径"],
    ["sources", "资料来源"],
  ];
  const indexOf = (id: string) => nav.findIndex(([navId]) => navId === id) + 1;
  const yearsMax = article.overview.years ? Math.max(...article.overview.years.items.map((item) => item.value)) : 0;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: insight.title,
    description: insight.description,
    image: insight.heroImage,
    datePublished: article.published,
    dateModified: article.modified,
    author: { "@type": "Organization", name: insight.author },
    publisher: { "@type": "Organization", name: "拉美招投标信息平台" },
    inLanguage: "zh-CN",
  };

  return (
    <article className="bg-[#f7f4ee] text-[#071826]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <header className="relative isolate overflow-hidden bg-[#061b2b] text-white">
        <Image src={insight.heroImage} alt={insight.heroImageAlt} fill priority sizes="100vw" className="object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#031521] via-[#031521]/90 to-[#031521]/15" />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
          <Link href="/insights" className="text-sm font-bold text-white/68 transition hover:text-white">← 返回国家洞察</Link>
          <div className="mt-9 max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">{insight.country}</span>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-white/62">{article.kicker}</span>
            </div>
            <h1 className="mt-5 text-3xl font-black leading-[1.18] tracking-[-0.04em] sm:text-5xl">
              {article.headline[0]}
              <br className="hidden sm:block" />
              {article.headline[1]}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-white/78 sm:text-lg">{article.lede}</p>
            <p className="mt-5 text-sm text-white/62">作者：<strong className="text-white">{SOCIAL_BRAND}</strong></p>
          </div>
          {/* The page's sections as chips, in place of the old sticky sidebar. */}
          <nav aria-label="本页目录" className="mt-8 flex flex-wrap gap-2">
            {nav.map(([id, label], index) => (
              <a key={id} href={`#${id}`} className="rounded-full border border-white/15 bg-[#031521]/55 px-3.5 py-1.5 text-sm font-bold text-white/80 backdrop-blur-sm transition hover:border-[#ffb21c] hover:text-white">
                <span className="mr-1.5 font-mono text-[#ffb21c]">{index + 1}</span>
                {label}
              </a>
            ))}
          </nav>
        </div>
        <InsightHeroCredit insight={insight} />
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8 sm:py-14">
        {/* The headline numbers as tiles; the first dark, like the guides' 一图看懂. */}
        <div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={`${insight.country}关键数字`}>
            {article.stats.map((stat, index) => (
              <li key={stat.label} className={`flex min-w-0 flex-col rounded-2xl p-4 sm:p-6 ${index === 0 ? "bg-gradient-to-br from-[#0f3550] to-[#061b2b] text-white" : "border border-[#e6dfcf] bg-gradient-to-br from-white via-white to-[#f7eedb]"}`}>
                <span className={`text-[11px] font-black uppercase tracking-[0.12em] ${index === 0 ? "text-[#ffb21c]" : "text-[#b86e00]"}`}>{stat.label}</span>
                <span className={`mt-3 break-words text-2xl font-black leading-none tracking-[-0.05em] sm:mt-4 sm:text-[2.1rem] ${index === 0 ? "text-white" : "text-[#071826]"}`}>{stat.value}</span>
                <span className={`mt-2 text-sm font-black ${index === 0 ? "text-white/85" : "text-[#253d4b]"}`}>{stat.unit}</span>
                {stat.detail && <span className={`mt-0.5 text-xs font-bold ${index === 0 ? "text-[#ffcf70]" : "text-[#8a672e]"}`}>{stat.detail}</span>}
                <span className={`mt-auto pt-4 text-xs leading-5 ${index === 0 ? "text-white/60" : "text-[#6b7981]"}`}>{stat.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-3 rounded-2xl border border-[#f1dcae] bg-gradient-to-r from-[#fffaf0] to-[#ffefcc] px-4 py-3.5 text-sm leading-6 text-[#66562f] sm:px-5">
            <span className="mt-0.5 h-fit shrink-0 rounded-md bg-[#b86e00] px-2 py-0.5 text-[11px] font-black text-white">数字口径</span>
            <span>{article.basis}</span>
          </p>
        </div>

        <Section id="overview" index={indexOf("overview")} label="投资总览" title={article.overview.title}>
          <div className={`mt-6 grid gap-6 ${article.overview.years ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start" : ""}`}>
            <ol className={`grid gap-3 ${article.overview.years ? "" : "md:grid-cols-3"}`}>
              {article.overview.points.map((point, index) => (
                <li key={point.lead} className="flex gap-4 rounded-2xl border border-[#e6dfcf] bg-gradient-to-br from-white via-white to-[#fbf4e4] p-4 sm:p-5">
                  <span className="font-mono text-2xl font-black leading-none text-[#ffb21c]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black leading-6">{point.lead}</span>
                    <span className="mt-0.5 block text-sm leading-6 text-[#586873]">{point.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            {article.overview.years && (
              <figure className="rounded-2xl bg-gradient-to-br from-[#0f3550] to-[#061b2b] p-5 text-white sm:p-6">
                <figcaption className="text-xs font-black uppercase tracking-[0.12em] text-[#ffb21c]">{article.overview.years.title}</figcaption>
                <div className="mt-5 flex h-44 items-end gap-3 sm:gap-4">
                  {article.overview.years.items.map((item) => (
                    <div key={item.year} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
                      <span className="text-[11px] font-black leading-4 text-white/85 sm:text-xs">{item.amount}</span>
                      <span className="mt-1.5 block rounded-t-lg bg-gradient-to-t from-[#d88900] to-[#ffb21c]" style={{ height: `${(item.value / yearsMax) * 72}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-3 border-t border-white/15 pt-2 sm:gap-4">
                  {article.overview.years.items.map((item) => (
                    <span key={item.year} className="min-w-0 flex-1 text-center">
                      <span className="block font-mono text-sm font-black">{item.year}</span>
                      {item.status && <span className="block text-[11px] text-white/55">{item.status}</span>}
                    </span>
                  ))}
                </div>
              </figure>
            )}
          </div>
        </Section>

        <Section id="sectors" index={indexOf("sectors")} label="资金投向" title={article.sectors.title} intro={article.sectors.intro}>
          <div className="mt-6 rounded-2xl border border-[#e3e8ea] bg-gradient-to-br from-white to-[#f4f6f6] p-5 sm:p-6">
            {article.sectors.shares && <ShareStrip bars={article.sectors.bars} />}
            <BarChart bars={article.sectors.bars} />
          </div>
          {article.sectors.takeaways && (
            <div className="mt-6">
              <Takeaways items={article.sectors.takeaways} />
            </div>
          )}
        </Section>

        {strategy && (
          <Section id="strategy" index={indexOf("strategy")} label={strategy.nav} title={strategy.title} intro={strategy.intro}>
            <ul className={`mt-6 grid gap-3 ${strategy.items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              {strategy.items.map((item) => (
                <li key={item.title} className="rounded-2xl border border-[#e6dfcf] bg-gradient-to-br from-white via-white to-[#f7eedb] p-5">
                  <span className="inline-block rounded-md bg-[#061b2b] px-2 py-0.5 font-mono text-[11px] font-black text-[#ffb21c]">{item.tag}</span>
                  <h3 className="mt-3 font-black">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-[#586873]">{item.text}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="pipeline" index={indexOf("pipeline")} label="工程方向" title={article.pipeline.title}>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {article.pipeline.items.map((item) => (
              <li key={item.title} className="flex gap-4 rounded-2xl border border-[#e3e8ea] bg-white p-5 shadow-[0_1px_2px_rgba(7,24,38,0.04)] md:last:odd:col-span-2">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#061b2b] text-[#ffb21c]"><SectorIcon name={item.icon} /></span>
                <span className="min-w-0">
                  <span className="block font-black leading-6">{item.title}</span>
                  {item.figure && <span className="mt-1 inline-block rounded-md bg-[#fff0c9] px-2 py-0.5 text-xs font-black text-[#7a4c00]">{item.figure}</span>}
                  <span className="mt-1.5 block text-sm leading-6 text-[#586873]">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
          {article.pipeline.note && (
            <div className="mt-6">
              <GuideNote>{article.pipeline.note}</GuideNote>
            </div>
          )}
        </Section>

        <Section id="regions" index={indexOf("regions")} label="区域分布" title={article.regions.title}>
          <figure className="mt-6 overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#061b2b]">
            {/* The region maps are SVG from scripts/generate-insight-maps.mjs: served as they are, since the optimizer does not rasterize SVG. */}
            <Image src={article.regions.map.src} alt={article.regions.map.alt} width={article.regions.map.width} height={article.regions.map.height} sizes="(min-width: 1152px) 1088px, 100vw" unoptimized={article.regions.map.src.endsWith(".svg")} className="h-auto w-full" />
            <figcaption className="border-t border-white/10 px-5 py-3 text-xs leading-6 text-white/58">{article.regions.map.caption}</figcaption>
          </figure>
          {/* The colour badge doubles as the map's legend. */}
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {article.regions.items.map((region, index) => (
              <li key={region.title} className="rounded-2xl border border-[#e3e8ea] bg-gradient-to-br from-white via-white to-[#f4f6f6] p-5">
                <div className="flex items-center gap-3">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-black text-white ring-4 ring-white ${region.color}`}>{index + 1}</span>
                  <h3 className="font-black leading-6">{region.title}</h3>
                </div>
                <p className="mt-3 text-xs font-bold leading-5 text-[#8a672e]">{region.places}</p>
                <p className="mt-2 text-sm leading-6 text-[#586873]">{region.focus}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <GuideNote>{article.regions.note}</GuideNote>
          </div>
        </Section>

        <Section id="opportunities" index={indexOf("opportunities")} label="企业机会" title={article.opportunities.title} intro={article.opportunities.intro}>
          <ul className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {article.opportunities.items.map((item, index, all) => (
              <li key={item.sector} className={`flex flex-col rounded-2xl border border-[#e3e8ea] bg-white p-5 shadow-[0_1px_2px_rgba(7,24,38,0.04)] ${index === all.length - 1 ? lastSpan(all.length) : ""}`}>
                <h3 className="font-black">{item.sector}</h3>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {item.scope.map((scope) => (
                    <li key={scope} className="rounded-md border border-[#cfe2ea] bg-[#f1f7fa] px-2 py-0.5 text-xs font-bold leading-5 text-[#1d5670]">{scope}</li>
                  ))}
                </ul>
                <p className="mt-auto border-t border-[#eef1f2] pt-3 text-xs leading-5 text-[#64717c]">
                  <span className="mr-1 font-black text-[#b86e00]">谁在采购</span>
                  {item.buyers}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="entry" index={indexOf("entry")} label="进入路径" title={article.entry.title}>
          <div className="mt-8">
            <GuideStepFlow steps={article.entry.steps} />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {article.entry.guides.map((guide, index) => (
              <Link key={guide.href} href={guide.href} className={`inline-flex min-h-12 items-center rounded-xl px-5 text-sm font-black transition ${index === 0 ? "bg-[#061b2b] text-white hover:bg-[#123a54]" : "border border-[#061b2b] text-[#061b2b] hover:bg-[#edf1f2]"}`}>
                {guide.label} →
              </Link>
            ))}
          </div>
        </Section>

        <section className="rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">From outlook to tenders</p>
          <h2 className="mt-3 text-2xl font-black">继续查看正在发布的{insight.country}项目</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64">洞察看方向，项目页核对采购方、截止日期和文件要求。</p>
          <InsightOpenTenders country={article.countryEn} accentText="text-[#ffb21c]" accentBorder="hover:border-[#ffb21c]" />
          <Link href={article.countryPath} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#ffb21c] px-6 font-black text-[#071826] transition hover:bg-[#ffc34d]">浏览{insight.country}招标项目 →</Link>
        </section>

        <Section id="sources" index={indexOf("sources")} label="资料来源" title="资料来源与使用说明" intro={article.sources.intro}>
          <div className="mt-6 grid gap-2.5 md:grid-cols-2">
            {article.sources.items.map((source) => (
              <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="group flex gap-3 rounded-xl border border-[#e3e8ea] bg-white px-4 py-3 transition hover:border-[#e6c98a] hover:bg-[#fffaf0]">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black leading-6">{source.label}</span>
                  <span className="block text-xs leading-5 text-[#71808a]">{source.note}</span>
                </span>
                <span className="shrink-0 font-black text-[#b86e00] transition-transform group-hover:translate-x-0.5">↗</span>
              </a>
            ))}
          </div>
          <div className="mt-6 space-y-2 border-t border-[#e3e8ea] pt-5 text-xs leading-6 text-[#71808a]">
            <p><strong className="text-[#52636e]">美元换算：</strong>{article.sources.fx}</p>
            {article.sources.caution && <p><strong className="text-[#52636e]">注意：</strong>{article.sources.caution}</p>}
            <p>本文不构成投资、法律、税务或投标资格意见。项目进度、预算、资格与合同条件，以主管机构和采购文件的最新版本为准。</p>
          </div>
        </Section>
      </main>
    </article>
  );
}
