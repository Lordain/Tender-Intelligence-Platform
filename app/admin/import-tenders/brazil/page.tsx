import { ImportAntaqForm } from "@/components/admin/ImportAntaqForm";
import { ImportBrazilForm } from "@/components/admin/ImportBrazilForm";
import { ImportCompanySourceForm } from "@/components/admin/ImportCompanySourceForm";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";

export default function AdminImportTendersBrazilPage() {
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection name="PNCP — 全国公共采购门户" hint="巴西主渠道：联邦、州、市政府的工程和采购" mode="auto" links={[{ href: "https://pncp.gov.br/app/editais" }]}>
        <ImportBrazilForm />
      </ImportSourceSection>
      <ImportSourceSection name="Petronect — Petrobras / Transpetro" hint="不在 PNCP 上；按石油设备规则筛选（EPC、压缩机、管材等）" mode="auto" links={[{ href: "https://www.petronect.com.br/" }]}>
        <ImportCompanySourceForm source="petronect" title="Petronect" />
      </ImportSourceSection>
      <ImportSourceSection name="Cemig — e-Compras" hint="米纳斯吉拉斯州电力公司；只保留电网设备和材料" mode="auto" links={[{ href: "https://app2-compras.cemig.com.br/" }]}>
        <ImportCompanySourceForm source="cemig" title="Cemig" />
      </ImportSourceSection>
      <ImportSourceSection name="ANTAQ — 港口特许经营" hint="公开听证阶段的港口项目；一年七八场，每周跑一次就够" mode="manual" links={[{ href: "https://www.gov.br/antaq/pt-br" }]}>
        <ImportAntaqForm />
      </ImportSourceSection>
    </div>
  );
}
