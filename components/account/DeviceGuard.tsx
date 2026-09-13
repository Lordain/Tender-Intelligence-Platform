"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDeviceId } from "@/lib/device-id";
import { useUser } from "@/lib/auth";

/** Long enough to stay quiet, short enough that an evicted tab notices. */
const HEARTBEAT_MS = 5 * 60_000;

/**
 * Announces this browser to the device cap and signs out when it loses its
 * place (lib/account-devices.ts, migration 0046).
 *
 * Mounted in the root layout so the cap is enforced wherever someone
 * actually browses, not only on the three pages that happen to read an
 * entitlement. It does nothing at all for signed-out visitors.
 */
export function DeviceGuard() {
  const { user, logout } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    const deviceId = getDeviceId();
    if (!deviceId) return;

    let cancelled = false;

    async function beat() {
      try {
        const response = await fetch("/api/account/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data.evicted) return;
        // Signed in on a fourth browser: this one lost its place. Say why —
        // an unexplained logout reads as the site being broken, and the
        // reason is the one thing that turns it into a reason to buy a seat.
        await logout();
        router.push("/login?reason=device-limit");
      } catch {
        // Offline or a transient failure. The next beat re-checks; a network
        // blip must never sign anyone out.
      }
    }

    void beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [logout, router, user]);

  return null;
}
