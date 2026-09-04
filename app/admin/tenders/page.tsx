import Link from "next/link";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { fetchHomepageFeaturedCount } from "@/lib/db/site-settings";
import { AdminTenderList } from "@/components/admin/AdminTenderList";
import { HomepageSettingsPanel } from "@/components/admin/HomepageSettingsPanel";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function AdminTendersPage() {
  const [tenders, homepageFeaturedCount] = await Promise.all([
    fetchAdminTenderListFromDb(),
    fetchHomepageFeaturedCount(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Tender records"
        title="项目管理"
        description="集中管理全部招标项目，快速筛选、编辑并控制首页展示内容。"
        actions={
          <>
          <Link href="/admin/import-analysis" className="rounded-xl border border-[#d8e0e3] bg-white px-4 py-2.5 text-sm font-black text-[#52636e] transition-colors hover:border-[#ffb21c] hover:text-[#071826]">
            导入分析结果
          </Link>
          <Link
            href="/admin/tenders/new"
            className="rounded-xl bg-[#ffb21c] px-4 py-2.5 text-sm font-black text-[#071826] transition-colors hover:bg-[#ffc247]"
          >
            + 添加新项目
          </Link>
          </>
        }
      />

      <HomepageSettingsPanel initialCount={homepageFeaturedCount} />

      {tenders === null ? (
        <p className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-6 text-sm text-[#64717c]">Supabase 未配置。</p>
      ) : (
        <AdminTenderList tenders={tenders} />
      )}
    </div>
  );
}
