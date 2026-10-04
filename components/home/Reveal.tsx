"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Fades its content up into place the first time it scrolls into view
 * (user, 2026-10-04: homepage animation — 按你的建议做，但是不动Hero).
 *
 * The content is server-rendered visible and stays visible unless three
 * things hold once the page is running: script is on, the visitor has not
 * asked for reduced motion, and the element starts below the fold. Only then
 * is it hidden, and it is shown again the moment it nears the viewport. So a
 * crawler, a no-script reader and anyone scrolled past it always get the
 * content, and nothing on screen at load ever blinks out.
 *
 * The state lives on the element (data-reveal), not in React state: it is a
 * one-way switch the CSS in app/globals.css reads, and children that want a
 * second beat (the Why us step icons) key off the same attribute.
 */
export function Reveal({
  children,
  className,
  delayMs = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger within a group: the n-th card gets n × a step. */
  delayMs?: number;
  as?: "div" | "li" | "article" | "section";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    element.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.dataset.reveal = "shown";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const style = { "--reveal-delay": `${delayMs}ms` } as CSSProperties;
  return (
    // The ref type is the common HTMLElement; every allowed tag is one.
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  );
}
