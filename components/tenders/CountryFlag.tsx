export function MexicoFlag({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid h-3.5 w-5 shrink-0 grid-cols-3 overflow-hidden rounded-[2px] border border-black/10 shadow-[0_1px_2px_rgba(0,0,0,.08)] ${className}`}
    >
      <span className="bg-[#006847]" />
      <span className="relative bg-white">
        <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8b5a2b]" />
      </span>
      <span className="bg-[#ce1126]" />
    </span>
  );
}
