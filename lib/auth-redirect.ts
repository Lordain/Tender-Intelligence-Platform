/** Restrict post-auth redirects to paths inside this site. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\\\")) {
    return fallback;
  }

  return value;
}

export function currentPathWithSearch(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function loginPathFor(nextPath: string): string {
  return `/login?next=${encodeURIComponent(safeNextPath(nextPath))}`;
}
