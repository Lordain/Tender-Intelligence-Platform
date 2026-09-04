import { AdminTenderForm } from "@/components/admin/AdminTenderForm";

export default function NewAdminTenderPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8 lg:py-12">
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">New record</p><h1 className="mt-2 text-3xl font-black tracking-tight text-[#071826]">添加新项目</h1></div>
      <AdminTenderForm />
    </div>
  );
}
