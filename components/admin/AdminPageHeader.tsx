import Link from "next/link";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  backHref,
  backLabel = "返回项目管理",
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[#dbe2e5] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-4 inline-flex items-center gap-2 text-xs font-black text-[#64717c] transition-colors hover:text-[#b86e00]"
          >
            <span aria-hidden="true">←</span>{backLabel}
          </Link>
        )}
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[#071826] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64717c]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}
