type PageMetric = {
  label: string;
  value: number | string;
  suffix: string;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  metrics,
  metricsNote,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: PageMetric[];
  /**
   * A card beside the metric card. Optional and opt-in because the three
   * pages using PageIntro do not share one — /pricing and 我的收藏 have
   * nothing to say here, and a default would put one page's sentence next
   * to another page's number.
   */
  metricsNote?: { title: string; body: string };
}) {
  return (
    <header className="flex flex-col justify-between gap-5 border-b border-[#dbe2e5] pb-5 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.045em] text-[#071826] sm:text-5xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#65747d] sm:text-base">{description}</p>
      </div>

      {/* The note sits BESIDE the metric card, not under it: stacking the two
          made the header a row taller on the one page whose job is showing
          rows. items-stretch is what keeps the two boxes the same height
          without either being told a fixed one — whichever wraps to more
          lines sets the height and the other matches it.

          It borrows the promotional banner's palette (components/pricing/
          PricingPlans.tsx) rather than inventing a third accent: the site
          already means "read this, it is news" in those colours. */}
      <div className="flex shrink-0 items-stretch gap-3 sm:gap-4">
        {metricsNote && (
          <div className="flex max-w-40 flex-col justify-center rounded-2xl border border-[#f3c2bd] bg-[#fff5f4] px-4 py-3 sm:max-w-56">
            <p className="text-[11px] font-black text-[#a3261f]">{metricsNote.title}</p>
            <p className="mt-1 text-xs font-bold leading-5 text-[#7c4b46]">{metricsNote.body}</p>
          </div>
        )}
        <div className="flex shrink-0 divide-x divide-white/15 overflow-hidden rounded-2xl bg-[#061b2b] px-2 py-3 text-white shadow-[0_16px_40px_-30px_rgba(6,27,43,.65)]">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-28 px-4 sm:min-w-32">
              <p className="text-[11px] font-semibold text-white/55">{metric.label}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-black leading-none tracking-[-0.04em] text-[#ffb21c]">{metric.value}</span>
                <span className="text-xs font-bold text-white/68">{metric.suffix}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
