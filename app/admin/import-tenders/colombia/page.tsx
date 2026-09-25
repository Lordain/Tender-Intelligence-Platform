import { ImportColombiaForm } from "@/components/admin/ImportColombiaForm";
import { ImportCompanySourceForm } from "@/components/admin/ImportCompanySourceForm";

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
      <ImportCompanySourceForm
        source="upme"
        eyebrow="Colombia · 输电"
        title="UPME — 输电扩建招标（Convocatorias）"
        description="哥伦比亚矿能规划署 UPME 的新建变电站和输电线路投资人遴选，不在 SECOP 上。只导入仍在投标阶段的。"
        sourceUrl="https://www.upme.gov.co/"
      />
    </div>
  );
}
