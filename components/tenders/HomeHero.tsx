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

const COVERED_INDUSTRIES = [
  ["education", "教育", "Education"],
  ["healthcare", "医疗", "Healthcare"],
  ["tax", "税务", "Tax & customs"],
  ["energy", "能源", "Energy"],
  ["power", "电力", "Power"],
  ["ict", "ICT", "ICT & telecom"],
  ["transport", "交通", "Transportation"],
  ["construction", "基建", "Construction"],
  ["mining", "矿业", "Mining"],
  ["water", "水务", "Water"],
  ["vehicles", "车辆", "Vehicles"],
  ["heavy", "重设", "Heavy equipment"],
] as const;

type IndustryIconName = (typeof COVERED_INDUSTRIES)[number][0];

function IndustryIcon({ name }: { name: IndustryIconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8 shrink-0 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round">
      {name === "education" && <><path d="M3 5.5c3-1 6-.4 9 1.5v12c-3-1.9-6-2.5-9-1.5z" /><path d="M21 5.5c-3-1-6-.4-9 1.5v12c3-1.9 6-2.5 9-1.5z" /></>}
      {name === "healthcare" && <><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z" /></>}
      {name === "tax" && <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2" /></>}
      {name === "energy" && <><path d="M13.5 2.5c.5 4-3.5 5-3.5 8.5 0 1.7 1 2.8 2 3.5-.2-2.8 2-3.5 3-5.5 2 1.8 3 4.1 3 6.5A6 6 0 1 1 6 15c0-3.2 2-6.1 7.5-12.5Z" /></>}
      {name === "power" && <><path d="m13 2-8 12h7l-1 8 8-12h-7z" /></>}
      {name === "ict" && <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7 7 4 9m6-9-4 9M7 6h10" /></>}
      {name === "transport" && <><rect x="5" y="3" width="14" height="15" rx="3" /><path d="M8 7h8M7 13h10M8 21l2-3m6 3-2-3" /><circle cx="8.5" cy="14.5" r=".5" fill="currentColor" /><circle cx="15.5" cy="14.5" r=".5" fill="currentColor" /></>}
      {name === "construction" && <><path d="M4 21 9.5 3h5L20 21M2 21h20" /><path d="M12 5.5v3m0 3v3m0 3V21" /></>}
      {name === "mining" && <><path d="m5 20 8-8m-5-5 9 9M8 7l3-3m6 12 3-3M3 7c5-4 11-4 16 0" /></>}
      {name === "water" && <><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" /><path d="M9 16c.5 1.5 1.5 2 3 2" /></>}
      {name === "vehicles" && <><path d="m5 16-1-2 2-6h12l2 6-1 2M6 16h12v3H6zM8 12h8" /><circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" /></>}
      {name === "heavy" && <><path d="M3 18h12M5 18v-7h7l3 4v3M12 11l3-6h3l3 5-4 2" /><circle cx="7" cy="19" r="2" /><circle cx="13" cy="19" r="2" /></>}
    </svg>
  );
}

function IndustryLogoRail() {
  return (
    <div className="border-t border-white/8 bg-[#020f18]/58 py-5">
      <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-white/38">我们覆盖的行业</p>
      <div className="industry-logo-mask overflow-hidden">
        <div className="industry-logo-scroll flex w-max">
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center gap-12 pr-12 sm:gap-16 sm:pr-16">
              {COVERED_INDUSTRIES.map(([icon, name, detail]) => (
                <div key={`${copy}-${name}`} className="flex min-w-max items-center gap-3 text-white/42">
                  <IndustryIcon name={icon} />
                  <span>
                    <strong className="block text-sm font-bold tracking-wide text-white/58">{name}</strong>
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
  const rows = Array.from({ length: 4 }, () => tenders).flat();

  return (
    <div className="relative ml-auto w-full max-w-[39rem] xl:max-w-[42rem]">
      <div className="hero-product-edge relative h-[31rem] overflow-hidden rounded-r-[1.6rem] rounded-l-[2.5rem] text-[#071826] shadow-[0_18px_46px_-38px_rgba(0,0,0,0.62)] xl:h-[33rem]">
        <div className="relative z-10 border-b border-[#dbe2e5]/75 bg-transparent pb-3 pl-14 pr-6 pt-4 xl:pl-20 xl:pr-8">
          <p className="text-base font-bold">拉美招投标平台</p>
          <div className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)_6.75rem] gap-4 text-[10px] font-semibold text-[#7a8790] xl:grid-cols-[6rem_minmax(0,1fr)_7.5rem] xl:text-xs">
            <span>国家</span>
            <span>中文项目名称</span>
            <span className="text-right">计划交标时间</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-[5.45rem] overflow-hidden bg-transparent xl:top-[5.7rem]">
          <div className="hero-tender-scroll divide-y divide-[#e3e8ea] pl-14 pr-6 xl:pl-20 xl:pr-8">
            {rows.map((tender, index) => (
              <div
                key={`${tender.id}-${index}`}
                aria-hidden={index >= tenders.length}
                className="grid min-h-[5rem] grid-cols-[5.5rem_minmax(0,1fr)_6.75rem] items-center gap-4 py-3 xl:grid-cols-[6rem_minmax(0,1fr)_7.5rem]"
              >
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
          <h1 className="text-[clamp(2.55rem,4vw,4.25rem)] font-black leading-[1.14] tracking-[-0.05em] text-[#fffdf9]">
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
              我们提供的价值 <ArrowIcon />
            </a>
          </div>
        </div>
        <div className="relative z-10 hidden min-w-0 lg:block xl:translate-x-4">
          <TenderPreview tenders={tenders} />
        </div>
      </div>
      <IndustryLogoRail />
    </section>
  );
}
