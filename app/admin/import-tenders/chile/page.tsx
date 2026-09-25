import { ImportChileForm } from "@/components/admin/ImportChileForm";
import { AutoRunBadge, AutoRunNote } from "@/components/admin/AutoRunBadge";

export default function AdminImportTendersChilePage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#52636e]">
        智利的两个来源都是<strong>实时读取</strong>，不需要手动导出文件——直接拉取。先不勾选&quot;写入
        Supabase&quot;预览一遍，确认数字没问题再写入。
      </p>
      <div className="rounded-xl border border-[#cfe9d8] bg-[#f3fbf6] px-4 py-3">
        <p className="text-sm font-black text-[#071826]">
          <AutoRunBadge schedule="每天 11:17 UTC（北京时间 19:17），GitHub Actions" /> 智利每天自动导入
        </p>
        <AutoRunNote>
          Mercado Público 和 Codelco 都在每日自动任务里（每天 11:17 UTC，北京时间 19:17），都只导入近 3 天发布的。这一页只在想提前跑一次、或者先看看会导入什么的时候用。
        </AutoRunNote>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href="https://www.mercadopublico.cl/BuscarLicitacion/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 Mercado Público 官网 ↗
        </a>
        <a
          href="https://www.codelco.com/licitaciones-en-proceso"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 Codelco 招标页 ↗
        </a>
      </div>
      <ImportChileForm />
    </div>
  );
}
