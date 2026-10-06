import { ImportTendersForm } from "@/components/admin/ImportTendersForm";
import { ImportPemexForm } from "@/components/admin/ImportPemexForm";
import { ImportDofSearchForm } from "@/components/admin/ImportDofSearchForm";
import { ImportCfePasteForm } from "@/components/admin/ImportCfePasteForm";
import { RefreshAwardsPanel } from "@/components/admin/RefreshAwardsPanel";
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
      <ImportSourceSection name="DOF 官方公报 — CFE 等招标公告" hint="CFE 每天自动拉取（全称和 CFE 下属单位）；PEMEX 或其他单位在这里手动检索" mode="auto" links={[{ href: "https://dof.gob.mx/" }]}>
        <ImportDofSearchForm />
      </ImportSourceSection>
      <ImportSourceSection
        name="CFE 网站粘贴导入"
        hint="DOF 不刊登的工程类和简化招标：在 CFE 网站复制整页，粘贴导入"
        mode="manual"
        links={[{ label: "CFE 招标网站", href: "https://msc.cfe.mx/Aplicaciones/NCFE/Concursos/" }]}
      >
        <ImportCfePasteForm />
      </ImportSourceSection>
      <ImportSourceSection name="导入中标结果" hint="为已中标项目补中标日期、供应商、金额" mode="auto">
        <RefreshAwardsPanel sources={["mexico"]} manualNote="PEMEX、CFE（DOF 公告）和 Proyectos Estratégicos 的来源不公布中标数据，这些项目的中标信息请在「项目管理」里逐条填写。" />
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
