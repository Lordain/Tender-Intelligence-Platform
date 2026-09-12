import { notFound, redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Same real admin gate as the other admin sections, plus the local-only
 * check the page and its API route already carry — repeated here so the
 * 404 happens before any admin chrome renders, not inside it.
 */
export default async function AdminLocalBatchLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();

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

  return <AdminShell>{children}</AdminShell>;
}
