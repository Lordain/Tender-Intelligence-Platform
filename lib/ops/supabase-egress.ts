/**
 * The platform's own count of the bytes it reads from Supabase (user,
 * 2026-11-03: A. 平台自己记账). The project was restricted on 2026-10-30 for
 * 14.9 GB of egress against the Free plan's 5 GB, and nothing had warned
 * before it happened. Supabase's Management API has no egress endpoint (its
 * dashboard reads an internal one), so the platform counts what it receives
 * instead and a daily check (app/api/cron/supabase-egress-check) emails the
 * admin well before the quota.
 *
 * What is counted: every response the server-side clients receive — the
 * service-role client (app and scripts, lib/supabase/admin-client.ts), the
 * signed-in user's client (lib/supabase/server-client.ts) and the session
 * refresh in proxy.ts. Not counted: the browser's own calls (sign-in,
 * session refresh), which are small. So the count runs a little LOW, and the
 * thresholds below are set with that in mind.
 *
 * How a response is measured: its Content-Length when the server sends one;
 * otherwise the body is counted as it streams through, which counts the
 * decompressed bytes and so runs HIGH for a gzipped response. Either way it is
 * a triage figure for an alert, not the number Supabase bills.
 *
 * Totals go to public.supabase_egress_daily (migration 0071) through
 * add_supabase_egress(), batched per tick and sent with a plain fetch so the
 * count never counts itself. A failed write is dropped silently: the count is
 * never allowed to break the request it is measuring.
 */

/** The Free plan's egress per billing cycle, in decimal GB as Supabase's usage page shows it. */
export const FREE_PLAN_EGRESS_BYTES = 5 * 1_000_000_000;

/** The organisation's billing cycle starts on this day of the month (Supabase usage page: 04 Oct 2026 - 04 Nov 2026). */
export const BILLING_CYCLE_DAY = 4;

/** Shares of the cycle's quota that send an email, each once per cycle. */
export const CYCLE_ALERT_SHARES = [0.6, 0.8, 1] as const;

/**
 * One day above this sends an email too. 5 GB over 30 days is ~167 MB a day;
 * 300 MB is a day that would use the month up in under three weeks.
 */
export const DAILY_ALERT_BYTES = 300 * 1_000_000;

/** YYYY-MM-DD in UTC. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first day of the billing cycle `now` falls in, as YYYY-MM-DD. */
export function billingCycleStart(now: Date, cycleDay: number = BILLING_CYCLE_DAY): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = now.getUTCDate() >= cycleDay ? new Date(Date.UTC(year, month, cycleDay)) : new Date(Date.UTC(year, month - 1, cycleDay));
  return utcDay(start);
}

type Pending = Map<string, { bytes: number; requests: number }>;

const pending: Pending = new Map();
let flushScheduled = false;
let exitHookInstalled = false;

function add(bytes: number, now: Date = new Date()) {
  const day = utcDay(now);
  const entry = pending.get(day) ?? { bytes: 0, requests: 0 };
  entry.bytes += bytes;
  entry.requests += 1;
  pending.set(day, entry);
  scheduleFlush();
}

/** The flush target, from the environment; null where the service key is absent (the count is then simply not kept). */
function target(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

function scheduleFlush() {
  if (!exitHookInstalled && typeof process !== "undefined" && typeof process.once === "function") {
    exitHookInstalled = true;
    // A script (scripts/*.ts) ends without another tick to flush on.
    process.once("beforeExit", () => void flushSupabaseEgress());
  }
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    void flushSupabaseEgress();
  }, 0);
}

/** Sends what has been counted so far. Exported for the tests and for a caller that wants to be sure before exiting. */
export async function flushSupabaseEgress(fetchImpl: typeof fetch = globalThis.fetch): Promise<void> {
  if (pending.size === 0) return;
  const batch = [...pending.entries()];
  pending.clear();
  const to = target();
  if (!to) return;
  await Promise.all(
    batch.map(async ([day, { bytes, requests }]) => {
      try {
        await fetchImpl(`${to.url}/rest/v1/rpc/add_supabase_egress`, {
          method: "POST",
          headers: { apikey: to.key, Authorization: `Bearer ${to.key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ p_day: day, p_bytes: Math.round(bytes), p_requests: requests }),
        });
      } catch {
        // Never let the count break anything; a lost batch only under-counts.
      }
    }),
  );
}

/** What has been counted and not yet sent — for the tests. */
export function pendingSupabaseEgress(): { day: string; bytes: number; requests: number }[] {
  return [...pending.entries()].map(([day, entry]) => ({ day, ...entry }));
}

/**
 * A fetch for the Supabase clients' `global.fetch` that counts each response's
 * size. The response the caller gets is the same one, or — when its size has
 * to be measured as it streams — an identical copy whose body is the same
 * bytes.
 */
export function countingFetch(baseFetch: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length >= 0 && response.headers.has("content-length")) {
      add(length);
      return response;
    }
    if (!response.body) {
      add(0);
      return response;
    }
    let bytes = 0;
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
      flush() {
        add(bytes);
      },
    });
    return new Response(response.body.pipeThrough(counter), { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

export type EgressDayRow = { day: string; bytes: number };

export type EgressAssessment = {
  cycleStart: string;
  cycleBytes: number;
  /** cycleBytes as a share of FREE_PLAN_EGRESS_BYTES. */
  cycleShare: number;
  /** The most recent complete day, and what it used. */
  lastDay: string;
  lastDayBytes: number;
  /** The highest CYCLE_ALERT_SHARES reached, or null. */
  cycleLevel: (typeof CYCLE_ALERT_SHARES)[number] | null;
  dailyOver: boolean;
};

/** Reads the counted rows against the cycle and the daily line. Pure, for the tests. */
export function assessEgress(rows: EgressDayRow[], now: Date): EgressAssessment {
  const cycleStart = billingCycleStart(now);
  const today = utcDay(now);
  const lastDay = utcDay(new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000));
  const cycleBytes = rows.filter((row) => row.day >= cycleStart && row.day <= today).reduce((sum, row) => sum + Number(row.bytes), 0);
  const lastDayBytes = Number(rows.find((row) => row.day === lastDay)?.bytes ?? 0);
  const cycleShare = cycleBytes / FREE_PLAN_EGRESS_BYTES;
  const reached = CYCLE_ALERT_SHARES.filter((share) => cycleShare >= share);
  return {
    cycleStart,
    cycleBytes,
    cycleShare,
    lastDay,
    lastDayBytes,
    cycleLevel: reached.length > 0 ? reached[reached.length - 1] : null,
    dailyOver: lastDayBytes > DAILY_ALERT_BYTES,
  };
}

/** "1.23 GB" / "456 MB", decimal as Supabase shows them. */
export function formatEgressBytes(bytes: number): string {
  return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(2)} GB` : `${Math.round(bytes / 1_000_000)} MB`;
}
