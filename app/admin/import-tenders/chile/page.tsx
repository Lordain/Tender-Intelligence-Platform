import { ImportChileForm } from "@/components/admin/ImportChileForm";
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
    </div>
  );
}
