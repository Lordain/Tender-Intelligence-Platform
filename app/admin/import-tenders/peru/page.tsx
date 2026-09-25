import { ImportPeruForm } from "@/components/admin/ImportPeruForm";
import { ImportCompanySourceForm } from "@/components/admin/ImportCompanySourceForm";
import { PeruDocumentLinksForm } from "@/components/admin/PeruDocumentLinksForm";
import { SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";
import { ImportSourceGroupHeading, ImportSourceSection } from "@/components/admin/ImportSourceSection";

export default function AdminImportTendersPeruPage() {
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="SEACE / ProInversión OxI"
        hint="秘鲁主渠道：常规预算招标 + 税收抵扣工程（Obras por Impuestos）"
        mode="manual"
        links={[
          { label: "SEACE", href: SEACE_PUBLIC_SEARCH_URL },
          { label: "OxI", href: "https://www.investinperu.pe/inversiones-seleccion-oxi/" },
        ]}
      >
        <ImportPeruForm />
      </ImportSourceSection>
      <ImportSourceSection
        name="Petroperú — 国际竞争性招标（PCI）"
        hint="国家石油公司自己的国际招标，一年一两个；截止日显示「见招标文件」"
        mode="auto"
        links={[{ href: "https://www.petroperu.com.pe/proveedores/avisos-y-convocatorias/competencia-internacional/" }]}
      >
        <ImportCompanySourceForm
          source="petroperu"
          title="Petroperú"
          note="只导入 PCI 开头的正式招标；CAI 开头的是采购完成后的公示，不导入。"
        />
      </ImportSourceSection>
      {/*
        Local dev only, and the route enforces it too — it calls SEACE, which
        refuses Vercel's datacenter range. Not rendered at all in production,
        rather than shown disabled.
      */}
      {process.env.NODE_ENV !== "production" && (
        <>
          <ImportSourceGroupHeading>维护工具（仅本机）</ImportSourceGroupHeading>
          <ImportSourceSection name="补齐历史项目的标书链接" hint="只在本机能跑：SEACE 拒绝云服务器的请求" mode="tool">
            <PeruDocumentLinksForm />
          </ImportSourceSection>
        </>
      )}
    </div>
  );
}
