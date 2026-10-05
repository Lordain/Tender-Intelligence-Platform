import type { BeginnerIconName } from "@/lib/beginner-guide";

/**
 * Line icons for the 新手入门 guide (user, 2026-10-05: 新手指导，增加一些Icon),
 * drawn in the same 24-unit, 1.5-stroke style as the homepage industry rail
 * (components/tenders/HomeHero.tsx) rather than pulling in an icon package.
 */
export function BeginnerIcon({ name, className = "size-5" }: { name: BeginnerIconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`shrink-0 fill-none stroke-current stroke-[1.6] ${className}`} strokeLinecap="round" strokeLinejoin="round">
      {name === "search" && <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5.5 5.5" /></>}
      {name === "notice" && <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>}
      {name === "download" && <><path d="M12 3v11m-4.5-4.5L12 14l4.5-4.5M4 17v3h16v-3" /></>}
      {name === "register" && <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M15 10h3M15 14h3" /></>}
      {name === "question" && <><path d="M4 5h16v11H9l-5 4z" /><path d="M10 9.2a2 2 0 1 1 2.6 1.9c-.4.1-.6.5-.6.9v.2M12 14.2h.01" /></>}
      {name === "submit" && <><path d="M21 3 10.5 13.5" /><path d="M21 3l-6.5 18-4-7.5L3 9.5z" /></>}
      {name === "review" && <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM9 13.5l2 2 4-4" /></>}
      {name === "award" && <><circle cx="12" cy="9" r="5.5" /><path d="m9 13.8-1.8 7.2 4.8-2.6 4.8 2.6-1.8-7.2" /></>}
      {name === "company" && <><path d="M4 21V6l8-3 8 3v15M2.5 21h19M8.5 9h1M14.5 9h1M8.5 13h1M14.5 13h1M10 21v-4h4v4" /></>}
      {name === "experience" && <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 12.5h18" /></>}
      {name === "finance" && <><path d="M4 20h16M7 16v-4M12 16V8M17 16V5" /></>}
      {name === "guarantee" && <><path d="M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z" /><path d="m9 12 2 2 4-4" /></>}
      {name === "local" && <><path d="M12 21s-7-5.8-7-11a7 7 0 0 1 14 0c0 5.2-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>}
      {name === "pricing" && <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h3.5" /></>}
      {name === "clock" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      {name === "language" && <><path d="M4 5h9M8.5 3v2M6 9c1.4 2.6 3.6 4.4 6.5 5.5M11.5 5c-.9 4-3.4 7-7 9M13 21l4-9 4 9M14.4 18h5.2" /></>}
      {name === "amendments" && <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>}
      {name === "reject" && <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>}
      {name === "tax" && <><path d="M18.5 5.5 5.5 18.5" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>}
      {name === "official" && <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11M12 15v2" /></>}
      {name === "partner-warning" && <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5 1.5 0 2.8.4 3.8 1.2M18 9v4.5M18 17h.01" /></>}
      {name === "target" && <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>}
      {name === "local-company" && <><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5h16M10 20v-5h4v5" /></>}
      {name === "step-up" && <><path d="M3 17.5 9 11.5l4 4 8-8" /><path d="M15 7.5h6v6" /></>}
      {name === "folder" && <><path d="M3 6h6l2 2h10v11H3z" /><path d="M3 11h18" /></>}
      {name === "partner" && <><circle cx="8" cy="8" r="2.5" /><circle cx="16" cy="8" r="2.5" /><path d="M3 19c0-2.8 2.2-4.5 5-4.5 1.4 0 2.7.4 3.5 1.2M21 19c0-2.8-2.2-4.5-5-4.5-1.4 0-2.7.4-3.5 1.2" /></>}
      {name === "bell" && <><path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>}
    </svg>
  );
}
