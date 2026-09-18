import Image from "next/image";
import Link from "next/link";
import { countryInsights } from "@/lib/country-insights";

export function CountryInsightsPreview() {
  return (
    <section id="country-insights" className="scroll-mt-20 bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[94rem]">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffb21c]">Country insights</p>
            <h2 className="mt-3 text-3xl font-black leading-[1.18] tracking-[-0.04em] sm:text-4xl">
              先看国家投资方向，<br className="hidden sm:block" />再判断项目机会
            </h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-2xl text-sm leading-7 text-white/66">
              从官方规划、预算、行业管线和区域分布出发，帮助企业识别值得持续跟踪的市场方向。
            </p>
            <Link href="/insights" className="mt-5 inline-flex font-black text-[#ffb21c] transition hover:text-[#ffd06f]">
              查看全部国家洞察 →
            </Link>
          </div>
        </div>

        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {countryInsights.map((insight) => (
            <Link
              key={insight.slug}
              href={`/insights/${insight.slug}`}
              className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#fffdf9] text-[#071826] shadow-[0_20px_55px_rgba(0,0,0,0.18)] transition duration-300 hover:-translate-y-1 hover:border-[#ffb21c]/60"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-[#0a2639]">
                <Image
                  src={insight.heroImage}
                  alt={`${insight.country}战略投资与基础设施`}
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#061b2b]/70 via-transparent to-transparent" />
                <span className="absolute bottom-4 left-4 rounded-full bg-[#ffb21c] px-3 py-1 text-xs font-black text-[#071826]">
                  {insight.country}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="text-xl font-black leading-8 tracking-[-0.03em]">{insight.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#64717c]">{insight.description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {insight.highlights.slice(0, 2).map((highlight) => (
                    <span key={highlight} className="rounded-full bg-[#edf2f4] px-3 py-1.5 text-xs font-bold leading-5 text-[#38505e]">
                      {highlight}
                    </span>
                  ))}
                </div>
                <span className="mt-auto pt-7 text-sm font-black text-[#9d6400] transition-transform group-hover:translate-x-1">
                  阅读洞察 →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
