import { ImportPeruForm } from "@/components/admin/ImportPeruForm";
import { PeruDocumentLinksForm } from "@/components/admin/PeruDocumentLinksForm";

export default function AdminImportTendersPeruPage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#52636e]">
        秘鲁的两个来源都是<strong>实时接口</strong>，不需要手动导出文件——直接拉取。先不勾选&quot;写入
        Supabase&quot;预览一遍，确认数字没问题再写入。
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 SEACE 官网 ↗
        </a>
        <a
          href="https://www.investinperu.pe/inversiones-seleccion-oxi/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 ProInversión OxI 官网 ↗
        </a>
      </div>
      <ImportPeruForm />
      {/*
        Local dev only, and the route enforces it too — it calls SEACE, which
        refuses Vercel's datacenter range. Rendered conditionally rather than
        shown-and-disabled: on the deployed site this genuinely does not
        exist, and a greyed-out panel invites someone to try to enable it.
      */}
      {process.env.NODE_ENV !== "production" && <PeruDocumentLinksForm />}
    </div>
  );
}
