import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchTenderBySlugFromDb } from "@/lib/db/tenders";
import { AdminTenderForm } from "@/components/admin/AdminTenderForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default async function EditAdminTenderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tender = await fetchTenderBySlugFromDb(slug);

  if (!tender) notFound();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Edit record"
        title="编辑项目"
        description="更新项目资料、相关度分级和官方正式投标入口。"
        backHref="/admin/tenders"
        actions={
          <Link
            href={`/tenders/${tender.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd6da] bg-white px-4 text-sm font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
          >
            查看前台页面 <span aria-hidden="true">↗</span>
          </Link>
        }
      />
      <AdminTenderForm tender={tender} />
    </div>
  );
}
