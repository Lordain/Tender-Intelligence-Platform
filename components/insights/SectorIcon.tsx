import type { InsightIconName } from "@/lib/insight-articles/types";

/** The sector glyphs the country insights share; one per 工程方向 card, never twice on a page. */
export function SectorIcon({ name, className = "size-6" }: { name: InsightIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {name === "energy" && <path d="M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" />}
      {name === "rail" && <><rect x="5" y="2.8" width="14" height="14" rx="3" /><path d="M8 7h8M8.5 12h.01M15.5 12h.01M8 21l3-4m5 4-3-4M6 21h12" /></>}
      {name === "road" && <path d="M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" />}
      {name === "port" && <><path d="M4 20h16M7 17V5h8v12M7 8h8M15 6h3v6M18 12l-2 2" /><path d="M3 20c2 1.3 4 .7 5 0 2 1.3 4 .7 5 0 2 1.3 4 .7 5 0" /></>}
      {name === "water" && <path d="M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" />}
      {name === "mine" && <><path d="m4 19 5-9 3 5 3-8 5 12H4Z" /><path d="m7 5 10 4M12 3l-2 14" /></>}
      {name === "health" && <><path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5V3Z" /><path d="M12 8v8m-4-4h8" /></>}
      {name === "digital" && <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M7 8h10M7 12h6" /></>}
      {name === "city" && <><path d="M4 21V9l5-3v15M9 21V4l7 3v14M16 21v-9l4-2v11" /><path d="M6 12h1m-1 3h1m5-6h1m-1 3h1m-1 3h1m5 0h1" /></>}
      {name === "education" && <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v5c3 2 7 2 10 0v-5M21 9v6" /></>}
      {name === "industry" && <><path d="M3 21V10l6 3V9l6 4V5h4v16H3Z" /><path d="M7 17h2m3 0h2m3 0h2" /></>}
    </svg>
  );
}
