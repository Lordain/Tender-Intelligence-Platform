import Link from "next/link";
import { ImportSurinameForm } from "@/components/admin/ImportSurinameForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { SURINAME_TENDERS_PAGE } from "@/lib/ingestion/connectors/suriname-govsr-live";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Suriname is staged (lib/staged-countries.ts): imported daily, invisible to
 * visitors — the same tab as Guyana's (user, 2026-10-16: 苏里南做，先只在后台
 * 可见 → A), where the imported calls are reviewed before it opens.
 */
export default async function AdminImportTendersSurinamePage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === "Suriname");
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-[#eed18c] bg-[#fff8e7] px-5 py-4 text-sm leading-6 text-[#6d4c0d]">
        <p className="font-black">苏里南尚未对外公开</p>
        <p className="mt-1 text-xs leading-5">
          项目每天自动导入，只在后台可见：前台列表、详情页、首页、网站地图、搜索引擎推送和摘要邮件都不会出现。审核满意后，把苏里南从
          <code className="mx-1">lib/staged-countries.ts</code>移到公开国家名单即可上线。
        </p>
      </section>
      <ImportSourceSection
        name="gov.sr 招标栏目（Aanbestedingen）— 苏里南政府"
        hint="财政和计划部发布的英文招标公告；只保留国际招标的工程和设备采购"
        mode="auto"
        defaultOpen
        links={[{ href: SURINAME_TENDERS_PAGE }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            每天读取 gov.sr 招标栏目的全部公告（苏里南没有统一的电子采购平台）：写明<strong>国际竞争性招标（ICB）</strong>的工程和设备采购保留，公路、桥梁、管网、水厂、医院、电网等列为大型，其余为中型；
            国内招标（NCB）、没写明招标方式的、咨询意向征询，以及只采购书本、家具、文具、车辆的一律不导入。公告不公布金额。正文读不出截止日的不写入，会在手动导入的结果里列出来。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要（英语原文）。
          </p>
          <ImportSurinameForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有苏里南项目 —— 每日任务第一次运行后会出现在这里。</p>
            ) : (
              <ul className="divide-y divide-[#eef1f2]">
                {rows.map((row) => (
                  <li key={row.slug} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <span className="w-fit shrink-0 rounded-full bg-[#edf2f4] px-2 py-0.5 text-[11px] font-black text-[#233846]">{TIER_LABEL[row.relevanceTier ?? ""] ?? "—"}</span>
                    <Link href={`/admin/tenders/${row.slug}`} className="min-w-0 flex-1 text-sm font-bold text-[#071826] hover:text-[#b86e00]">
                      {row.title.zh || row.title.es}
                      {row.title.zh && row.title.zh !== row.title.es && <span className="block truncate text-xs font-normal text-[#7a878f]">{row.title.es}</span>}
                    </Link>
                    <span className="shrink-0 font-mono text-[11px] text-[#8a959c]">{row.tenderNumber}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ImportSourceSection>
    </div>
  );
}
