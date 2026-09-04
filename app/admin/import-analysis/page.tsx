import { ImportBatchAnalysisForm } from "@/components/admin/ImportBatchAnalysisForm";

export default function AdminImportAnalysisPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10 sm:px-8 lg:py-12">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Batch analysis</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#071826]">导入分析结果</h1>
      </div>
      <p className="text-sm text-[#52636e]">
        上传 <code className="rounded bg-[#edf2f3] px-1.5 py-0.5 text-xs">npm run analyze:batch</code>（或其他方式）产出的分析结果 JSON 文件（可以一次选多个），
        会按项目编号自动分组、合并同一项目下所有文档的结果，写入资质要求 / 业绩要求 / 所需文件 / 风险提示。
        先不勾选&quot;写入 Supabase&quot;预览一遍，确认数字没问题再写入。
      </p>
      <ImportBatchAnalysisForm />
    </div>
  );
}
