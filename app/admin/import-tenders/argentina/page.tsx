import Link from "next/link";
import { ImportArgentinaForm } from "@/components/admin/ImportArgentinaForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { ADIF_PORTAL_URL } from "@/lib/ingestion/connectors/adif-live";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Argentina: imported daily from four sources. Staged from 2026-09-27 and
 * opened to visitors 2026-09-29 (前台+后台开放阿根廷).
 */
export default async function AdminImportTendersArgentinaPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === "Argentina");
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="COMPR.AR · CONTRAT.AR · ADIF · 政府公报"
        hint="阿根廷全国采购平台、全国工程平台、国家铁路基础设施公司、政府公报第三部分"
        mode="auto"
        defaultOpen
        links={[
          { href: "https://comprar.gob.ar/" },
          { href: "https://contratar.gob.ar/" },
          { href: ADIF_PORTAL_URL },
          { href: "https://www.boletinoficial.gob.ar/seccion/tercera" },
        ]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            筛选规则与其他国家相同（100 万美元门槛）。两处阿根廷设置：没有公布金额的项目按墨西哥的办法处理；
            <strong>能源、铁路、电力、交通、水务、信息通信</strong>行业不看金额。日常服务、维护、咨询、直接授标仍然排除。
            政府公报只导入不在前三个平台上的国企和省级项目。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要。
          </p>
          <ImportArgentinaForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有阿根廷项目 —— 每日任务第一次运行后会出现在这里。</p>
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
