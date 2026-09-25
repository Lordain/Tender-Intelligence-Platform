import type { ReactNode } from "react";

export type TimelineItem = {
  id: string;
  label: string;
  date: string;
  note?: string;
  accent?: boolean;
  badge?: ReactNode;
};

/** A schedule, not a progress meter: a future milestone is not marked complete. */
export function TimelineTrack({ items }: { items: TimelineItem[] }) {
  return (
    <div className={`relative mx-auto w-full max-w-[1080px] ${items.length > 1 ? "h-72 lg:h-auto" : "min-h-20 lg:min-h-0"}`}>
      {items.length > 1 && (
        <span aria-hidden="true" className="absolute bottom-[18px] left-[17px] top-[18px] w-px bg-[#d8e1e4] lg:bottom-auto lg:left-[90px] lg:right-[90px] lg:top-[17px] lg:h-px lg:w-auto" />
      )}
      <ol className={`relative flex h-full flex-col justify-between lg:flex-row lg:items-start ${items.length === 1 ? "lg:justify-center" : ""}`}>
        {items.map((item, index) => (
        <li key={item.id} className="relative z-10 flex w-full min-w-0 items-start gap-4 lg:w-[180px] lg:shrink-0 lg:flex-col lg:items-center lg:gap-0 lg:text-center">
          <span className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2 bg-[#fffdf9] text-xs font-black ${item.accent ? "border-[#ffb21c] text-[#a96500] shadow-[0_0_0_5px_#fff4d8]" : "border-[#cbd7dd] text-[#536772]"}`}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 pt-0.5 lg:mt-5 lg:pt-0">
            <div className="flex flex-wrap items-center gap-2 lg:justify-center">
              <p className="text-sm font-black text-[#071826]">{item.label}</p>
              {item.badge}
            </div>
            <p className={`mt-1 text-sm font-black tabular-nums ${item.accent ? "text-[#a96500]" : "text-[#354b5a]"}`}>{item.date}</p>
            {item.note && <p className="mt-1 text-xs leading-5 text-[#75838c]">{item.note}</p>}
          </div>
        </li>
        ))}
      </ol>
    </div>
  );
}
