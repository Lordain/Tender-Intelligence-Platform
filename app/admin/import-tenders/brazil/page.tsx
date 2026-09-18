import { ImportBrazilForm } from "@/components/admin/ImportBrazilForm";

export default function AdminImportTendersBrazilPage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#52636e]">
        巴西只有一个来源，是<strong>实时接口</strong>，不需要手动导出文件——直接拉取。先不勾选&quot;写入
        Supabase&quot;预览一遍，确认数量和分级没问题再写入。
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="https://pncp.gov.br/app/editais"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 PNCP 官网 ↗
        </a>
      </div>
      <ImportBrazilForm />
    </div>
  );
}
