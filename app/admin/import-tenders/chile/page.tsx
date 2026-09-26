import { ImportChileForm } from "@/components/admin/ImportChileForm";
import { RefreshAwardsPanel } from "@/components/admin/RefreshAwardsPanel";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";

export default function AdminImportTendersChilePage() {
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="Mercado Público / Codelco"
        hint="智利政府公开招标 + Codelco 自己的公开招标；两个来源共用一套设置"
        mode="auto"
        defaultOpen
        links={[
          { label: "Mercado Público", href: "https://www.mercadopublico.cl/BuscarLicitacion/" },
          { label: "Codelco", href: "https://www.codelco.com/licitaciones-en-proceso" },
        ]}
      >
        <ImportChileForm />
      </ImportSourceSection>
      <ImportSourceSection name="导入中标结果" hint="为已中标项目补中标日期、供应商、金额" mode="auto">
        <RefreshAwardsPanel sources={["chile"]} manualNote="Codelco 和圣地亚哥地铁不公布中标数据，这些项目的中标信息请在「项目管理」里逐条填写。" />
      </ImportSourceSection>
    </div>
  );
}
