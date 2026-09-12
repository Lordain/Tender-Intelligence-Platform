import { ImportBatchAnalysisForm } from "@/components/admin/ImportBatchAnalysisForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export default function AdminImportAnalysisPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8 lg:py-10">
      <AdminPageHeader
        eyebrow="Batch analysis"
        title="导入分析结果"
        description="上传批量分析生成的 JSON 文件，系统会按项目编号自动合并资质、业绩、文件与风险结果。建议先预览，确认无误后再写入。"
        backHref="/admin/tenders"
      />
      <ImportBatchAnalysisForm />
    </div>
  );
}
