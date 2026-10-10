import type { BidDocumentAccess } from "@/types/tender";
import { convertToUsd } from "@/lib/currency";

function formatFee(fee: NonNullable<BidDocumentAccess["fee"]>): string {
  const local = `${fee.amount.toLocaleString("en-US")} ${fee.currency === "GYD" ? "圭亚那元" : fee.currency}`;
  const usd = convertToUsd(fee.amount, fee.currency);
  return usd === null ? local : `${local}（约 ${Math.max(1, Math.round(usd))} 美元）`;
}

/**
 * 「这个项目的标书怎么拿」: the route to the full bid documents for a source
 * that publishes only a notice (Tender.bidDocumentAccess, read from each
 * notice at import). Every line maps to a flag the notice set; nothing is
 * inferred, and the notice's own sentences sit underneath to check against.
 *
 * No hooks, so the admin edit page (a server component) renders the same
 * card the detail page does — a staged country has no public page to preview.
 */
export function BidDocumentAccessCard({ access, noticeUrl }: { access: BidDocumentAccess; noticeUrl?: string }) {
  const lines: React.ReactNode[] = [];

  if (access.downloadUrl) {
    lines.push(
      <>
        在采购单位网站下载：
        <a href={access.downloadUrl} target="_blank" rel="noopener noreferrer" className="break-all font-bold text-[#b86e00] underline underline-offset-2">
          {access.downloadUrl.replace(/^https?:\/\//, "")}
        </a>
        {access.downloadNeedsForm ? "（需先在网站上填一份在线表格）" : ""}
      </>,
    );
  }
  if (access.byEmail) {
    lines.push(access.free ? "免费索取电子版：书面或邮件申请后，采购单位用邮件发送" : "书面或邮件申请后，采购单位用邮件发送电子版（公告未写费用）");
  }
  if (access.fee) {
    lines.push(
      `购买${access.flashDrive ? " U 盘电子版" : "完整招标文件"}：${formatFee(access.fee)}，不退款${access.collectInPerson ? "；付款后到采购单位领取" : ""}`,
    );
  } else if (access.collectInPerson) {
    lines.push("到采购单位领取");
  }
  if (access.courier) {
    lines.push("不在当地的，可以申请寄送：须提供一家圭亚那当地快递公司的到付账号，运费由收件方承担");
  }
  if (access.inspection) {
    lines.push("可以先到采购单位办公室查阅招标文件");
  }
  if (access.requestTitle) {
    lines.push(
      <>
        书面申请须注明：
        <code className="mt-1 block rounded-lg bg-[#f3f6f7] px-2.5 py-1.5 font-mono text-xs leading-5 text-[#233846] select-all">{access.requestTitle}</code>
      </>,
    );
  }
  if (access.emails.length > 0) {
    lines.push(
      <>
        公告中列出的邮箱：
        {/* One per line: an address split across lines is one nobody can copy. */}
        {access.emails.map((email) => (
          <a key={email} href={`mailto:${email}`} className="block w-fit max-w-full truncate font-bold text-[#b86e00] underline underline-offset-2">
            {email}
          </a>
        ))}
      </>,
    );
  }

  return (
    <div className="rounded-2xl surface-warm border border-[#dfe5e7] p-5 sm:p-6">
      <h3 className="text-sm font-black text-[#071826]">这个项目的标书怎么拿</h3>
      <p className="mt-1.5 text-xs leading-5 text-[#64717c]">
        官方平台只发布招标公告，完整招标文件{access.downloadUrl ? "可以在网上下载，也可以" : "要"}按下面的方式向采购单位获取：
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {lines.map((line, index) => (
          <li key={index} className="flex items-start gap-3 text-sm leading-6 text-[#233846]">
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#b86e00]" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl border border-[#f0d9a8] surface-amber px-3 py-2 text-xs leading-5 text-[#7a5200]">
        {access.fromSibling ? "这一标段的公告是扫描件，以上按同一项目其他标段的公告整理。" : ""}
        以上由本站根据招标公告整理；地址、办公时间等细节见公告原文，以公告为准。
      </p>
      {(access.excerpt || noticeUrl) && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-bold text-[#52636e]">公告原文（英文）</summary>
          {access.excerpt && <p className="mt-2 leading-5 text-[#64717c]">{access.excerpt}</p>}
          {noticeUrl && (
            <a href={noticeUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-bold text-[#b86e00]">
              打开招标公告 PDF ↗
            </a>
          )}
        </details>
      )}
    </div>
  );
}
