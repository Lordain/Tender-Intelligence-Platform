import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";
import { siteOrigin } from "@/lib/site-url";
import { BEGINNER_GUIDE_PATH, adviceItems, beginnerGuide, cautionItems, flowDecision, flowSteps, prepareGroups } from "@/lib/beginner-guide";
import { guideCountries, participationGuides } from "@/lib/participation-guides";
import { GuideCountryFlag, guidePlatformLabel } from "@/components/guides/GuideMarks";

export const metadata: Metadata = pageMetadata({
  title: beginnerGuide.shortTitle,
  description: `面向从未参加过拉美招标的中国企业：${beginnerGuide.summary}附各国参标指南。`,
  path: BEGINNER_GUIDE_PATH,
  author: SOCIAL_BRAND,
});

/** Which of the three stages a flow step sits in, by position — 1–3 看项目, 4–6 做投标, 7–8 等结果. */
const STAGES = [
  { label: "看项目", until: 3, className: "bg-[#e6f0f4] text-[#1d5670]" },
  { label: "做投标", until: 6, className: "bg-[#fff0c9] text-[#8f5b00]" },
  { label: "等结果", until: 8, className: "bg-[#e7f2e8] text-[#2e6b3a]" },
];
const stageFor = (index: number) => STAGES.find((stage) => index < stage.until)!;

const SECTIONS = [
  { id: "flow", title: "常见流程" },
  { id: "prepare", title: "需要准备什么" },
  { id: "cautions", title: "需要注意什么" },
  { id: "advice", title: "我们的建议" },
  { id: "countries", title: "各国参标指南" },
];

function SectionHeading({ kicker, title, intro }: { kicker: string; title: string; intro?: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">{kicker}</p>
      <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{title}</h2>
      {intro && <p className="mt-3 max-w-3xl text-sm leading-7 text-[#586873]">{intro}</p>}
    </div>
  );
}

export default function BeginnerGuidePage() {
  const origin = siteOrigin();
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: beginnerGuide.title,
    description: beginnerGuide.summary,
    url: `${origin}${BEGINNER_GUIDE_PATH}`,
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
              <span className="rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">新手入门</span>
              <span className="rounded-full border border-white/25 px-3 py-1 text-xs font-black text-white">适用拉美各国</span>
            </div>
            <h1 className="mt-5 text-3xl font-black leading-[1.22] tracking-[-0.04em] sm:text-5xl">{beginnerGuide.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-white/68">{beginnerGuide.summary}</p>
            <p className="mt-6 text-sm text-white/64">作者：<strong className="text-white">{SOCIAL_BRAND}</strong></p>
          </div>
          <nav aria-label="本页目录" className="mt-9 flex flex-wrap gap-2">
            {SECTIONS.map((section, index) => (
              <a key={section.id} href={`#${section.id}`} className="rounded-full border border-white/15 bg-white/6 px-4 py-2 text-sm font-bold text-white/78 transition hover:border-[#ffb21c] hover:text-white">
                <span className="mr-1.5 font-mono text-[#ffb21c]">{index + 1}</span>{section.title}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8 sm:py-14">
        {/* The flowchart: eight steps, four to a row on desktop with arrows
            between them, stacked with down arrows on a phone. */}
        <section id="flow" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <SectionHeading kicker="Process" title="1. 常见流程" intro="各国叫法不同，顺序大体一样。从看到公告到截标，常常只有 2–6 周。" />
          <div className="mt-5 flex flex-wrap gap-2">
            {STAGES.map((stage) => (
              <span key={stage.label} className={`rounded-md px-2.5 py-1 text-xs font-black ${stage.className}`}>{stage.label}</span>
            ))}
          </div>
          <ol className="mt-6 grid gap-8 lg:grid-cols-4 lg:gap-x-10 lg:gap-y-8">
            {flowSteps.map((step, index) => {
              const stage = stageFor(index);
              const last = index === flowSteps.length - 1;
              const endOfRow = index % 4 === 3;
              return (
                <li key={step.title} className="relative flex gap-4 rounded-2xl border border-[#dbe2e5] bg-white p-4 lg:flex-col lg:gap-3 lg:p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#061b2b] font-mono text-sm font-black text-[#ffb21c]">{index + 1}</span>
                  <span className="min-w-0">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-black ${stage.className}`}>{stage.label}</span>
                    <span className="mt-1.5 block text-base font-black">{step.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-[#586873]">{step.detail}</span>
                    {step.term && <span className="mt-2 block text-[11px] font-bold text-[#8a969d]">{step.term}</span>}
                  </span>
                  {!last && (
                    <span
                      aria-hidden="true"
                      className={`absolute -bottom-7 left-9 text-lg font-black text-[#ffb21c] lg:bottom-auto lg:left-auto lg:-right-8 lg:top-1/2 lg:-translate-y-1/2 ${endOfRow ? "lg:hidden" : ""}`}
                    >
                      <span className="lg:hidden">↓</span>
                      <span className="hidden lg:inline">→</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* The one fork in the path, at step 2. */}
          <div className="mt-8 rounded-2xl bg-[#061b2b] p-5 text-white sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffb21c]">第 2 步的关键判断</p>
            <p className="mt-2 text-lg font-black">{flowDecision.question}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[flowDecision.yes, flowDecision.no].map((branch, index) => (
                <div key={branch.label} className="flex gap-3 rounded-xl border border-white/12 bg-white/6 p-4">
                  <span className={`h-fit shrink-0 rounded-md px-2 py-0.5 text-xs font-black ${index === 0 ? "bg-[#9fd8a8] text-[#0f3b18]" : "bg-[#ffb21c] text-[#071826]"}`}>{branch.label}</span>
                  <p className="text-sm leading-6 text-white/78">{branch.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="prepare" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <SectionHeading kicker="Checklist" title="2. 需要准备什么" intro="下面是多数项目都会要的。每个项目以招标文件里的清单为准。" />
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#e5e9ea] bg-[#e5e9ea] sm:grid-cols-2 lg:grid-cols-3">
            {prepareGroups.map((group) => (
              <div key={group.title} className="bg-white p-5">
                <h3 className="font-black">{group.title}</h3>
                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm leading-6 text-[#43545f]">
                      <span aria-hidden="true" className="mt-0.5 font-black text-[#2e6b3a]">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="cautions" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <SectionHeading kicker="Watch out" title="3. 需要注意什么" />
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {cautionItems.map((item) => (
              <li key={item.title} className="flex gap-3 rounded-xl border-l-4 border-[#e0a12a] bg-[#fff7e4] px-4 py-3.5">
                <span aria-hidden="true" className="mt-0.5 font-black text-[#b86e00]">!</span>
                <span>
                  <span className="block text-sm font-black">{item.title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-[#66562f]">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="advice" className="scroll-mt-8 rounded-3xl bg-[#061b2b] p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">Our advice</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">4. 我们的建议</h2>
          <ol className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {adviceItems.map((item, index) => (
              <li key={item.title} className="rounded-xl border border-white/12 bg-white/6 p-4">
                <span className="font-mono text-sm font-black text-[#ffb21c]">{String(index + 1).padStart(2, "0")}</span>
                <span className="mt-2 block font-black">{item.title}</span>
                <span className="mt-1 block text-sm leading-6 text-white/66">{item.detail}</span>
              </li>
            ))}
          </ol>
          <Link href="/tenders" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#ffb21c] px-6 text-sm font-black text-[#071826] transition hover:bg-[#ffc34d]">浏览在招项目</Link>
        </section>

        <section id="countries" className="scroll-mt-8 rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] p-6 sm:p-8">
          <SectionHeading kicker="By country" title="5. 各国参标指南" intro="每个国家的平台、注册方式和文件要求不同，确定目标国家后，接着看对应的指南。" />
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#e5e9ea] bg-[#e5e9ea] md:grid-cols-2">
            {guideCountries.map((country) => (
              <div key={country.code} className="bg-white p-5 md:last:odd:col-span-2">
                <h3 className="flex items-center gap-2.5 text-lg font-black">
                  <GuideCountryFlag code={country.code} />
                  {country.name}
                </h3>
                <p className="mt-1 truncate text-xs font-bold text-[#8a969d]" title={country.description}>{country.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {participationGuides
                    .filter((guide) => guide.countryCode === country.code)
                    .map((guide) => (
                      <Link key={guide.slug} href={`/guides/${guide.slug}`} className="max-w-full truncate rounded-lg border border-[#e5e9ea] bg-[#f7f4ee] px-2.5 py-1 text-xs font-black text-[#7a4c00] transition hover:border-[#e0a12a] hover:bg-[#fff0c9]">
                        {guidePlatformLabel(guide)} →
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="text-xs leading-6 text-[#8a969d]">本页是通用入门说明，不构成资格保证或法律意见。参与范围、文件格式、截止日期及递交方式，以具体项目的官方公告、招标文件和最新澄清为准。</p>
      </main>
    </div>
  );
}
