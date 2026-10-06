import Link from "next/link";
import { ImportPanamaForm } from "@/components/admin/ImportPanamaForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { PANAMACOMPRA_SITE } from "@/lib/ingestion/connectors/panama-panamacompra-live";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Panama is staged (lib/staged-countries.ts): imported daily, invisible to
 * visitors. This tab is where the user reviews what came in before deciding
 * to open it, and pulls the last few days in early (2026-10-06).
 */
export default async function AdminImportTendersPanamaPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === "Panama");
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-[#eed18c] bg-[#fff8e7] px-5 py-4 text-sm leading-6 text-[#6d4c0d]">
        <p className="font-black">巴拿马尚未对外公开</p>
        <p className="mt-1 text-xs leading-5">
          项目每天自动导入，只在后台可见：前台列表、详情页、首页、网站地图、搜索引擎推送和摘要邮件都不会出现。审核满意后，把巴拿马从
          <code className="mx-1">lib/staged-countries.ts</code>移到公开国家名单即可上线。
        </p>
      </section>
      <ImportSourceSection
        name="PanamaCompra — 巴拿马政府采购系统"
        hint="公开招标、最优价值招标、多边银行贷款项目等正式招标；按平台通用规则筛选"
        mode="auto"
        defaultOpen
        links={[{ href: `${PANAMACOMPRA_SITE}/Inicio/#/busqueda-avanzada` }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            每日任务读取最近 3 天有状态变化的正式招标（第一次运行时回溯 30 天），逐条读取在招项目的招标文件页拿预算和交标截止日，按平台通用规则保留；网上询价、小额采购、直接采购和例外程序不读。
            已入库的项目开标、中标或取消后，状态会自动同步。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要。
          </p>
          <ImportPanamaForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有巴拿马项目 —— 每日任务第一次运行或手动导入后会出现在这里。</p>
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
