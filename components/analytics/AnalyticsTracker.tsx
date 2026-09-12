"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackAnalyticsEvent } from "@/lib/analytics-client";

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/admin") || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;
    trackAnalyticsEvent("page_view", { path: pathname });
  }, [pathname]);

  return null;
}
