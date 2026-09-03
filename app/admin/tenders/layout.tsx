import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin-auth";
import { getCurrentUser } from "@/lib/supabase/server-client";

// Real admin gate (see lib/admin-auth.ts) for every /admin/tenders/* route
// and the API routes under app/api/admin/tenders/ — write access, so a
// stricter check than DocumentsNeededView.tsx's "any logged-in user"
// pattern used for its read-only worklist.
export default async function AdminTendersLayout({ children }: { children: React.ReactNode }) {
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

  return <div className="min-h-screen">{children}</div>;
}
