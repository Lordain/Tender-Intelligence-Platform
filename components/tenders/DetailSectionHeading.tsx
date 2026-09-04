export function DetailSectionHeading({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="mt-1 h-8 w-1 shrink-0 rounded-full bg-[#ffb21c]" />
        <div>
          <h2 className="text-xl font-black tracking-[-0.025em] text-[#071826] sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#75838c]">{description}</p>
        </div>
      </div>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 rounded-full bg-[#e9eef0] px-2.5 py-1 text-xs font-black text-[#425461]">{count} 项</span>
      )}
    </div>
  );
}
