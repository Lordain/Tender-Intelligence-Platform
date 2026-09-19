/**
 * Marks an import that now runs on a schedule, so nobody clicks a button that
 * a machine already pressed this morning.
 *
 * The distinction is not cosmetic in either direction. An unmarked panel is a
 * source that goes stale unless a person remembers it — and a source this
 * platform stops reading looks exactly like a source with no new tenders. A
 * marked one is a panel you only open to force an early run or to preview
 * what the schedule would write.
 *
 * `schedule` names the time AND the machine, because the next question after
 * "does this run itself?" is always "where do I go when it stops?" — and the
 * answer is not this app: every ingestion job runs on GitHub Actions
 * (.github/workflows/daily-ingest.yml), not on Vercel.
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

/**
 * The other half of the same question, and the half that actually costs
 * something when it goes unanswered.
 *
 * AutoRunBadge exists so nobody re-runs what a schedule already ran. This one
 * exists because the reverse mistake is worse and silent: an unmarked panel
 * reads as automatic — every other country's does — so a source nobody has
 * imported in two weeks looks exactly like a source with no new tenders.
 * Brazil and Peru are both in that position: `cron:colombia`, `cron:pemex`
 * and `licitia:daily` are the only entries in the daily-ingest matrix, so
 * every Brazilian and Peruvian row on this site was put there by hand.
 *
 * Amber rather than green, and it says what to do instead of just what is
 * missing — the admin reading this needs the next action, not a warning.
 */
export function ManualOnlyBadge({ hint }: { hint: string }) {
  return (
    <span
      title={hint}
      className="inline-flex items-center gap-1 rounded-full bg-[#fff3d6] px-2 py-0.5 align-middle text-[10px] font-black text-[#8a5a00]"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-3">
        <path d="M12 8v5" />
        <path d="M12 16.5v.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
      手动跑
      <span className="sr-only">（{hint}）</span>
    </span>
  );
}

/** The one line under a heading that says what has to be done by hand, and how often. */
export function ManualOnlyNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs font-bold text-[#8a5a00]">{children}</p>;
}
