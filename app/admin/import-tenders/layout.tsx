import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { AdminShell } from "@/components/admin/AdminShell";
import { ImportTendersTabs } from "@/components/admin/ImportTendersTabs";
import { TranslateTendersButton } from "@/components/admin/TranslateTendersButton";
import { ReclassifyButton } from "@/components/admin/ReclassifyButton";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

// Same real admin gate as app/admin/tenders/layout.tsx — this page writes
// new tenders to Supabase, so it needs the strict allowlist check. Also
// now the shared shell for every /admin/import-tenders/<country> page —
// the tab nav (ImportTendersTabs) plus two maintenance actions that
// operate across ALL countries at once (translate, reclassify), so they
// live here rather than duplicated on every per-country tab.
export default async function AdminImportTendersLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!isAdminEmail(user.email)) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">无权限</h1>
        <p className="text-sm text-zinc-500">
          此账号（{user.email}）没有管理员权限。如需访问，请让管理员把此邮箱加入 ADMIN_EMAILS。
        </p>
      </div>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
        <AdminPageHeader eyebrow="New tenders" title="新项目清单" description="按国家导入最新政府采购项目，并在正式写入前预览数据。" backHref="/admin/tenders" />

        <ImportTendersTabs />

        {children}

        <div className="flex flex-col gap-6 border-t border-[#dbe2e5] pt-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">All countries</p>
            <h2 className="mt-1 text-lg font-black text-[#071826]">通用维护</h2>
            <p className="mt-1 text-sm text-[#52636e]">这两个操作对所有国家的标书统一生效，不区分当前选中的标签页。</p>
          </div>
          <TranslateTendersButton />
          <ReclassifyButton />
        </div>
      </div>
    </AdminShell>
  );
}
