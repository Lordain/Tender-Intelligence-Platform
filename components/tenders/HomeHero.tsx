"use client";

import Image from "next/image";
import { ALL_INDUSTRIES, type IndustryKey } from "@/lib/industry";
import { INDUSTRY_LABELS } from "@/lib/tender-labels";
import Link from "next/link";
import type { Tender } from "@/types/tender";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { CountryFlag } from "@/components/tenders/CountryFlag";
import { countryLabel } from "@/lib/tender-labels";
import { useUser } from "@/lib/auth";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 fill-none stroke-current stroke-2">
      <path d="M3 10h13M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Icon per industry, and the ONLY thing this file hardcodes about the
 * taxonomy — the labels come from INDUSTRY_LABELS and the order from
 * ALL_INDUSTRIES, so the rail cannot drift from the filter the way it did
 * on 2026-09-11 (it still listed 教育/税务/矿业 for several commits after
 * those categories were removed, and had to be hand-resynced).
 *
 * Typed as a total Record, deliberately: adding a category to
 * lib/industry.ts now fails to compile here until someone picks an icon
 * for it, which is the check that would have caught that drift.
 */
const INDUSTRY_ICONS: Record<IndustryKey, IndustryIconName> = {
  healthcare: "healthcare",
  energy_mining: "energy",
  power: "power",
  ict_telecom: "ict",
  transportation: "transport",
  construction: "construction",
  heavy_equipment: "heavy",
  water: "water",
  vehicles: "vehicles",
  general: "general",
};

const COVERED_INDUSTRIES = ALL_INDUSTRIES.map((key) => ({
  icon: INDUSTRY_ICONS[key],
  name: INDUSTRY_LABELS[key].zh,
  detail: INDUSTRY_LABELS[key].en,
}));

type IndustryIconName =
  | "healthcare"
  | "energy"
  | "power"
  | "ict"
  | "transport"
  | "construction"
  | "heavy"
  | "water"
  | "vehicles"
  | "general";

function IndustryIcon({ name }: { name: IndustryIconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8 shrink-0 fill-none stroke-current stroke-[1.5]" strokeLinecap="round" strokeLinejoin="round">
      {name === "healthcare" && <><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5z" /></>}
      {name === "energy" && <><path d="M13.5 2.5c.5 4-3.5 5-3.5 8.5 0 1.7 1 2.8 2 3.5-.2-2.8 2-3.5 3-5.5 2 1.8 3 4.1 3 6.5A6 6 0 1 1 6 15c0-3.2 2-6.1 7.5-12.5Z" /></>}
      {name === "power" && <><path d="m13 2-8 12h7l-1 8 8-12h-7z" /></>}
      {name === "ict" && <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="m7 7 4 9m6-9-4 9M7 6h10" /></>}
      {name === "transport" && <><rect x="5" y="3" width="14" height="15" rx="3" /><path d="M8 7h8M7 13h10M8 21l2-3m6 3-2-3" /><circle cx="8.5" cy="14.5" r=".5" fill="currentColor" /><circle cx="15.5" cy="14.5" r=".5" fill="currentColor" /></>}
      {name === "construction" && <><path d="M4 21 9.5 3h5L20 21M2 21h20" /><path d="M12 5.5v3m0 3v3m0 3V21" /></>}
      {name === "water" && <><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" /><path d="M9 16c.5 1.5 1.5 2 3 2" /></>}
      {name === "vehicles" && <><path d="m5 16-1-2 2-6h12l2 6-1 2M6 16h12v3H6zM8 12h8" /><circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" /></>}
      {name === "heavy" && <><path d="M3 18h12M5 18v-7h7l3 4v3M12 11l3-6h3l3 5-4 2" /><circle cx="7" cy="19" r="2" /><circle cx="13" cy="19" r="2" /></>}
      {name === "general" && <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}
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
              {COVERED_INDUSTRIES.map(({ icon, name, detail }) => (
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
          <h2 className="text-base font-bold">拉美招标中项目预览</h2>
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
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#53636e] xl:text-xs">
                  <CountryFlag country={tender.country} />{countryLabel(tender.country, locale)}
                </span>
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
  const { user } = useUser();

  return (
    <section className="relative isolate overflow-hidden bg-[#031521] text-white">
      <Image src="/lighthouse-hero.webp" alt="" fill preload sizes="100vw" className="-z-20 -translate-x-[16%] scale-[1.12] object-cover object-center opacity-90" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(3,21,33,.98)_0%,rgba(3,21,33,.86)_31%,rgba(3,21,33,.24)_50%,rgba(3,21,33,.5)_100%)]" />
      <div className="mx-auto grid min-h-[36rem] max-w-[94rem] items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:py-8 xl:gap-12">
        <div className="relative z-10 min-w-0 max-w-[40rem]">
          <h1 className="text-[clamp(2.55rem,4vw,4.25rem)] font-black leading-[1.14] tracking-[-0.05em] text-[#fffdf9]">
            把拉美招标<br />变成中国企业<br />看得懂的机会
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/78 sm:text-lg lg:max-w-[27rem] xl:max-w-xl">
            我们专注于为中国企业提供拉美市场的招标与采购信息汇集，持续整理和汇总当地公开招标信息，帮助中国企业更加高效地获取拉美市场的项目信息，了解当地采购需求，寻找潜在合作机会
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/tenders" className="inline-flex items-center justify-center gap-4 rounded-2xl bg-[#ffb21c] px-7 py-3.5 text-sm font-bold text-[#071826] transition-transform hover:-translate-y-0.5 hover:bg-[#ffc247]">
              浏览招标 <ArrowIcon />
            </Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-4 rounded-2xl border border-white/70 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-[#061b2b]">
              我们提供的价值 <ArrowIcon />
            </a>
            {user && (
              <Link href="/account#notification-preferences" className="inline-flex items-center justify-center gap-3 rounded-2xl border border-[#ffb21c]/75 bg-[#031521]/35 px-7 py-3.5 text-sm font-bold text-[#ffcf68] transition-colors hover:bg-[#ffb21c] hover:text-[#071826]">
                设置邮件通知 <ArrowIcon />
              </Link>
            )}
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
