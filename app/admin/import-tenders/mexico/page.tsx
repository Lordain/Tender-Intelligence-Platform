import { ImportTendersForm } from "@/components/admin/ImportTendersForm";
import { ImportPemexForm } from "@/components/admin/ImportPemexForm";
import { ImportDofSearchForm } from "@/components/admin/ImportDofSearchForm";
import { LicitiaRefreshPanel } from "@/components/admin/LicitiaRefreshPanel";
import { MexicoDeadlineBackfillPanel } from "@/components/admin/MexicoDeadlineBackfillPanel";
import { ImportSourceGroupHeading, ImportSourceSection } from "@/components/admin/ImportSourceSection";

export default function AdminImportTendersMexicoPage() {
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="Compras MX / Proyectos Estratégicos — 上传导出文件"
        hint="从官网导出 .xlsx / .csv 后上传，批量写入"
        mode="manual"
        links={[
          { label: "Compras MX", href: "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/" },
          { label: "Proyectos Estratégicos", href: "https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/" },
        ]}
      >
        <ImportTendersForm />
      </ImportSourceSection>
      <ImportSourceSection name="PEMEX — 七个子公司的公开招标列表" hint="按 PEMEX 专属规则筛选，可单独拉某一个列表" mode="auto">
        <ImportPemexForm />
      </ImportSourceSection>
      <ImportSourceSection name="DOF 官方公报 — CFE 等招标公告" hint="按日期检索 DOF 公告，CFE 按自己的采购编号分类" mode="manual" links={[{ href: "https://www.dof.gob.mx/" }]}>
        <ImportDofSearchForm />
      </ImportSourceSection>

      <ImportSourceGroupHeading>维护工具</ImportSourceGroupHeading>
      <ImportSourceSection name="LicitIA 刷新" hint="发现新标书、补全真实链接（这两项每天自动）、修复采购单位名称" mode="tool">
        <LicitiaRefreshPanel />
      </ImportSourceSection>
      <ImportSourceSection name="补交标截止日" hint="用已有的开标日期补齐缺失的交标截止日，不覆盖已有日期" mode="tool">
        <MexicoDeadlineBackfillPanel />
      </ImportSourceSection>
    </div>
  );
}
