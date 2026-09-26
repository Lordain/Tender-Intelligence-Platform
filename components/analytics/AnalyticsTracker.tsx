"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackAnalyticsEvent } from "@/lib/analytics-client";

/**
 * How this page load was reached, sent with its first page view only: the
 * referring site's host (never its path or query) and any utm_* tags on the
 * landing URL. Later client-side navigations are the same visit, so they
 * carry nothing. See lib/analytics-source.ts for what the server keeps.
 */
function entryProperties(): Record<string, unknown> {
  const properties: Record<string, unknown> = { entry: true };
  try {
    if (document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.origin !== window.location.origin) properties.referrer = referrer.hostname;
    }
  } catch {
    // An unparsable referrer is treated as none.
  }
  const search = new URLSearchParams(window.location.search);
  for (const [param, key] of [["utm_source", "utmSource"], ["utm_medium", "utmMedium"], ["utm_campaign", "utmCampaign"]] as const) {
    const value = search.get(param);
    if (value) properties[key] = value.slice(0, 100);
  }
  return properties;
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/admin") || lastTrackedPath.current === pathname) return;
    const isEntry = lastTrackedPath.current === null;
    lastTrackedPath.current = pathname;
    trackAnalyticsEvent("page_view", { path: pathname, properties: isEntry ? entryProperties() : {} });
  }, [pathname]);

  return null;
}
