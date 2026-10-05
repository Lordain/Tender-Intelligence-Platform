import Link from "next/link";
import { ImportDominicanaForm } from "@/components/admin/ImportDominicanaForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * The Dominican Republic's tab: the manual import and what came in. Staged
 * on 2026-10-04 and opened to visitors the same day (user: 公开多米尼加).
 */
export default async function AdminImportTendersDominicanaPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === "Dominican Republic");
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="DGCP — 多米尼加政府采购开放数据"
        hint="Portal Transaccional 的官方接口；只读公开招标（国内、国际、简易公开招标）和全国紧急状态例外程序（PEEN）"
        mode="auto"
        defaultOpen
        links={[{ href: "https://comunidad.comprasdominicana.gob.do/" }, { href: "https://datosabiertos.dgcp.gob.do/" }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            每天读取最近 3 天发布的全部采购程序（每月约 7,000 条），其中<strong>公开招标</strong>每月约 100 条，<strong>全国紧急状态例外程序</strong>（编号带 PEEN，公开征集、外国企业可投）不定期出现；低于门槛的采购、小额合同、比价、逆向拍卖和其他例外程序不读。
            两类都按平台通用规则判断，只写入仍在投标期且被保留的项目，并附上招标文件和附件的下载链接。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要（西语原文）。
          </p>
          <ImportDominicanaForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有多米尼加项目 —— 每日任务第一次运行或手动导入后会出现在这里。</p>
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
