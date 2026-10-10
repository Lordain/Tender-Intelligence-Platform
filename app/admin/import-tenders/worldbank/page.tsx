import { ImportSourceSection } from "@/components/admin/ImportSourceSection";
import { WorldBankReviewForm } from "@/components/admin/WorldBankReviewForm";

/**
 * The World Bank's procurement notices, every platform country (user,
 * 2026-10-09). The daily job (scripts/cron-worldbank.ts) writes what no
 * other source has; this tab is where the doubtful matches it held back are
 * looked at.
 */
export default function AdminImportTendersWorldBankPage() {
  return (
    <div className="flex flex-col gap-3">
      <ImportSourceSection
        name="世界银行招标公告 — 10 国 + 圭亚那"
        hint="每日自动导入；和本国平台像同一项目的，在这里确认"
        mode="auto"
        defaultOpen
        links={[{ label: "世界银行采购公告", href: "https://projects.worldbank.org/en/projects-operations/procurement" }]}
      >
        <div className="flex flex-col gap-3 text-sm text-[#233846]">
          <p className="text-xs leading-5 text-[#64717c]">
            每日任务读取世界银行出资项目的招标公告。和本国平台已导入的同一项目（世界银行编号相同，或截止日和标题对得上）不会重复写入，保留本国平台那条。公告本身不带标书，摘要里写明标书获取渠道。圭亚那的项目仍只在后台可见。
          </p>
          <WorldBankReviewForm />
        </div>
      </ImportSourceSection>
    </div>
  );
}
