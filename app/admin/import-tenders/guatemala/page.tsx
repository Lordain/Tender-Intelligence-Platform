import Link from "next/link";
import { ImportGuatemalaPasteForm } from "@/components/admin/ImportGuatemalaPasteForm";
import { ScreenGuatemalaListForm } from "@/components/admin/ScreenGuatemalaListForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { GUATECOMPRAS_VIGENTES_URL } from "@/lib/ingestion/guatemala-paste-result";

const TIER_LABEL: Record<string, string> = { flagship: "大型", significant: "中型", standard: "常规", excluded: "排除" };

/**
 * Guatemala is staged (lib/staged-countries.ts): imported by hand, invisible
 * to visitors — the same tab as Guyana's and Suriname's (user, 2026-10-16:
 * A — 两步粘贴导入), where the imported calls are reviewed before it opens.
 */
export default async function AdminImportTendersGuatemalaPage() {
  const rows = ((await fetchAdminTenderListFromDb().catch(() => null)) ?? []).filter((row) => row.country === "Guatemala");
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-2xl border border-[#eed18c] bg-[#fff8e7] px-5 py-4 text-sm leading-6 text-[#6d4c0d]">
        <p className="font-black">危地马拉尚未对外公开</p>
        <p className="mt-1 text-xs leading-5">
          项目只在后台可见：前台列表、详情页、首页、网站地图、搜索引擎推送和摘要邮件都不会出现。审核满意后，把危地马拉从
          <code className="mx-1">lib/staged-countries.ts</code>移到公开国家名单即可上线。
        </p>
      </section>
      <ImportSourceSection
        name="Guatecompras 粘贴导入 — 危地马拉财政部政府采购系统"
        hint="先贴列表初筛，再把值得的项目详情页整页粘贴导入；只收中央部委、国有企业和自治机构的公开招标"
        mode="manual"
        defaultOpen
        links={[{ label: "Guatecompras", href: GUATECOMPRAS_VIGENTES_URL }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            Guatecompras 对平台服务器启用了真人验证，不能自动读取，每天在这里手动粘贴导入。只读<strong>公开招标（Licitación Pública）</strong>和国际协定项下的采购；地方政府（市政府等）的项目不收——2026 年 1–9 月的定标数据里，地方政府的公开招标只有 6% 达到 100 万美元，中央单位为 25%。
            Guatecompras 不公布预算金额，没有金额的项目最高列为常规。导入后在「通用维护 → 更新项目文案」生成中文标题和摘要（西班牙语原文）。
          </p>
          <ScreenGuatemalaListForm />
          <ImportGuatemalaPasteForm />
          <div className="rounded-xl border border-[#e1e7e9] bg-white">
            <p className="border-b border-[#eef1f2] px-4 py-2 text-xs font-black text-[#52636e]">已导入 {rows.length} 条</p>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#7a878f]">还没有危地马拉项目 —— 第一次粘贴导入后会出现在这里。</p>
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
