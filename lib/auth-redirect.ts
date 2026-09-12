/**
 * Restrict post-auth redirects to paths inside this site.
 *
 * Guards against open-redirect via protocol-relative resolution, not just
 * a literal `//` prefix: browsers (and Next.js's client router, which
 * resolves `next` via `new URL(next, currentLocation)`) treat a SINGLE
 * backslash right after the leading "/" the same as a second "/" — e.g.
 * `new URL("/\\evil.com", "https://oursite.com/login").host` is
 * `"evil.com"`, confirmed against Node's WHATWG URL implementation
 * (2026-09-05). A prior version of this check only rejected a literal
 * double-backslash and missed that single-backslash case entirely. The
 * same parser also strips ASCII tab/newline/CR before resolving, so
 * `"/\t/evil.com"` collapses to `"//evil.com"` after that stripping and
 * needs to be caught too — hence stripping those characters here before
 * validating, rather than checking the raw input.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;

  const stripped = value.replace(/[\t\n\r]/g, "").trim();
  if (!stripped.startsWith("/") || stripped.startsWith("//") || stripped.includes("\\")) {
    return fallback;
  }

  return stripped;
}

export function currentPathWithSearch(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function loginPathFor(nextPath: string): string {
  return `/login?next=${encodeURIComponent(safeNextPath(nextPath))}`;
}
