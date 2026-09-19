import { ImportPeruForm } from "@/components/admin/ImportPeruForm";
import { PeruDocumentLinksForm } from "@/components/admin/PeruDocumentLinksForm";
import { SEACE_PUBLIC_SEARCH_URL } from "@/lib/peru-seace-url";
import { ManualOnlyBadge, ManualOnlyNote } from "@/components/admin/AutoRunBadge";

export default function AdminImportTendersPeruPage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#52636e]">
        秘鲁的两个来源都是<strong>实时接口</strong>，不需要手动导出文件——直接拉取。先不勾选&quot;写入
        Supabase&quot;预览一遍，确认数字没问题再写入。
      </p>
      {/*
        Same marker Brazil got (2026-09-19), for the same reason and on the
        same evidence: daily-ingest.yml's matrix is cron:colombia, cron:pemex
        and licitia:daily. That workflow's own header has said "Peru has no
        scheduled import at all" since it was written; this is the first place
        the person doing the importing can see it.
      */}
      <div className="rounded-xl border border-[#f0dcae] bg-[#fffbf0] px-4 py-3">
        <p className="text-sm font-black text-[#071826]">
          <ManualOnlyBadge hint="秘鲁 SEACE/OxI 没有进每日自动导入，需要在这一页手动拉取" /> 秘鲁不会自动下载
        </p>
        <ManualOnlyNote>
          哥伦比亚、PEMEX、Compras MX 每天 11:17 UTC（北京时间 19:17）自动跑；<strong>秘鲁没有</strong>，
          每一条秘鲁项目都是在这一页手动拉进来的。
        </ManualOnlyNote>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href={SEACE_PUBLIC_SEARCH_URL}
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
