import Link from "next/link";
import { ImportUruguayForm } from "@/components/admin/ImportUruguayForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { ARCE_BASE } from "@/lib/ingestion/connectors/uruguay-arce-live";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Uruguay is staged (lib/staged-countries.ts): imported daily, invisible to
 * visitors. This tab is where the user reviews what came in before deciding
 * to open it (user, 2026-10-13: 后台增加). Same layout as the 圭亚那 tab.
 */
export default async function AdminImportTendersUruguayPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === "Uruguay");
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-[#eed18c] bg-[#fff8e7] px-5 py-4 text-sm leading-6 text-[#6d4c0d]">
        <p className="font-black">乌拉圭尚未对外公开</p>
        <p className="mt-1 text-xs leading-5">
          项目每天自动导入，只在后台可见：前台列表、详情页、首页、网站地图、搜索引擎推送和摘要邮件都不会出现。审核满意后，把乌拉圭从
          <code className="mx-1">lib/staged-countries.ts</code>移到公开国家名单即可上线。
        </p>
      </section>
      <ImportSourceSection
        name="comprasestatales.gub.uy — 乌拉圭国家采购监管署（ARCE）"
        hint="全部公开招标，以及 UTE、ANCAP、OSE、ANP、AFE、交通部的简易招标；乌拉圭不公布预算，没有金额的最多算中型"
        mode="auto"
        defaultOpen
        links={[{ href: `${ARCE_BASE}/consultas/` }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            每天读取 ARCE 开放数据（OCDS）里最近 3 天新发布的招标：<strong>公开招标（Licitación Pública）</strong>全部读取，<strong>简易招标（Licitación Abreviada）</strong>只读 UTE、ANCAP、OSE、ANP、AFE 和交通部（MTOP）的；
            直接采购、比价等小额程序不读。读到的项目按平台通用筛选规则判断，仍在投标期内且未被排除的才写入。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要（西班牙语原文）。
          </p>
          <ImportUruguayForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有乌拉圭项目 —— 每日任务第一次运行后会出现在这里。</p>
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
