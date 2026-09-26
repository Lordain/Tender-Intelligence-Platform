import { RefreshDisplayTextButton } from "@/components/admin/RefreshDisplayTextButton";
import { ReclassifyButton } from "@/components/admin/ReclassifyButton";
import { ExplainKeptPanel } from "@/components/admin/ExplainKeptPanel";
import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { RefreshStatusesPanel } from "@/components/admin/RefreshStatusesPanel";

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
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[#64717c]">这些操作对<strong>所有国家</strong>统一生效，跟选中的国家无关。</p>
      <ImportSourceSection name="更新项目文案" hint="导入新数据后跑：翻译 + 生成公开标题和摘要，按顺序自动跑完" mode="tool">
        <RefreshDisplayTextButton />
      </ImportSourceSection>
      <ImportSourceSection name="刷新标书状态" hint="暂停、恢复、中标、流标、取消：按来源最新状态更新已入库项目" mode="tool">
        <RefreshStatusesPanel />
      </ImportSourceSection>
      <ImportSourceSection name="重新分类" hint="只在改过筛选规则之后跑" mode="tool">
        <ReclassifyButton />
      </ImportSourceSection>
      <ImportSourceSection name="保留原因分析" hint="只读：看每个项目是被哪条规则保留的" mode="tool">
        <ExplainKeptPanel />
      </ImportSourceSection>
    </div>
  );
}
