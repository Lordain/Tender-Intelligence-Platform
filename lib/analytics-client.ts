"use client";

export type AnalyticsEventType =
  | "page_view"
  | "tender_open"
  | "filter_apply"
  | "tender_save"
  | "tender_unsave";

const SESSION_KEY = "tender-intelligence:analytics-session";

function getSessionId(): string | null {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export function trackAnalyticsEvent(
  eventType: AnalyticsEventType,
  options: { tenderId?: string; path?: string; properties?: Record<string, unknown> } = {},
) {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return;
  const sessionId = getSessionId();
  if (!sessionId) return;

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({
      eventType,
      sessionId,
      path: options.path ?? window.location.pathname,
      tenderId: options.tenderId,
      properties: options.properties ?? {},
    }),
  }).catch(() => {
    // Analytics must never interrupt the product experience.
  });
}
