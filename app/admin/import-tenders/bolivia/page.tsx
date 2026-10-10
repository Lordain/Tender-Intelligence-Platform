import Link from "next/link";
import { ImportBoliviaPasteForm } from "@/components/admin/ImportBoliviaPasteForm";
import { ScreenBoliviaListForm } from "@/components/admin/ScreenBoliviaListForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { BOLIVIA, BOLIVIA_SICOES_SEARCH_URL } from "@/lib/ingestion/bolivia-sicoes-paste";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Bolivia's tab (user, 2026-10-09: 请同步开始评估+做玻利维亚的接入; opened to
 * visitors 2026-10-10: 前台+后台+全站文字都开通Bolivia). SICOES sits behind
 * Cloudflare Turnstile and an image CAPTCHA, so there is no daily job: the
 * admin pastes Ficha pages here.
 */
export default async function AdminImportTendersBoliviaPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === BOLIVIA);
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="SICOES 粘贴导入 — 玻利维亚政府采购系统"
        hint="先贴搜索列表初筛，再把值得的项目「Ver Ficha」整页粘贴导入"
        mode="manual"
        defaultOpen
        links={[{ label: "SICOES", href: BOLIVIA_SICOES_SEARCH_URL }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            SICOES 有人机验证和验证码，平台不自动抓取，所以玻利维亚没有每日自动任务，只能在这里手动导入。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要。
          </p>
          <ScreenBoliviaListForm />
          <ImportBoliviaPasteForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有玻利维亚项目。</p>
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
