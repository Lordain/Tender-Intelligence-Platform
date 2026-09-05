"use client";

import { useEffect, useRef } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics-client";

export function TenderViewTracker({ tenderId }: { tenderId: string }) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackAnalyticsEvent("tender_open", { tenderId });
  }, [tenderId]);

  return null;
}
