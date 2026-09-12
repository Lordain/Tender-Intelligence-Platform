import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/supabase/server-client";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminHomepageLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!isAdminEmail(user.email)) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-zinc-900">无权限</h1>
        <p className="text-sm text-zinc-500">此账号（{user.email}）没有管理员权限。</p>
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
