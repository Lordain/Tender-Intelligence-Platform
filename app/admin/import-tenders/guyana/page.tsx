import Link from "next/link";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { GUYANA_EPROCURE_LIST_URL } from "@/lib/ingestion/connectors/guyana-eprocure-live";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Guyana is staged (lib/staged-countries.ts): imported daily, invisible to
 * visitors. This tab is where the user reviews what came in before deciding
 * to open it (2026-09-27). No import button: reading the notices needs
 * pdftotext, which the daily GitHub job installs and the web host lacks.
 */
export default async function AdminImportTendersGuyanaPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === "Guyana");
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-[#eed18c] bg-[#fff8e7] px-5 py-4 text-sm leading-6 text-[#6d4c0d]">
        <p className="font-black">圭亚那尚未对外公开</p>
        <p className="mt-1 text-xs leading-5">
          项目每天自动导入，只在后台可见：前台列表、详情页、首页、网站地图、搜索引擎推送和摘要邮件都不会出现。审核满意后，把圭亚那从
          <code className="mx-1">lib/staged-countries.ts</code>移到公开国家名单即可上线。
        </p>
      </section>
      <ImportSourceSection
        name="eprocure.gov.gy — 圭亚那政府集中采购"
        hint="国家采购与招标管理委员会（NPTAB）；只保留国际招标和大额项目"
        mode="auto"
        defaultOpen
        links={[{ href: GUYANA_EPROCURE_LIST_URL }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            每天读取全部在招项目，并逐份读取招标公告 PDF：写明<strong>国际竞争性招标（ICB）</strong>的工程和设备采购保留，公路、桥梁、管网、水厂、医院、电网等列为大型；
            国内招标（NCB）和询价只有标题里的工程师估价达到 100 万美元才保留；服务、咨询和日常用品一律不导入。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要（英语原文）。
          </p>
          <p className="text-xs text-[#64717c]">
            想提前跑：在自己电脑的项目目录里运行 <code>npm run cron:guyana</code>（试运行）或 <code>npm run cron:guyana -- --write</code>（需要装 poppler）。
          </p>
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有圭亚那项目 —— 每日任务第一次运行后会出现在这里。</p>
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
