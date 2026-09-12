/**
 * Marks an import that now runs on a schedule, so nobody clicks a button that
 * a machine already pressed at 04:00.
 *
 * The distinction is not cosmetic in either direction. An unmarked panel is a
 * source that goes stale unless a person remembers it — and a source this
 * platform stops reading looks exactly like a source with no new tenders. A
 * marked one is a panel you only open to force an early run or to preview
 * what the schedule would write.
 *
 * `schedule` is shown in full rather than abbreviated, because the next
 * question after "does this run itself?" is always "when, and where does it
 * run from?" — and for LicitIA the answer is a different machine entirely
 * (GitHub Actions, see .github/workflows/licitia-daily.yml).
 */
export function AutoRunBadge({ schedule }: { schedule: string }) {
  return (
    <span
      title={schedule}
      className="inline-flex items-center gap-1 rounded-full bg-[#e7f5ec] px-2 py-0.5 align-middle text-[10px] font-black text-[#186a3b]"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      自动跑
      <span className="sr-only">（{schedule}）</span>
    </span>
  );
}

/** The one line under a heading that says exactly when the schedule fires. */
export function AutoRunNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs font-bold text-[#186a3b]">{children}</p>;
}
