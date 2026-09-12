import type { Metadata } from "next";
import Link from "next/link";
import { guideCountries, participationGuides } from "@/lib/participation-guides";

export const metadata: Metadata = {
  title: "参标指南",
  description: "面向中国企业的拉美政府采购参标指南，免费了解各官方平台的参与流程、常见资料与注意事项。",
};

export default function GuidesPage() {
  return (
    <div className="bg-[#f7f4ee] text-[#071826]">
      <header className="bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-[94rem]">
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

      <main className="mx-auto max-w-[94rem] px-5 py-12 sm:px-8 sm:py-16">
        <div className="rounded-2xl border border-[#e6b13f] bg-[#fff3cf] p-5 sm:p-6">
          <p className="font-black text-[#6d4900]">使用前请注意</p>
          <p className="mt-2 text-sm leading-7 text-[#6d5a31]">指南提供通用准备框架，不构成资格保证或法律意见。参与范围、文件格式、截止日期及提交方式，始终以具体项目的官方公告、招标文件、附件与最新澄清为准。</p>
        </div>

        {guideCountries.map((country) => {
          const guides = participationGuides.filter((guide) => guide.countryCode === country.code);
          return (
            <section key={country.code} className="mt-14">
              <div className="flex flex-col gap-3 border-b border-[#dbe2e5] pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">{country.code}</p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.03em]">{country.name}</h2>
                </div>
                <p className="text-sm text-[#64717c]">{country.description}</p>
              </div>

              <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {guides.map((guide, index) => (
                  <Link
                    key={guide.slug}
                    href={`/guides/${guide.slug}`}
                    className="group flex min-h-72 flex-col rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6 transition hover:-translate-y-1 hover:border-[#d29a28] hover:shadow-[0_18px_45px_rgba(7,24,38,0.09)] sm:p-7"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="rounded-full bg-[#fff0c9] px-3 py-1 text-xs font-black text-[#8f5b00]">{guide.country}</span>
                      <span className="font-mono text-sm font-black text-[#b5bec3]">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <p className="mt-7 text-xs font-black uppercase tracking-[0.16em] text-[#b86e00]">{guide.platform}</p>
                    <h3 className="mt-3 text-xl font-black leading-8 tracking-[-0.02em]">{guide.title}</h3>
                    <p className="mt-4 text-sm leading-7 text-[#64717c]">{guide.summary}</p>
                    <div className="mt-auto flex justify-end pt-8">
                      <span className="font-black text-[#b86e00] transition-transform group-hover:translate-x-1">查看指南 →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <section className="mt-16 rounded-3xl bg-[#061b2b] px-6 py-10 text-white sm:px-10 sm:py-12">
          <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#ffb21c]">持续扩充</p>
              <h2 className="mt-3 text-2xl font-black sm:text-3xl">更多国家与采购平台将陆续加入</h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">随着平台覆盖范围扩大，我们会继续增加各国注册入口、参与流程、常见材料及境外企业需要特别核对的事项。</p>
            </div>
            <Link href="/tenders" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#ffb21c] px-6 font-black text-[#071826] transition hover:bg-[#ffc34d]">浏览招标项目</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
