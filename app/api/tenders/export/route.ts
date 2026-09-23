import { NextResponse, type NextRequest } from "next/server";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { canExportTenders, isClosedTender } from "@/lib/access-control";
import { filterTenders } from "@/lib/filter-tenders";
import { getCachedTenderList } from "@/lib/tenders";
import { toTenderListItem } from "@/lib/tender-list-page";
import { publicTenderPath } from "@/lib/public-tender-url";

function csv(value: string | number | null | undefined) {
  const content = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(content) ? `'${content}` : content;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const entitlement = await getViewerEntitlement();
  if (!canExportTenders(entitlement)) return NextResponse.json({ error: "当前方案不支持项目导出。" }, { status: 403 });
  const history = request.nextUrl.searchParams.get("history") === "1";
  if (history && entitlement.plan !== "enterprise") return NextResponse.json({ error: "历史项目清单仅限专业企业版导出。" }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const tenders = filterTenders(await getCachedTenderList(), {
    query: params.get("q") ?? undefined,
    countries: params.get("country")?.split(",").filter(Boolean),
    industries: params.get("industry")?.split(",").filter(Boolean),
  }, "zh").filter((tender) => history ? isClosedTender(tender.status) : !isClosedTender(tender.status)).slice(0, 5000);
  const header = ["中文标题", "国家", "行业", "采购单位", "项目状态", "预算", "币种", "截止时间", "项目链接"];
  const rows = tenders.map((tender) => {
    const item = toTenderListItem(tender, { memberView: true });
    return [item.titleZh, tender.country, tender.industries.join("、"), tender.buyer, tender.status, tender.estimatedValue, tender.currency, tender.submissionDeadline, new URL(publicTenderPath(tender), request.url).toString()].map(csv).join(",");
  });
  return new NextResponse(`\uFEFF${header.map(csv).join(",")}\r\n${rows.join("\r\n")}`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="latintender-${history ? "history" : "current"}.csv"`, "cache-control": "private, no-store" },
  });
}
