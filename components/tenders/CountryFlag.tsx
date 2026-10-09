export function MexicoFlag({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid h-3.5 w-5 shrink-0 grid-cols-3 overflow-hidden ${className}`}
    >
      <span className="bg-[#006847]" />
      <span className="relative bg-white">
        <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8b5a2b]" />
      </span>
      <span className="bg-[#ce1126]" />
    </span>
  );
}

export function ColombiaFlag({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid h-3.5 w-5 shrink-0 grid-rows-[2fr_1fr_1fr] overflow-hidden ${className}`}
    >
      <span className="bg-[#fcd116]" />
      <span className="bg-[#003893]" />
      <span className="bg-[#ce1126]" />
    </span>
  );
}

/**
 * Green field, yellow rhombus, blue disc.
 *
 * Same simplification the other three already make: the real flag carries a
 * celestial sphere, a white band and the motto ORDEM E PROGRESSO, and at
 * 20x14 px all of that is a smudge. Mexico's eagle is one dot here and Peru's
 * escudo is left off entirely, so the disc is drawn plain for the same reason.
 *
 * The rhombus is a rotated square rather than a clip-path so it renders the
 * same in every browser the rest of this file already targets. It is sized
 * under the flag's width on purpose — at 45° a square of side s spans s*1.41,
 * so 9px reads as a rhombus touching the edges rather than one clipped by
 * them, and `overflow-hidden` on the field catches the corners either way.
 */
export function BrazilFlag({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block h-3.5 w-5 shrink-0 overflow-hidden bg-[#009739] ${className}`}
    >
      <span className="absolute left-1/2 top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#fedd00]" />
      <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#012169]" />
    </span>
  );
}

/** Three vertical bands, red-white-red. The plain civil flag, without the coat of arms — at 20x14 px an escudo is noise, same reasoning as Mexico's eagle being one dot above. */
export function PeruFlag({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid h-3.5 w-5 shrink-0 grid-cols-3 overflow-hidden ${className}`}
    >
      <span className="bg-[#d91023]" />
      <span className="bg-white" />
      <span className="bg-[#d91023]" />
    </span>
  );
}

/** White over red, blue canton with the star as a dot — the star at 20x14 px is one white pixel cluster, same reasoning as Mexico's eagle. */
export function ChileFlag({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-grid h-3.5 w-5 shrink-0 grid-rows-2 overflow-hidden ${className}`}>
      <span className="bg-white" />
      <span className="bg-[#d52b1e]" />
      <span className="absolute left-0 top-0 h-[7px] w-[7px] bg-[#0039a6]">
        <span className="absolute left-1/2 top-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </span>
    </span>
  );
}

/** Green field, the golden arrowhead edged in white, the red triangle edged in black — drawn as SVG because the two nested triangles are the flag. */
export function GuyanaFlag({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 14" className={`inline-block h-3.5 w-5 shrink-0 ${className}`}>
      <rect width="20" height="14" fill="#009e49" />
      <path d="M0 0 20 7 0 14Z" fill="#fff" />
      <path d="M0 0.9 18 7 0 13.1Z" fill="#fcd116" />
      <path d="M0 0 10 7 0 14Z" fill="#000" />
      <path d="M0 1 8.6 7 0 13Z" fill="#ce1126" />
    </svg>
  );
}

/** Three horizontal bands, light blue–white–light blue, with the Sun of May at the centre (drawn as a plain gold disc at this size). */
export function ArgentinaFlag({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 14" className={`inline-block h-3.5 w-5 shrink-0 ${className}`}>
      <rect width="20" height="14" fill="#74acdf" />
      <rect y="4.67" width="20" height="4.67" fill="#fff" />
      <circle cx="10" cy="7" r="1.5" fill="#f6b40e" stroke="#85340a" strokeWidth="0.25" />
    </svg>
  );
}

/** A white cross quartering blue (top-left, bottom-right) and red (top-right, bottom-left); the coat of arms is too small to draw at this size. */
export function DominicanRepublicFlag({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 14" className={`inline-block h-3.5 w-5 shrink-0 ${className}`}>
      <rect width="20" height="14" fill="#fff" />
      <rect width="8.5" height="5.5" fill="#002d62" />
      <rect x="11.5" width="8.5" height="5.5" fill="#ce1126" />
      <rect y="8.5" width="8.5" height="5.5" fill="#ce1126" />
      <rect x="11.5" y="8.5" width="8.5" height="5.5" fill="#002d62" />
    </svg>
  );
}

/** Yellow (half), blue, red horizontal bands; the coat of arms is a small disc at this size. */
export function EcuadorFlag({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 14" className={`inline-block h-3.5 w-5 shrink-0 ${className}`}>
      <rect width="20" height="7" fill="#ffdd00" />
      <rect y="7" width="20" height="3.5" fill="#034ea2" />
      <rect y="10.5" width="20" height="3.5" fill="#ed1c24" />
      <circle cx="10" cy="7" r="1.6" fill="#ffdd00" stroke="#7a5310" strokeWidth="0.3" />
    </svg>
  );
}

/** Quartered: white with a blue star, red; blue, white with a red star. */
export function PanamaFlag({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 14" className={`inline-block h-3.5 w-5 shrink-0 ${className}`}>
      <rect width="20" height="14" fill="#fff" />
      <rect x="10" width="10" height="7" fill="#da121a" />
      <rect y="7" width="10" height="7" fill="#072357" />
      <circle cx="5" cy="3.5" r="1.4" fill="#072357" />
      <circle cx="15" cy="10.5" r="1.4" fill="#da121a" />
    </svg>
  );
}

/** Red, yellow, green horizontal bands; the coat of arms is too small to draw at this size. */
export function BoliviaFlag({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 14" className={`inline-block h-3.5 w-5 shrink-0 ${className}`}>
      <rect width="20" height="14" fill="#d52b1e" />
      <rect y="4.67" width="20" height="4.67" fill="#f9e300" />
      <rect y="9.33" width="20" height="4.67" fill="#007934" />
    </svg>
  );
}

export function CountryFlag({ country, className = "" }: { country: string; className?: string }) {
  if (country === "Mexico") return <MexicoFlag className={className} />;
  if (country === "Brazil") return <BrazilFlag className={className} />;
  if (country === "Colombia") return <ColombiaFlag className={className} />;
  if (country === "Peru") return <PeruFlag className={className} />;
  if (country === "Chile") return <ChileFlag className={className} />;
  if (country === "Guyana") return <GuyanaFlag className={className} />;
  if (country === "Argentina") return <ArgentinaFlag className={className} />;
  if (country === "Dominican Republic") return <DominicanRepublicFlag className={className} />;
  if (country === "Ecuador") return <EcuadorFlag className={className} />;
  if (country === "Panama") return <PanamaFlag className={className} />;
  if (country === "Bolivia") return <BoliviaFlag className={className} />;
  return null;
}
