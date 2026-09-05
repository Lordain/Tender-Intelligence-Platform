import { notFound } from "next/navigation";
import { fetchTenderBySlugFromDb } from "@/lib/db/tenders";
import { AdminTenderForm } from "@/components/admin/AdminTenderForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function EditAdminTenderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tender = await fetchTenderBySlugFromDb(slug);

  if (!tender) notFound();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader eyebrow="Edit record" title="编辑项目" description="更新项目资料、相关度分级和来源信息。" backHref="/admin/tenders" />
      <AdminTenderForm tender={tender} />
    </div>
  );
}
