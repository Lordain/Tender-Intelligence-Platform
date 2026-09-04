type PageMetric = {
  label: string;
  value: number | string;
  suffix: string;
};

export function PageIntro({
  eyebrow,
  title,
  description,
  tags,
  metrics,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tags: string[];
  metrics: PageMetric[];
}) {
  return (
    <header className="flex flex-col justify-between gap-7 border-b border-[#dbe2e5] pb-7 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-[#071826] sm:text-5xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65747d] sm:text-base">{description}</p>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-2 text-xs font-bold text-[#52636e]">
              <span className="size-1.5 rounded-full bg-[#ffb21c]" />
              {tag}
            </span>
          ))}
        </div>
      </div>

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
    </header>
  );
}
