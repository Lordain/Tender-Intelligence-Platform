import Link from "next/link";
import { ImportEcuadorPasteForm } from "@/components/admin/ImportEcuadorPasteForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { ECUADOR, ECUADOR_SOCE_SEARCH_URL } from "@/lib/ingestion/ecuador-soce-paste";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Ecuador's tab, opened to visitors 2026-10-06 (user: 直接把这两个国家的前后台
 * 可视都做了吧). SOCE's search sits behind a CAPTCHA and SERCOP's open data shows
 * a call only after bids close (2026-10-06), so there is no daily job: the
 * admin pastes procedure pages here.
 */
export default async function AdminImportTendersEcuadorPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === ECUADOR);
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="SOCE 粘贴导入 — 厄瓜多尔政府采购系统"
        hint="在 SOCE 打开项目详情页，复制整页，粘贴导入"
        mode="manual"
        defaultOpen
        links={[{ label: "SOCE 搜索", href: ECUADOR_SOCE_SEARCH_URL }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            SOCE 的搜索页有验证码，平台不自动抓取；SERCOP 的公开数据要等交标截止后才公布项目，也没法用。所以厄瓜多尔没有每日自动任务，只能在这里手动导入。导入后在「通用维护 →
            更新项目文案」生成中文标题和摘要。
          </p>
          <ImportEcuadorPasteForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有厄瓜多尔项目。</p>
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
