import { TranslateTendersButton } from "@/components/admin/TranslateTendersButton";
import { ReclassifyButton } from "@/components/admin/ReclassifyButton";
import { ExplainKeptPanel } from "@/components/admin/ExplainKeptPanel";

/**
 * The cross-country maintenance actions, as their own tab.
 *
 * These used to sit at the bottom of the shared layout, so they rendered
 * under every country tab — three panels of "not today's job" between the
 * admin and the bottom of the page they actually came for. They are also
 * genuinely not per-country (translate and reclassify run over the whole
 * table; 保留原因分析 carries its own country filter), which is exactly why
 * repeating them on each country tab read as if they were.
 *
 * First in the tab order, per the user (2026-09-11), with 墨西哥 still the
 * default landing tab — this is the tab you visit on purpose, not the one
 * you want every day.
 */
export default function AdminImportTendersMaintenancePage() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#52636e]">
        这些操作<strong>对所有国家的标书统一生效</strong>，跟当前选中的国家无关。不是每天要做的事——
        翻译在导入新数据之后跑，重新分类只在改过筛选规则之后跑，保留原因分析随时可看（只读）。
      </p>
      <TranslateTendersButton />
      <ReclassifyButton />
      <ExplainKeptPanel />
    </div>
  );
}
