import { notFound } from "next/navigation";
import { fetchTenderBySlugFromDb } from "@/lib/db/tenders";
import { AdminTenderForm } from "@/components/admin/AdminTenderForm";

export default async function EditAdminTenderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tender = await fetchTenderBySlugFromDb(slug);

  if (!tender) notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8 lg:py-12">
      <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Edit record</p><h1 className="mt-2 text-3xl font-black tracking-tight text-[#071826]">编辑项目</h1></div>
      <AdminTenderForm tender={tender} />
    </div>
  );
}
