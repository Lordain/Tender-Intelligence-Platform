"use client";

import { useRef, type ReactNode } from "react";

/**
 * Links a country on the coverage map to its row in the list: pointing at
 * either lights both (components/home/CoverageMap.tsx). Event delegation over
 * server-rendered children, so the map outlines never enter the page's
 * JavaScript — this only toggles a class on the elements that share a
 * data-country.
 */
export function CoverageMapHighlight({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef<string | null>(null);

  function set(country: string | null) {
    const root = ref.current;
    if (!root || active.current === country) return;
    root.querySelectorAll(".is-active").forEach((element) => element.classList.remove("is-active"));
    active.current = country;
    if (!country) return;
    root.querySelectorAll(`[data-country="${CSS.escape(country)}"]`).forEach((element) => element.classList.add("is-active"));
  }

  const pick = (target: EventTarget | null) => (target instanceof Element ? target.closest("[data-country]")?.getAttribute("data-country") ?? null : null);

  return (
    <div
      ref={ref}
      className={className}
      onPointerOver={(event) => set(pick(event.target))}
      onPointerLeave={() => set(null)}
      onFocus={(event) => set(pick(event.target))}
      onBlur={() => set(null)}
    >
      {children}
    </div>
  );
}
