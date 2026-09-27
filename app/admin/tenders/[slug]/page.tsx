import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchTenderBySlugFromDb } from "@/lib/db/tenders";
import { AdminTenderForm } from "@/components/admin/AdminTenderForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { publicTenderPath } from "@/lib/public-tender-url";
import { BidDocumentAccessCard } from "@/components/tenders/BidDocumentAccessCard";

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
            href={publicTenderPath(tender)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd6da] bg-white px-4 text-sm font-black text-[#0a2b40] transition-colors hover:border-[#ffb21c] hover:bg-[#fff8e9]"
          >
            查看前台页面 <span aria-hidden="true">↗</span>
          </Link>
        }
      />
      <AdminTenderForm tender={tender} />
      {/*
        Read-only: what the detail page shows under 官方正式投标入口 (read from
        the notice at import). Here because a staged country (Guyana) has no
        public page yet to preview it on.
      */}
      {tender.bidDocumentAccess !== undefined && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-black text-[#071826]">标书获取方式（详情页「官方正式投标入口」下显示）</h2>
          {tender.bidDocumentAccess ? (
            <BidDocumentAccessCard access={tender.bidDocumentAccess} noticeUrl={tender.sourceUrl} />
          ) : (
            <p className="rounded-xl border border-[#e1e7e9] bg-white px-4 py-3 text-xs text-[#64717c]">公告里没读到标书获取方式（多半是扫描件），详情页不显示这一块。</p>
          )}
        </section>
      )}
    </div>
  );
}
