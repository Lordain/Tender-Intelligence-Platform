import Link from "next/link";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { fetchHomepageFeaturedCount } from "@/lib/db/site-settings";
import { AdminTenderList } from "@/components/admin/AdminTenderList";
import { HomepageSettingsPanel } from "@/components/admin/HomepageSettingsPanel";

export default async function AdminTendersPage() {
  const [tenders, homepageFeaturedCount] = await Promise.all([
    fetchAdminTenderListFromDb(),
    fetchHomepageFeaturedCount(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 lg:py-12">
      <div className="flex items-center justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Tender records</p><h1 className="mt-2 text-3xl font-black tracking-tight text-[#071826]">项目管理</h1></div>
        <div className="flex items-center gap-3">
          <Link href="/admin/import-analysis" className="text-sm font-medium text-[#64717c] hover:text-[#071826]">
            导入分析结果
          </Link>
          <Link
            href="/admin/tenders/new"
            className="rounded-xl bg-[#ffb21c] px-4 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247]"
          >
            + 添加新项目
          </Link>
        </div>
      </div>

      <HomepageSettingsPanel initialCount={homepageFeaturedCount} />

      {tenders === null ? (
        <p className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6 text-sm text-[#64717c]">Supabase 未配置。</p>
      ) : (
        <AdminTenderList tenders={tenders} />
      )}
    </div>
  );
}
