import { ImportColombiaForm } from "@/components/admin/ImportColombiaForm";

export default function AdminImportTendersColombiaPage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#52636e]">
        SECOP II 是真实接口，不需要手动导出文件——直接实时拉取标书清单，并可以同时下载新写入项目的招标附件。
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 SECOP II 官网 ↗
        </a>
      </div>
      <ImportColombiaForm />
    </div>
  );
}
