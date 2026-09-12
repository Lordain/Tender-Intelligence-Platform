import type { NextRequest } from "next/server";

/**
 * Per-instance sliding-window counters, extracted from bot-protection.ts
 * (2026-09-06) so the public write endpoint can reuse the same mechanism
 * rather than growing a second copy of it.
 *
 * Honest about what this is: the counters live in this process's memory,
 * so they reset on redeploy/cold start and are not shared across
 * serverless instances. It will not stop a distributed flood. It does
 * blunt the common case — one script hammering one endpoint from one
 * address — without adding a Redis/Upstash dependency that hasn't been
 * provisioned for this project. If a real distributed abuse case ever
 * shows up, this is the seam to swap for a shared store.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();

  /** True when this call puts the key OVER the limit. */
  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((ts) => now - ts < windowMs);
    recent.push(now);
    hits.set(key, recent);

    if (hits.size > 5000) {
      for (const [k, timestamps] of hits) {
        if (timestamps.every((ts) => now - ts >= windowMs)) hits.delete(k);
      }
    }

    return recent.length > max;
  };
}
