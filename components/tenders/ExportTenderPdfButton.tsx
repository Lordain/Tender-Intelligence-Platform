"use client";

/**
 * 导出项目详情 PDF: opens the browser's print dialog on this page, where
 * 另存为 PDF saves it (user, 2026-10-05: A. PDF（浏览器打印）). The print
 * stylesheet does the rest — the site header, footer, cookie bar, back link,
 * buttons and related tenders are hidden, and a brand line is added on top
 * (`print:` classes here and in TenderDetailView, @media print in
 * app/globals.css). Rendered only for plans with canExportTenderDetail().
 */
export function ExportTenderPdfButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dbe2e5] bg-white px-3 text-xs font-black text-[#16415a] transition-colors hover:border-[#b86e00] hover:text-[#b86e00]"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
      </svg>
      导出 PDF
    </button>
  );
}
