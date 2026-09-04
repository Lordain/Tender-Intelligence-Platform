import Link from "next/link";
import { fetchAdminTenderListFromDb } from "@/lib/db/tenders";
import { AdminTenderList } from "@/components/admin/AdminTenderList";

export default async function AdminTendersPage() {
  const tenders = await fetchAdminTenderListFromDb();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">项目管理</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/import-analysis" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
            导入分析结果
          </Link>
          <Link
            href="/admin/tenders/new"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + 添加新项目
          </Link>
        </div>
      </div>

      {tenders === null ? (
        <p className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800">Supabase 未配置。</p>
      ) : (
        <AdminTenderList tenders={tenders} />
      )}
    </div>
  );
}
