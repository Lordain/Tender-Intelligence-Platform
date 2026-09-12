import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { LocalBatchAnalysisForm } from "@/components/admin/LocalBatchAnalysisForm";

/**
 * Reads the operator's own disk, so it only exists on a local dev server —
 * see app/api/admin/local-batch/route.ts for why. 404 rather than a
 * disabled-looking page: on the deployed site this feature genuinely does
 * not exist, and a greyed-out form would invite someone to try to enable it.
 */
export const dynamic = "force-dynamic";

export default function AdminLocalBatchPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Local batch"
        title="本地批量分析"
        description="把下载好的标书放进一个文件夹，填路径即可——文件不经过浏览器上传。系统会按文件内的招标编号自动归属到对应项目，一个项目的多个文件合并分析后写回一句话总结、资质、业绩、文件要求与风险。同一文件按内容哈希去重，不会重复付费。"
        backHref="/admin/tenders"
      />
      <LocalBatchAnalysisForm />
    </div>
  );
}
