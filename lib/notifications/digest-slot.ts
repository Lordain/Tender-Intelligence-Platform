/**
 * Which digest slot a run belongs to, and the time windows that slot covers.
 *
 * The windows are anchored to the slot's own instant — 09:00 or 18:00 in
 * Mexico City — not to the moment the run happened to start. Two reasons
 * (2026-09-26):
 *
 * - A resumed run (GitHub Actions calls again ten minutes later, see
 *   .github/workflows/digest-resume.yml) must rebuild the SAME mail the first
 *   run would have sent, or Resend's idempotency check rejects it as a
 *   different payload under a reused key.
 * - Consecutive slots now tile exactly: the evening window starts at 09:00:00
 *   where the morning one ended, instead of at "a few seconds after whenever
 *   Vercel fired the morning cron", which left gaps and overlaps of seconds.
 *
 * The durations themselves are unchanged: morning looks back 15 hours for
 * twice-daily recipients, evening 9, a Basic (daily) recipient 24, and the
 * free weekly digest 7 days on Monday morning.
 *
 * Pure (no server-only import) so scripts/test-digest-run.ts can check it.
 */

import type { DigestCadence } from "./digest-cadence";

export type DigestSlotName = "morning" | "evening";

export type DigestSlot = {
  slot: DigestSlotName;
  /** YYYY-MM-DD-morning|evening, Mexico City date — tender_digest_deliveries.slot_key. */
  key: string;
  /** The slot's own instant: 09:00 or 18:00 America/Mexico_City. */
  instant: Date;
  isMondayMorning: boolean;
};

const SLOT_HOURS: Record<DigestSlotName, number> = { morning: 9, evening: 18 };
const HOUR_MS = 60 * 60 * 1000;
/** How long after its instant a slot can still be resumed — well short of the next slot, 9 hours later. */
export const DIGEST_RESUME_WINDOW_MS = 3 * HOUR_MS;

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

function mexicoWallClock(date: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")), month: Number(value("month")), day: Number(value("day")),
    hour: Number(value("hour")), minute: Number(value("minute")), weekday: value("weekday"),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The UTC instant of a Mexico City wall-clock time on the given calendar day.
 * Derived from the zone's offset at `reference` rather than hard-coding -06:00;
 * Mexico City has had no DST since 2022, so the offset a few hours away is the
 * same one.
 */
function mexicoInstant(reference: Date, year: number, month: number, day: number, hour: number): Date {
  const wall = mexicoWallClock(reference);
  const referenceMinute = Math.floor(reference.getTime() / 60_000) * 60_000;
  const offset = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - referenceMinute;
  return new Date(Date.UTC(year, month - 1, day, hour) - offset);
}

function slotAt(reference: Date, year: number, month: number, day: number, slot: DigestSlotName): DigestSlot {
  const instant = mexicoInstant(reference, year, month, day, SLOT_HOURS[slot]);
  return {
    slot,
    key: `${year}-${pad(month)}-${pad(day)}-${slot}`,
    instant,
    isMondayMorning: slot === "morning" && mexicoWallClock(instant).weekday === "Mon",
  };
}

/** The slot a scheduled run belongs to: the one whose hour it is in Mexico City, else null. */
export function currentDigestSlot(now: Date): DigestSlot | null {
  const wall = mexicoWallClock(now);
  if (wall.hour === SLOT_HOURS.morning) return slotAt(now, wall.year, wall.month, wall.day, "morning");
  if (wall.hour === SLOT_HOURS.evening) return slotAt(now, wall.year, wall.month, wall.day, "evening");
  return null;
}

/**
 * The slot a resume call continues: the latest slot that has started and is
 * at most DIGEST_RESUME_WINDOW_MS old. Null outside that, so a resume that
 * GitHub delays by hours does nothing rather than mailing a stale window.
 */
export function resumableDigestSlot(now: Date): DigestSlot | null {
  const wall = mexicoWallClock(now);
  const yesterday = mexicoWallClock(new Date(now.getTime() - 24 * HOUR_MS));
  const candidates = [
    slotAt(now, wall.year, wall.month, wall.day, "evening"),
    slotAt(now, wall.year, wall.month, wall.day, "morning"),
    slotAt(now, yesterday.year, yesterday.month, yesterday.day, "evening"),
  ];
  return candidates.find((candidate) => {
    const age = now.getTime() - candidate.instant.getTime();
    return age >= 0 && age <= DIGEST_RESUME_WINDOW_MS;
  }) ?? null;
}

/** The widest window any recipient of this slot needs — what is read from the database once per run. */
export function digestReadWindow(slot: DigestSlot): { start: Date; end: Date } {
  const hours = slot.isMondayMorning ? 7 * 24 : slot.slot === "morning" ? 24 : 9;
  return { start: new Date(slot.instant.getTime() - hours * HOUR_MS), end: slot.instant };
}

/** Where one recipient's window starts. Ends at slot.instant for everyone. */
export function recipientWindowStart(slot: DigestSlot, cadence: DigestCadence): Date {
  if (cadence === "weekly") return digestReadWindow(slot).start;
  const hours = cadence === "daily" ? 24 : slot.slot === "morning" ? 15 : 9;
  return new Date(slot.instant.getTime() - hours * HOUR_MS);
}

/** Whether this recipient gets mail in this slot at all — the unchanged frequency rules. */
export function isDueInSlot(slot: DigestSlot, cadence: DigestCadence): boolean {
  if (cadence === "weekly") return slot.isMondayMorning;
  if (cadence === "daily") return slot.slot === "morning";
  return true;
}
