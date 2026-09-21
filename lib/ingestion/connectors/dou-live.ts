import { blockPageReason, pageTitle, visibleText } from "@/lib/ingestion/block-page";
import { describeFetchFailure } from "@/lib/fetch-failure";
import { douEditionUrl, parseDouEdition, type DouEdition, type DouSection } from "@/lib/ingestion/dou-edition";

/**
 * Fetches one day of the Diário Oficial da União.
 *
 * ── Why this source, and why it is not a duplicate of PNCP ────────────────
 *
 * Brazilian law requires every federal notice, edital and award to appear in
 * the DOU, which makes it the one Brazilian source that is complete by
 * statute rather than by an agency's choice to publish. Three things reach it
 * and never reach PNCP:
 *
 *   - **Concessions.** A concession is not a *contratação* under Lei
 *     14.133/2021, so PNCP never carries one. 2026's federal calendar is ~100
 *     assets at ~R$247bn — airports, port terminals, highways, rail — and
 *     none of it is in the portal this platform already reads.
 *   - **Seção 1 acts.** The decree or portaria that authorises an auction
 *     appears weeks before any notice does.
 *   - **State enterprises** that run their own procurement — Petrobras,
 *     Correios, the Companhias Docas — publish here regardless.
 *
 * ── The egress split, which is the whole reason this shape exists ─────────
 *
 * `in.gov.br` answered the GitHub runner and Vercel on 2026-09-19 (135KB, 57
 * links) while closing the socket mid-read on the user's laptop, and it is
 * outside this sandbox's allowlist. So a fetch failure here means "run it
 * somewhere else", not "the DOU is empty", and the caller is told which.
 *
 * Read-only. No Supabase, no model calls.
 */

const HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "User-Agent":
    "TenderIntelligencePlatform/1.0 (+https://github.com/lordain/tender-intelligence-platform; open-data ingestion)",
} as const;

/** An edition is 2.5MB of JSON on a normal weekday, and in.gov.br has closed the socket mid-read before. */
const TIMEOUT_MS = 60_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2_000, 5_000];

/**
 * Why a day produced no edition, and why the two are never one error.
 *
 *   - `unreachable` — the page did not arrive. Refused, cut mid-read, blocked.
 *     Fix: run it somewhere in.gov.br answers.
 *   - `no-payload` — the page arrived whole and carried no `jsonArray`. That
 *     is NOT one thing: the edition may not be published yet (run #13,
 *     2026-09-21 00:41 UTC — Brasília was still on Sunday evening), the day
 *     may be a public holiday, or the National Press may have changed its
 *     template. Only the last is a bug in this repo, and the first two are
 *     resolved by asking for an earlier weekday — which is what
 *     fetchLatestDouEdition does before anyone is told a template changed.
 *
 * Reporting a not-yet-published edition as a template change is the same
 * class of mistake as reporting an unreachable source as an empty one, and
 * this file already had a comment saying so about the other pair.
 */
export type DouFailureKind = "unreachable" | "no-payload";
export type DouError = Error & { douFailure?: DouFailureKind; douUnreachable?: true };

export function douFailureKind(err: unknown): DouFailureKind | undefined {
  return err instanceof Error ? (err as DouError).douFailure : undefined;
}

/** Any failure this module raises on purpose — a caller that catches this has handled the source, not swallowed a bug. */
export function isDouFailure(err: unknown): boolean {
  return douFailureKind(err) !== undefined;
}

/** Strictly the network verdict. A page that arrived and carried nothing is not this. */
export function isDouUnreachable(err: unknown): boolean {
  return douFailureKind(err) === "unreachable";
}

function douError(kind: DouFailureKind, message: string): DouError {
  const error = new Error(message) as DouError;
  error.douFailure = kind;
  if (kind === "unreachable") error.douUnreachable = true;
  return error;
}

/**
 * Today's calendar day in Brasília, which is the only "today" the DOU has.
 *
 * Measured, not assumed: run #13 asked for `21-09-2026` at 00:41 UTC on the
 * Monday and in.gov.br returned a page with no payload, because in Brasília it
 * was still 21:41 on Sunday and Monday's edition did not exist. The date came
 * from `new Date().getUTCDate()`, so every run in the 00:00–03:00 UTC window
 * asks the National Press for tomorrow.
 *
 * `Intl` with the zone name rather than a hardcoded −3: Brazil dropped DST in
 * 2019, and a constant offset would be a decision by an act of Congress away
 * from being wrong silently.
 */
const BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `2026-09-21T00:41Z` → `2026-09-20`, because that is the day it is in Brazil. */
export function brasiliaDay(from: Date = new Date()): string {
  return BRASILIA.format(from);
}

/**
 * The most recent weekday on or before `from`, counted in Brasília.
 *
 * The DOU publishes on business days. Asking for a Sunday returns an empty
 * edition, which reads as "this source has nothing" — the same class of wrong
 * answer a guessed slug gives, and the reason `scripts/capture-dou.ts` has
 * this function too.
 *
 * Two things it still does NOT know, both left to fetchLatestDouEdition rather
 * than guessed at here:
 *
 *   - Brazilian public holidays, which have no ordinary edition.
 *   - The hour the day's edition actually goes up. Brasília's Monday begins
 *     at 03:00 UTC; the Monday edition does not. Walking backwards until a
 *     payload appears settles that without anyone having to write down a
 *     publication time that the National Press never promised.
 */
export function lastWeekday(from: Date = new Date()): Date {
  const [year, month, date] = brasiliaDay(from).split("-").map(Number);
  const day = new Date(Date.UTC(year, month - 1, date));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() - 1);
  return day;
}

/** The last `count` weekdays, most recent first. */
export function recentWeekdays(count: number, from: Date = new Date()): string[] {
  const days: string[] = [];
  const cursor = lastWeekday(from);
  while (days.length < count) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return days;
}

async function getHtml(url: string): Promise<{ html: string } | { error: string }> {
  let last = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 5_000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: "follow", cache: "no-store" });
      const text = await response.text();
      if (!response.ok) {
        last = `${response.status} ${response.statusText}${pageTitle(text) ? ` — ${pageTitle(text)}` : ""}`;
        if (!RETRYABLE_STATUSES.has(response.status)) return { error: last };
        continue;
      }
      const blocked = blockPageReason(text);
      if (blocked !== null) return { error: `200 但是拦截页：「${blocked}」` };
      if (visibleText(text).length < 200) {
        last = `200 但正文只有 ${visibleText(text).length} 字`;
        continue;
      }
      return { html: text };
    } catch (err) {
      // The known failure mode on the laptop is the socket closing mid-read,
      // which arrives here as a body error rather than as a status.
      last = describeFetchFailure(err).slice(0, 200);
    } finally {
      clearTimeout(timer);
    }
  }
  return { error: last || "取不到" };
}

export type DouDayResult = { day: string; section: DouSection; url: string; edition: DouEdition };

export async function fetchDouEdition(section: DouSection, day: string): Promise<DouDayResult> {
  const url = douEditionUrl(section, day);
  const page = await getHtml(url);
  if ("error" in page) throw douError("unreachable", `DOU ${day} ${section} 取不到：${page.error}\n  ${url}`);
  const edition = parseDouEdition(page.html);
  if (edition === null) {
    // The page came back whole and carried no payload. Three different things
    // look exactly like this — not published yet, a holiday, or a template
    // change — so this says what it saw and refuses to name the cause. One
    // caller up, fetchLatestDouEdition tells them apart by asking for earlier
    // weekdays, which is the only way to tell them apart without inventing a
    // publication schedule the National Press never published.
    throw douError(
      "no-payload",
      `DOU ${day} ${section} 页面取到了，但里面没有带 jsonArray 的 JSON 块 —— 这一天要么还没出版、要么是节假日、要么 in.gov.br 改了页面结构\n  ${url}`,
    );
  }
  return { day, section, url, edition };
}

export type DouSkippedDay = { day: string; kind: DouFailureKind; why: string };
export type DouLatestResult = DouDayResult & { skipped: DouSkippedDay[] };

/**
 * The most recent edition that actually exists, walking backwards from today.
 *
 * This is what every caller wanting "the latest DOU" should use, and it exists
 * because run #13 proved a single day cannot answer the question. Asking for
 * one day and getting no payload is ambiguous between three causes; asking for
 * `maxBack` consecutive weekdays and getting no payload on all of them is not.
 * The verdict is then earned rather than asserted:
 *
 *   - a payload on any day        → that is the edition, and `skipped` says
 *                                   which days were passed over and why, so a
 *                                   holiday never disappears silently
 *   - every day unreachable       → the network, unchanged from before
 *   - every day reachable, none
 *     carrying a payload          → NOW it is fair to say the template changed
 *
 * `maxBack` of 3 spans a long weekend plus the publication gap. Raising it
 * hides a real outage behind old data, which is why it is small.
 */
export async function fetchLatestDouEdition(
  section: DouSection,
  options: { from?: Date; maxBack?: number } = {},
): Promise<DouLatestResult> {
  const maxBack = Math.max(1, Math.trunc(options.maxBack ?? 3));
  const days = recentWeekdays(maxBack, options.from ?? new Date());
  const skipped: DouSkippedDay[] = [];
  for (const day of days) {
    try {
      const result = await fetchDouEdition(section, day);
      return { ...result, skipped };
    } catch (err) {
      const kind = douFailureKind(err);
      if (kind === undefined) throw err;
      skipped.push({ day, kind, why: err instanceof Error ? err.message : String(err) });
    }
  }
  const allUnreachable = skipped.every((s) => s.kind === "unreachable");
  throw douError(
    allUnreachable ? "unreachable" : "no-payload",
    allUnreachable
      ? `DOU ${section}：往前数 ${days.length} 个工作日（${days.join("、")}）一天都没取到页面`
      : `DOU ${section}：往前数 ${days.length} 个工作日（${days.join("、")}）页面都取到了，但都没有 jsonArray —— 到这一步才能说 in.gov.br 改了页面结构`,
  );
}
