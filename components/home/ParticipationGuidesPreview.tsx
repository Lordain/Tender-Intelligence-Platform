import Link from "next/link";
import { homepageGuides } from "@/lib/participation-guides";
import { Reveal } from "@/components/home/Reveal";
import { GuideCountryFlag, GuideLogo } from "@/components/guides/GuideMarks";

export function ParticipationGuidesPreview() {
  return (
    <section className="bg-[#f7f4ee] px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[108rem]">
        <Reveal className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Bid guides</p>
            <h2 className="mt-3 text-[min(7.2vw,1.875rem)] font-black leading-[1.22] tracking-[0.02em] text-[#071826] sm:text-4xl"><span className="block whitespace-nowrap">第一次参与拉美政府采购？</span><span className="block whitespace-nowrap">先从参标指南开始</span></h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-2xl text-sm leading-7 text-[#64717c]">免费了解各平台的注册路径、参与步骤、常见资料和境外企业需要重点核对的事项。</p>
            <Link href="/guides" className="mt-5 inline-flex font-black text-[#9d6400] transition hover:text-[#714800]">查看全部参标指南 →</Link>
          </div>
        </Reveal>

        {/*
          Every cell draws its own top and left hairline and pulls back a pixel,
          so adjacent borders collapse into one and the panel's own border is
          never doubled. The point is that this holds for ANY number of guides:
          the previous version hard-coded five columns and hand-placed the
          dividers by index, which came apart the moment Peru added a sixth and
          seventh card. The strip is capped at four now (homepageGuides), so
          that particular break can't recur — but nothing here depends on the
          count, which is the point.
        */}
        <div className="mt-9 grid overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] md:grid-cols-2 xl:grid-cols-4">
          {homepageGuides().map((guide, index) => (
            <Reveal key={guide.slug} delayMs={index * 110} className="-ml-px -mt-px flex">
            {/* Same pieces as the /guides rows — flag beside the country,
                the platform's official icon, type tag, title, buyer — so the
                strip reads as a preview of that page (user, 2026-10-04:
                首页的参标指南改成同一种设计风格，一样保持只展示4条). */}
            <Link href={`/guides/${guide.slug}`} className="group flex w-full flex-col border-l border-t border-[#dbe2e5] p-6 transition-colors hover:bg-[#f4efe4]">
              <span className="flex items-center gap-2.5 text-lg font-black tracking-[-0.02em] text-[#071826]">
                <GuideCountryFlag code={guide.countryCode} />
                {guide.country}
              </span>
              <span className="mt-4 flex items-start gap-4 border-t border-[#e5e9ea] pt-4">
                <GuideLogo slug={guide.slug} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="rounded-md bg-[#fff0c9] px-2 py-0.5 text-xs font-black text-[#8f5b00]">{guide.issuerType}</span>
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#b86e00]">{guide.platform}</span>
                  </span>
                  <h3 className="mt-2 text-base font-black leading-7 tracking-[-0.01em] text-[#071826]">{guide.title}</h3>
                  <span className="mt-0.5 block text-xs font-bold leading-5 text-[#8a969d]">{guide.issuer}</span>
                </span>
              </span>
              <span className="mt-auto inline-block pt-6 text-sm font-black text-[#9d6400] transition-transform group-hover:translate-x-1">阅读指南 →</span>
            </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
