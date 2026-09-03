import { AdminTenderForm } from "@/components/admin/AdminTenderForm";

export default function NewAdminTenderPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">添加新项目</h1>
      <AdminTenderForm />
    </div>
  );
}
