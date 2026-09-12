import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { AdminShell } from "@/components/admin/AdminShell";
import { ImportTendersTabs } from "@/components/admin/ImportTendersTabs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

// Same real admin gate as app/admin/tenders/layout.tsx — this page writes
// new tenders to Supabase, so it needs the strict allowlist check. Also the
// shared shell for every /admin/import-tenders/* tab: the header and the tab
// nav, and nothing else.
//
// The cross-country maintenance actions (translate, reclassify, 保留原因分析)
// used to render here, below {children}, which put three panels of "not
// today's job" under every country tab. They are their own tab now
// (./maintenance/page.tsx) — the user's call, 2026-09-11.
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
      </div>
    </AdminShell>
  );
}
