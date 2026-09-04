import Link from "next/link";
import { ImportBatchAnalysisForm } from "@/components/admin/ImportBatchAnalysisForm";

export default function AdminImportAnalysisPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">导入分析结果</h1>
        <Link href="/admin/tenders" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
          ← 返回项目管理
        </Link>
      </div>
      <p className="text-sm text-zinc-500">
        上传 <code>npm run analyze:batch</code>（或其他方式）产出的分析结果 JSON 文件（可以一次选多个），
        会按项目编号自动分组、合并同一项目下所有文档的结果，写入资质要求 / 业绩要求 / 所需文件 / 风险提示。
        先不勾选&quot;写入 Supabase&quot;预览一遍，确认数字没问题再写入。
      </p>
      <ImportBatchAnalysisForm />
    </div>
  );
}
