import { ImportTendersForm } from "@/components/admin/ImportTendersForm";
import { TranslateTendersButton } from "@/components/admin/TranslateTendersButton";
import { ImportPemexForm } from "@/components/admin/ImportPemexForm";
import { ImportDofSearchForm } from "@/components/admin/ImportDofSearchForm";
import { LicitiaRefreshPanel } from "@/components/admin/LicitiaRefreshPanel";
import { ImportColombiaForm } from "@/components/admin/ImportColombiaForm";
import { ReclassifyButton } from "@/components/admin/ReclassifyButton";

export default function AdminImportTendersPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10 sm:px-8 lg:py-12">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">New tenders</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#071826]">新项目清单</h1>
      </div>
      <p className="text-sm text-[#52636e]">
        上传政府来源导出的标书清单文件（Compras MX 开放招标 / Proyectos Estratégicos MX 的 .xlsx 或 .csv 导出），
        会自动分组映射、按发布时间过滤，批量写入 Supabase。先不勾选&quot;写入 Supabase&quot;预览一遍，确认数字没问题再写入。
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="https://comprasmx.buengobierno.gob.mx/sitiopublico/#/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 Compras MX 官网 ↗
        </a>
        <a
          href="https://proyectosestrategicosmx.hacienda.gob.mx/sitiopublico/#/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 Proyectos Estratégicos MX 官网 ↗
        </a>
      </div>
      <ImportTendersForm />
      <ImportPemexForm />
      <ImportDofSearchForm />
      <LicitiaRefreshPanel />
      <ImportColombiaForm />
      <TranslateTendersButton />
      <ReclassifyButton />
    </div>
  );
}
