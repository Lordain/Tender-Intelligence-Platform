type PageMetric = {
  label: string;
  value: number | string;
  suffix: string;
};

/** The caption above a metric. */
const LABEL = "text-[11px] font-semibold";

export function PageIntro({
  eyebrow,
  title,
  description,
  metrics,
  metricsAction,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: PageMetric[];
  /**
   * A link at the foot of the metric card, for an action on exactly what the
   * metric counts — the tender list's CSV export of the filtered rows. It
   * used to sit on a row of its own above the header, which left the top of
   * the page a strip of empty space with one small button at the far right
   * (user, 2026-10-05: 上面显得很空，优化排版).
   */
  metricsAction?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-col justify-between gap-5 border-b border-[#dbe2e5] pb-5 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.045em] text-[#071826] sm:text-5xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#65747d] sm:text-base">{description}</p>
      </div>

      <div className="shrink-0 self-start overflow-hidden rounded-2xl bg-[#061b2b] text-white shadow-[0_16px_40px_-30px_rgba(6,27,43,.65)] lg:self-auto">
        <div className="flex divide-x divide-white/15 px-2 py-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-28 px-4 sm:min-w-32">
              <p className={`${LABEL} text-white/55`}>{metric.label}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-black leading-none tracking-[-0.04em] text-[#ffb21c]">{metric.value}</span>
                <span className="text-xs font-bold text-white/68">{metric.suffix}</span>
              </p>
            </div>
          ))}
        </div>
        {metricsAction && (
          <a
            href={metricsAction.href}
            className="flex items-center gap-1.5 border-t border-white/15 px-6 py-2.5 text-xs font-bold text-white/80 transition hover:bg-white/5 hover:text-[#ffb21c]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
            </svg>
            {metricsAction.label}
          </a>
        )}
      </div>
    </header>
  );
}
