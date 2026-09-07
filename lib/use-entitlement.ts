"use client";

import { useEffect, useState } from "react";
import type { ViewerEntitlement } from "@/lib/access-control";

export function useEntitlement(enabled: boolean) {
  const [entitlement, setEntitlement] = useState<ViewerEntitlement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/account/entitlement").then((response) => response.json()).then(setEntitlement).catch(() => setEntitlement(null));
  }, [enabled]);
  return entitlement;
}
