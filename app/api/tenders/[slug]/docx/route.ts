import { NextResponse, type NextRequest } from "next/server";
import { getViewerEntitlement } from "@/lib/access-control-server";
import { canExportTenderDetail } from "@/lib/access-control";
import { getTenderByPublicSlug } from "@/lib/tenders";
import { publicTenderPath } from "@/lib/public-tender-url";
import { buildTenderDocx } from "@/lib/tender-docx";

export const runtime = "nodejs";

/**
 * 导出 Word: one tender's detail page as a .docx download (lib/tender-docx.ts).
 * The plan check is here, on the server, not only in whether the button is
 * drawn — 基础个人版 gets its own country and nothing else.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tender, entitlement] = await Promise.all([getTenderByPublicSlug(slug), getViewerEntitlement()]);
  if (!tender) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
  if (!canExportTenderDetail(entitlement, tender.country)) {
    return NextResponse.json({ error: "当前方案不支持导出这个项目的详情。" }, { status: 403 });
  }

  const pageUrl = new URL(publicTenderPath(tender), request.url).toString();
  const file = await buildTenderDocx(tender, pageUrl, new Date());
  const asciiName = `latintender-${tender.tenderNumber.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "tender"}.docx`;
  const name = `项目详情-${tender.tenderNumber}.docx`;
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
