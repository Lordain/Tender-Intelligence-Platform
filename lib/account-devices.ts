/**
 * How many browsers may be signed into one account at the same time.
 *
 * Per auth user, not per subscription: an enterprise owner and its two
 * members each hold their own account, so a 3-seat enterprise gets 3 × this.
 *
 * Chosen with no real usage data behind it — every account in analytics on
 * 2026-09-13 was one of our own QA logins. Treat it as a starting number to
 * revise once real accounts have a month of history (the queries for that
 * are in scripts/report-account-sharing.ts), not as a measured threshold.
 */
export const MAX_ACTIVE_DEVICES = 3;

export type DeviceRow = {
  device_id: string;
  last_seen_at: string;
};

/**
 * Which devices have to go so that at most `limit` remain.
 *
 * Least-recently-seen first, and the caller's own device is never among
 * them: it has just checked in, so it holds the newest last_seen_at. That
 * ordering is the whole safety property — the account that adds a fourth
 * browser loses its stalest one, never the one in front of the person.
 *
 * Ties are broken by device_id so the result is deterministic; two rows can
 * share a timestamp when a page fires several requests at once, and an
 * arbitrary pick there would evict different devices on retries.
 */
export function devicesToRevoke(active: DeviceRow[], limit = MAX_ACTIVE_DEVICES): string[] {
  if (limit < 1) return active.map((device) => device.device_id);
  const ordered = [...active].sort((a, b) => {
    const byRecency = Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at);
    if (byRecency !== 0 && Number.isFinite(byRecency)) return byRecency;
    return a.device_id.localeCompare(b.device_id);
  });
  return ordered.slice(limit).map((device) => device.device_id);
}

/**
 * Shorten a User-Agent to something the owner can recognise in a list.
 *
 * Not analytics and not a fingerprint: the one job is letting someone say
 * "that Windows Chrome is the office machine I no longer use". Anything
 * unrecognised is reported as such rather than guessed at.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua.trim()) return "未知设备";

  const os = /iPhone|iPad/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /Mac OS X|Macintosh/i.test(ua) ? "Mac"
    : /Windows/i.test(ua) ? "Windows"
    : /Linux/i.test(ua) ? "Linux"
    : null;

  // Order matters: Edge and Opera both carry "Chrome" in their UA, and
  // Chrome carries "Safari". Checking the more specific name first is what
  // keeps an Edge user from being told they are on Chrome.
  const browser = /Edg\//i.test(ua) ? "Edge"
    : /OPR\/|Opera/i.test(ua) ? "Opera"
    : /MicroMessenger/i.test(ua) ? "微信"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari"
    : null;

  if (os && browser) return `${os} · ${browser}`;
  return os ?? browser ?? "未知设备";
}
