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

export function CountryFlag({ country, className = "" }: { country: string; className?: string }) {
  if (country === "Mexico") return <MexicoFlag className={className} />;
  if (country === "Brazil") return <BrazilFlag className={className} />;
  if (country === "Colombia") return <ColombiaFlag className={className} />;
  if (country === "Peru") return <PeruFlag className={className} />;
  if (country === "Chile") return <ChileFlag className={className} />;
  return null;
}
