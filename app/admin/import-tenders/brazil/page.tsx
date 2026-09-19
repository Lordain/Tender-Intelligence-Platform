import { ImportBrazilForm } from "@/components/admin/ImportBrazilForm";
import { ManualOnlyBadge, ManualOnlyNote } from "@/components/admin/AutoRunBadge";

export default function AdminImportTendersBrazilPage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#52636e]">
        巴西只有一个来源，是<strong>实时接口</strong>，不需要手动导出文件——直接拉取。先不勾选&quot;写入
        Supabase&quot;预览一遍，确认数量和分级没问题再写入。
      </p>
      {/*
        Asked for directly (2026-09-19: 巴西现在会自动下载吗？如果会是每天哪个
        时段？请跟哥伦比亚一样标记清楚). The answer is no, and saying so is the
        point: .github/workflows/daily-ingest.yml runs cron:colombia,
        cron:pemex and licitia:daily, and nothing else. Without this marker the
        panel looks like Colombia's, which does run itself.
      */}
      <div className="rounded-xl border border-[#f0dcae] bg-[#fffbf0] px-4 py-3">
        <p className="text-sm font-black text-[#071826]">
          <ManualOnlyBadge hint="巴西 PNCP 没有进每日自动导入，需要在这一页手动拉取" /> 巴西不会自动下载
        </p>
        <ManualOnlyNote>
          哥伦比亚、PEMEX、Compras MX 每天 11:17 UTC（北京时间 19:17）自动跑；<strong>巴西没有</strong>，
          每一条巴西项目都是在这一页手动拉进来的。建议每天或每周固定跑一次，否则库里的巴西数据会悄悄变旧——
          而「很久没导入」和「最近没有新标」在前台看起来一模一样。
        </ManualOnlyNote>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href="https://pncp.gov.br/app/editais"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#d8e0e3] bg-white px-4 py-2 text-sm font-bold text-[#071826] transition-colors hover:border-[#ffb21c] hover:bg-[#fff9ec]"
        >
          打开 PNCP 官网 ↗
        </a>
      </div>
      <ImportBrazilForm />
    </div>
  );
}
