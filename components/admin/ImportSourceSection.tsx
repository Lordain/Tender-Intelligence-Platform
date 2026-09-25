"use client";

/**
 * One source on a country tab of 新项目清单, as a single collapsible row.
 *
 * The tabs had grown to five or six full panels each, every one with its own
 * paragraphs, plus a page-top intro, a status box and a row of link buttons
 * — and two of those status boxes (巴西/秘鲁 "不会自动下载") had gone stale once
 * PNCP, Petronect, Cemig and Petroperú joined the daily job. The user,
 * 2026-09-25: 请帮我精简优化现在后台的手动导入部分，感觉内容太杂了.
 *
 * So a tab is now a list: name, one line on what it is, whether the daily
 * job already runs it, the official site. Clicking a row opens the import
 * panel it always had — every control is still there, one click deeper.
 */
export type ImportSourceMode = "auto" | "manual" | "tool";

const MODE: Record<ImportSourceMode, { label: string; title: string; className: string }> = {
  auto: {
    label: "每天自动",
    title: "已在每日自动任务里（GitHub Actions，计划北京时间 19:17，实际常晚几小时）。手动只在想提前跑或先预览时用。",
    className: "bg-[#e7f5ec] text-[#186a3b]",
  },
  manual: {
    label: "手动",
    title: "不在每日自动任务里，只有在这里手动拉取才会有新数据。",
    className: "bg-[#fff3d6] text-[#8a5a00]",
  },
  tool: {
    label: "维护",
    title: "不是导入新项目，而是修补已有数据的工具。",
    className: "bg-[#eef1f2] text-[#52636e]",
  },
};

export function ImportSourceSection({
  name,
  hint,
  mode,
  links = [],
  defaultOpen = false,
  children,
}: {
  name: string;
  hint: string;
  mode: ImportSourceMode;
  links?: { label?: string; href: string }[];
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const badge = MODE[mode];
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-[#dbe2e5] bg-white open:bg-[#fbfcfc]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden sm:px-5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="size-4 shrink-0 text-[#9aa5ab] transition-transform group-open:rotate-90"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-[#071826]">{name}</span>
          <span className="block truncate text-xs text-[#64717c]">{hint}</span>
        </span>
        <span title={badge.title} className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${badge.className}`}>
          {badge.label}
        </span>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            // A click on the link opens the site; it should not also fold the row.
            onClick={(event) => event.stopPropagation()}
            className="hidden shrink-0 text-xs font-bold text-[#b86e00] underline-offset-2 hover:underline sm:inline"
          >
            {link.label ?? "官网"} ↗
          </a>
        ))}
      </summary>
      <div className="border-t border-[#eef1f2] px-3 pb-3 pt-3 sm:px-4">{children}</div>
    </details>
  );
}

/** A heading between the day-to-day sources and the repair tools below them. */
export function ImportSourceGroupHeading({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#9aa5ab]">{children}</p>;
}
