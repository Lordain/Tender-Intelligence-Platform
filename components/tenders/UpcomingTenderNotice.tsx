/**
 * Shown on every page of a tender that is only ANNOUNCED — status 即将招标,
 * which only an announcement source's rows can carry (lib/upcoming-tenders.ts).
 * The user asked for it in so many words (2026-09-26: 需要备注是预告即将招标):
 * a reader must not take an announcement for a tender they can bid on today.
 */
export function UpcomingTenderNotice() {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4 sm:px-6">
      <p className="text-sm font-black text-violet-900">招标预告 · 即将招标</p>
      <p className="mt-1 text-xs leading-6 text-violet-900/80">
        这是采购方公布的招标计划，正式招标尚未发布，目前还不能投标。预计发布时间见项目摘要，时间为采购方预估，可能调整；正式招标发布后，请以采购方公告为准。
      </p>
    </section>
  );
}
