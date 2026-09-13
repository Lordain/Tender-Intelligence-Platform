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
   * A caption under the metric card. Optional and opt-in because the three
   * pages using PageIntro do not share a caption — /pricing and 我的收藏
   * have nothing to say here, and a default would put one page's sentence
   * under another page's number.
   */
  metricsNote?: string;
}) {
  return (
    <header className="flex flex-col justify-between gap-5 border-b border-[#dbe2e5] pb-5 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">{eyebrow}</p>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.045em] text-[#071826] sm:text-5xl">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#65747d] sm:text-base">{description}</p>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
        <div className="flex divide-x divide-white/15 overflow-hidden rounded-2xl bg-[#061b2b] px-2 py-3 text-white shadow-[0_16px_40px_-30px_rgba(6,27,43,.65)]">
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
        {metricsNote && (
          <p className="max-w-64 text-xs font-bold leading-5 text-[#8a7143] lg:text-right">{metricsNote}</p>
        )}
      </div>
    </header>
  );
}
