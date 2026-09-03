import { notFound } from "next/navigation";
import { fetchTenderBySlugFromDb } from "@/lib/db/tenders";
import { AdminTenderForm } from "@/components/admin/AdminTenderForm";

export default async function EditAdminTenderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tender = await fetchTenderBySlugFromDb(slug);

  if (!tender) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">编辑项目</h1>
      <AdminTenderForm tender={tender} />
    </div>
  );
}
