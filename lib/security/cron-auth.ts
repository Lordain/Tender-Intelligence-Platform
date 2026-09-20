import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * The Bearer check every app/api/cron/* route shares.
 *
 * One copy rather than three identical `authorized()` functions, so the next
 * cron route inherits the check instead of re-deriving it — and so a fix like
 * this one lands everywhere at once.
 *
 * Two properties worth stating, because both are easy to lose in a rewrite:
 *
 * - It FAILS CLOSED. No CRON_SECRET configured means nobody is authorized,
 *   not everybody. These routes send email to real customers and delete rows;
 *   a missing env var must never be the thing that opens them.
 * - It compares in constant time. The previous `===` returned as soon as two
 *   bytes differed, so the time it took leaked how long a correct prefix was,
 *   and a secret can be recovered a byte at a time from enough samples. That
 *   attack is impractical here — HTTPS, a serverless cold-start budget and
 *   network jitter all swamp a few nanoseconds — but "impractical" is a
 *   property of today's deployment, not of the code, and the constant-time
 *   version costs nothing.
 *
 * timingSafeEqual throws on a length mismatch, so the lengths are compared
 * first. That does leak the LENGTH of the secret, which is not a useful thing
 * to learn: it is set by whoever deploys, not guessed at.
 */
export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const presented = request.headers.get("authorization");
  if (!presented) return false;

  const expectedBuffer = Buffer.from(`Bearer ${secret}`, "utf8");
  const presentedBuffer = Buffer.from(presented, "utf8");
  if (expectedBuffer.length !== presentedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, presentedBuffer);
}
