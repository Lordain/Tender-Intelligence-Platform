"use client";

import Image from "next/image";
import Link from "next/link";
import type { Tender } from "@/types/tender";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { MexicoFlag } from "@/components/tenders/CountryFlag";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-none stroke-current stroke-2">
      <path d="M3 10h13M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const GOVERNMENT_UNITS = [
  ["SEDENA", "国防部"],
  ["MARINA", "海军部"],
  ["IMSS BIENESTAR", "公共卫生服务"],
  ["SICT", "基础设施与交通部"],
  ["CONAGUA", "国家水务委员会"],
  ["IPN", "国家理工学院"],
  ["INDAABIN", "国家资产管理局"],
  ["CULTURA", "文化部"],
  ["SEDATU", "土地与城市发展部"],
] as const;

function GovernmentLogoRail() {
  return (
    <div className="border-t border-white/8 bg-[#020f18]/58 py-5">
      <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-white/38">持续追踪的政府采购单位</p>
      <div className="government-logo-mask overflow-hidden">
        <div className="government-logo-scroll flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center gap-12 pr-12 sm:gap-16 sm:pr-16">
              {GOVERNMENT_UNITS.map(([name, detail]) => (
                <div key={`${copy}-${name}`} className="flex min-w-max items-center gap-3 text-white/42">
                  <span className="grid size-8 place-items-center rounded-full border border-current text-[8px] font-black tracking-[-0.06em]">{name.slice(0, 3)}</span>
                  <span>
                    <strong className="block font-serif text-base font-bold tracking-wide text-white/58">{name}</strong>
                    <small className="block text-[9px] tracking-[0.08em] text-white/30">{detail}</small>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TenderPreview({ tenders }: { tenders: Tender[] }) {
  const { locale } = useLocale();
  const rows = [...tenders, ...tenders];

  return (
    <div className="relative ml-auto w-full max-w-[39rem] xl:max-w-[42rem]">
      <div className="hero-product-edge relative h-[31rem] overflow-hidden rounded-r-[1.6rem] rounded-l-[2.5rem] text-[#071826] shadow-[0_18px_46px_-38px_rgba(0,0,0,0.62)] xl:h-[33rem]">
        <div className="relative z-10 border-b border-[#dbe2e5]/75 bg-transparent pb-3 pl-14 pr-6 pt-4 xl:pl-20 xl:pr-8">
          <p className="text-base font-bold">招标情报</p>
          <div className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)_6.75rem] gap-4 text-[10px] font-semibold text-[#7a8790] xl:grid-cols-[6rem_minmax(0,1fr)_7.5rem] xl:text-xs">
            <span>国家</span>
            <span>中文项目名称</span>
            <span className="text-right">计划交标时间</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-[5.45rem] overflow-hidden bg-transparent xl:top-[5.7rem]">
          <div className="hero-tender-scroll divide-y divide-[#e3e8ea] pl-14 pr-6 xl:pl-20 xl:pr-8">
            {rows.map((tender, index) => (
              <div key={`${tender.id}-${index}`} className="grid min-h-[5rem] grid-cols-[5.5rem_minmax(0,1fr)_6.75rem] items-center gap-4 py-3 xl:grid-cols-[6rem_minmax(0,1fr)_7.5rem]">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#53636e] xl:text-xs"><MexicoFlag />墨西哥</span>
                <p className="line-clamp-2 text-xs font-bold leading-5 text-black xl:text-sm">{tender.title.zh || tender.title.es}</p>
                <p className="text-right text-[10px] font-bold text-[#071826] xl:text-xs">
                  {tender.submissionDeadline ? formatDate(tender.submissionDeadline, locale) : "待公布"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeHero({ tenders }: { tenders: Tender[] }) {
  return (
    <section className="relative isolate overflow-hidden bg-[#031521] text-white">
      <Image src="/lighthouse-hero.png" alt="" fill preload sizes="100vw" className="-z-20 -translate-x-[16%] scale-[1.12] object-cover object-center opacity-90" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(3,21,33,.98)_0%,rgba(3,21,33,.86)_31%,rgba(3,21,33,.24)_50%,rgba(3,21,33,.5)_100%)]" />
      <div className="mx-auto grid min-h-[36rem] max-w-[94rem] items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:py-8 xl:gap-12">
        <div className="relative z-10 min-w-0 max-w-[40rem]">
          <h1 className="text-[clamp(2.55rem,4vw,4.25rem)] font-black leading-[1.06] tracking-[-0.05em] text-[#fffdf9]">
            把拉美招标<br />变成中国企业<br />看得懂的机会
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/78 sm:text-lg lg:max-w-[27rem] xl:max-w-xl">
            把政府招标信息转化为结构化中文情报，帮助中国企业更快判断能不能投、该不该投。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/tenders" className="inline-flex items-center justify-center gap-4 rounded-2xl bg-[#ffb21c] px-7 py-3.5 text-sm font-bold text-[#071826] transition-transform hover:-translate-y-0.5 hover:bg-[#ffc247]">
              浏览招标 <ArrowIcon />
            </Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-4 rounded-2xl border border-white/70 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-[#061b2b]">
              我们如何分析 <ArrowIcon />
            </a>
          </div>
        </div>
        <div className="relative z-10 hidden min-w-0 lg:block xl:translate-x-4">
          <TenderPreview tenders={tenders} />
        </div>
      </div>
      <GovernmentLogoRail />
    </section>
  );
}
