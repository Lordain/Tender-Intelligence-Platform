import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { countryInsights } from "@/lib/country-insights";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "国家洞察",
  description:
    "面向中国企业的拉美国家投资与政府采购洞察，整理战略规划、行业预算、重点区域、项目机会与参与提示。",
  path: "/insights",
});

export default function CountryInsightsPage() {
  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <header className="bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-[94rem]">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.65fr)] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ffb21c]">Country intelligence</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-black leading-[1.12] tracking-[-0.04em] sm:text-5xl lg:text-6xl">国家洞察</h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-white/68 sm:text-lg">
                不只看单个招标。先理解一个国家把资金投向哪里、项目集中在哪些区域，再判断企业应该提前布局哪些客户、伙伴与能力。
              </p>
            </div>
            <div className="rounded-2xl border border-white/12 bg-white/6 p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ffb21c]">持续更新</p>
              <p className="mt-3 text-sm leading-7 text-white/68">
                数据优先采用政府规划、财政文件和主管机构公告。规划会调整，具体采购仍以各项目最新官方文件为准。
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[94rem] px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-7 lg:grid-cols-2">
          {countryInsights.map((insight) => (
            <article key={insight.slug} className="group overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] shadow-[0_18px_50px_rgba(7,24,38,0.06)]">
              <Link href={`/insights/${insight.slug}`} className="block">
                <div className="relative aspect-[16/9] overflow-hidden bg-[#061b2b]">
                  <Image
                    src={insight.heroImage}
                    alt={`${insight.country}战略投资与基础设施`}
                    fill
                    priority
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#061b2b]/75 via-transparent to-transparent" />
                  <span className="absolute bottom-5 left-5 rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">{insight.country}</span>
                </div>
                <div className="p-6 sm:p-8">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[#7b878e]">
                    <span>作者：{insight.author}</span>
                  </div>
                  <h2 className="mt-4 text-2xl font-black leading-9 tracking-[-0.03em] sm:text-3xl">{insight.title}</h2>
                  <p className="mt-4 text-sm leading-7 text-[#5c6c76]">{insight.description}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {insight.highlights.map((highlight) => (
                      <span key={highlight} className="rounded-full bg-[#edf2f4] px-3 py-1.5 text-xs font-bold text-[#38505e]">{highlight}</span>
                    ))}
                  </div>
                  <p className="mt-8 font-black text-[#a96a00] transition-transform group-hover:translate-x-1">阅读全文 →</p>
                </div>
              </Link>
            </article>
          ))}
        </div>

        <section className="mt-14 rounded-3xl bg-[#061b2b] px-6 py-10 text-white sm:px-10 sm:py-12">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">下一步</p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">从国家方向进入具体项目</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
            国家洞察回答“机会在哪里”，招标项目页继续回答“现在有哪些项目、还剩多少时间、参与条件是什么”。
          </p>
          <Link href="/tenders" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ffb21c] px-6 font-black text-[#071826] transition hover:bg-[#ffc34d]">浏览招标项目</Link>
        </section>
      </main>
    </div>
  );
}
