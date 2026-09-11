import Link from "next/link";
import { participationGuides } from "@/lib/participation-guides";

export function ParticipationGuidesPreview() {
  return (
    <section className="bg-[#f7f4ee] px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[94rem]">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Bid guides</p>
            <h2 className="mt-3 text-3xl font-black leading-[1.18] tracking-[-0.04em] text-[#071826] sm:text-4xl">第一次参与拉美政府采购？<br className="hidden sm:block" />先从参标指南开始</h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-2xl text-sm leading-7 text-[#64717c]">免费了解各平台的注册路径、参与步骤、常见资料和境外企业需要重点核对的事项。</p>
            <Link href="/guides" className="mt-5 inline-flex font-black text-[#9d6400] transition hover:text-[#714800]">查看全部参标指南 →</Link>
          </div>
        </div>

        {/*
          Every cell draws its own top and left hairline and pulls back a pixel,
          so adjacent borders collapse into one and the panel's own border is
          never doubled. The point is that this holds for ANY number of guides:
          the previous version hard-coded five columns and hand-placed the
          dividers by index, which came apart the moment Peru added a sixth and
          seventh card.
        */}
        <div className="mt-9 grid overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] md:grid-cols-2 xl:grid-cols-4">
          {participationGuides.map((guide) => (
            <Link key={guide.slug} href={`/guides/${guide.slug}`} className="group -ml-px -mt-px border-l border-t border-[#dbe2e5] p-6 transition hover:bg-[#fff4d8]">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#b86e00]">{guide.country}</span>
              <h3 className="mt-3 text-lg font-black leading-7 text-[#071826]">{guide.platform}</h3>
              <p className="mt-3 text-sm leading-6 text-[#64717c]">{guide.summary}</p>
              <span className="mt-6 inline-block text-sm font-black text-[#9d6400] transition-transform group-hover:translate-x-1">阅读 →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
