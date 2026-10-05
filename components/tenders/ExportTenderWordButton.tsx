/**
 * 导出 Word: downloads this tender's detail page as a .docx (user, 2026-10-05:
 * 改成 Word（.docx）直接下载). Drawn only for plans with
 * canExportTenderDetail(); the route checks the same rule again.
 */
export function ExportTenderWordButton({ publicSlug }: { publicSlug: string }) {
  return (
    <a
      href={`/api/tenders/${encodeURIComponent(publicSlug)}/docx`}
      download
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dbe2e5] bg-white px-3 text-xs font-black text-[#16415a] transition-colors hover:border-[#b86e00] hover:text-[#b86e00]"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
      </svg>
      导出 Word
    </a>
  );
}
