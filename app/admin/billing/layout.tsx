import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { isAdminEmail } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/supabase/server-client";

export default async function AdminBillingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) {
    return <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-[#64717c]">此账号没有管理员权限。</div>;
  }
  return <AdminShell>{children}</AdminShell>;
}

