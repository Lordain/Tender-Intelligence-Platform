import { ImportColombiaForm } from "@/components/admin/ImportColombiaForm";
import { ImportCompanySourceForm } from "@/components/admin/ImportCompanySourceForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";

export default function AdminImportTendersColombiaPage() {
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="SECOP II — 政府公开招标"
        hint="哥伦比亚主渠道；可同时下载新写入项目的招标附件"
        mode="auto"
        links={[{ href: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index" }]}
      >
        <ImportColombiaForm />
      </ImportSourceSection>
      <ImportSourceSection name="UPME — 输电扩建招标" hint="新建变电站和输电线路的投资人遴选；只导入仍在投标阶段的" mode="auto" links={[{ href: "https://www.upme.gov.co/" }]}>
        <ImportCompanySourceForm source="upme" title="UPME" />
      </ImportSourceSection>
    </div>
  );
}
