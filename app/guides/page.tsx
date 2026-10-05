import type { Metadata } from "next";
import { pageMetadata, SOCIAL_BRAND } from "@/lib/seo";
import Link from "next/link";
import { guideCountries, participationGuides } from "@/lib/participation-guides";
import { GuideCountryFlag, GuideLogo, guidePlatformLabel } from "@/components/guides/GuideMarks";
import { BeginnerGuideCard } from "@/components/guides/BeginnerGuideCard";

export const metadata: Metadata = pageMetadata({
  title: "参标指南",
  description:
    "面向中国企业的拉美参标指南：墨西哥、巴西、哥伦比亚、秘鲁、智利、阿根廷、多米尼加的政府采购平台，以及 Petrobras、Pemex、CFE、Cemig、Codelco、Petroperú 等国有石油、电力、矿业公司的供应商注册、参与流程、常见资料与注意事项，免费阅读。",
  path: "/guides",
  author: SOCIAL_BRAND,
});

export default function GuidesPage() {
  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <header className="bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-[108rem]">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.65fr)] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ffb21c]">Bid participation guides</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[1.12] tracking-[-0.04em] sm:text-5xl lg:text-6xl">参标需知</h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-white/68 sm:text-lg">为中国企业整理拉美政府采购平台的参与流程、常见资质与文件准备要点。先看懂规则，再决定如何进入项目。</p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/6 p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffb21c]">免费开放</p>
              <p className="mt-3 text-sm leading-7 text-white/68">指南不需要登录或订阅。内容会随官方制度和平台变化持续整理，并保留便于核对的官方来源。</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[108rem] px-5 py-10 sm:px-8 sm:py-12">
        {/* Pinned above everything: the 新手入门 guide (user, 2026-10-05). */}
        <BeginnerGuideCard className="rounded-2xl" />

        <div className="mt-6 flex flex-col gap-1 rounded-xl border border-[#e6b13f] bg-[#fff3cf] px-5 py-4 sm:flex-row sm:gap-4">
          <p className="shrink-0 text-sm font-black leading-7 text-[#6d4900]">使用前请注意</p>
          <p className="text-sm leading-7 text-[#6d5a31]">指南提供通用准备框架，不构成资格保证或法律意见。参与范围、文件格式、截止日期及提交方式，始终以具体项目的官方公告、招标文件、附件与最新澄清为准。</p>
        </div>

        {/* One panel per country with its guides as a list, in a hairline
            grid like /pricing, rather than a heading band and a row of tall
            cards per country (user, 2026-10-04: 布局整体太长了，也浪费了很多
            空间，可以做成更精简的卡片，然后每个国家名称旁边都增加国旗). The
            last cell is the 持续扩充 note, so the grid stays filled at two
            columns with seven countries (four were tried and cramped the
            rows at 1600px). Each panel spans three rows
            and shares them through subgrid, so the heading, the one-line
            description and the top of the list sit on the same lines across
            a row of panels (user, 2026-10-04: 保持左右对齐，调整摘要长度，
            不要两行). */}
        <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#dbe2e5] bg-[#dbe2e5] lg:grid-cols-2">
          {guideCountries.map((country) => {
            const guides = participationGuides.filter((guide) => guide.countryCode === country.code);
            return (
              <section key={country.code} aria-labelledby={`guides-${country.code}`} className="row-span-3 grid grid-rows-subgrid bg-[#fffdf9] p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <h2 id={`guides-${country.code}`} className="flex items-center gap-3 text-2xl font-black tracking-[-0.03em]">
                    <GuideCountryFlag code={country.code} />
                    {country.name}
                  </h2>
                  <span className="mt-1.5 shrink-0 text-xs font-bold text-[#8a969d]">{guides.length} 份指南</span>
                </div>
                <p title={country.description} className="mt-2 text-sm leading-6 text-[#64717c] lg:truncate">{country.description}</p>
                <ul className="mt-4 divide-y divide-[#e5e9ea] border-t border-[#e5e9ea]">
                  {guides.map((guide) => (
                    <li key={guide.slug}>
                      <Link href={`/guides/${guide.slug}`} className="group -mx-3 flex items-start gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-[#f4efe4]">
                        <GuideLogo slug={guide.slug} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="rounded-md bg-[#fff0c9] px-2 py-0.5 text-xs font-black text-[#8f5b00]">{guide.issuerType}</span>
                            <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.14em] text-[#b86e00]">{guidePlatformLabel(guide)}</span>
                          </span>
                          <span className="mt-2 block text-base font-black leading-7 tracking-[-0.01em]">{guide.title}</span>
                          <span className="mt-0.5 block text-xs font-bold leading-5 text-[#8a969d]">{guide.issuer}</span>
                        </span>
                        <span aria-hidden="true" className="mt-8 shrink-0 font-black text-[#b86e00] transition-transform group-hover:translate-x-1">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <section className="row-span-3 flex flex-col bg-[#061b2b] p-5 text-white sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">持续扩充</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">更多国家与采购平台将陆续加入</h2>
            <p className="mt-3 text-sm leading-7 text-white/62">随着平台覆盖范围扩大，我们会继续增加各国注册入口、参与流程、常见材料及境外企业需要特别核对的事项。</p>
            <Link href="/tenders" className="mt-6 inline-flex min-h-11 w-fit items-center justify-center rounded-xl bg-[#ffb21c] px-6 text-sm font-black text-[#071826] transition hover:bg-[#ffc34d] lg:mt-auto">浏览招标项目</Link>
          </section>
        </div>
        <p className="mt-4 text-xs leading-6 text-[#8a969d]">各平台图标与名称归其所有者，仅用于识别对应的官方平台，不代表合作或认可。</p>
      </main>
    </div>
  );
}
