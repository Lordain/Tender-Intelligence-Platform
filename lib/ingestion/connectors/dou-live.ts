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

export type DouError = Error & { douUnreachable?: true };

export function isDouUnreachable(err: unknown): boolean {
  return err instanceof Error && (err as DouError).douUnreachable === true;
}

function unreachable(message: string): DouError {
  const error = new Error(message) as DouError;
  error.douUnreachable = true;
  return error;
}

/**
 * The most recent weekday on or before `from`.
 *
 * The DOU publishes on business days. Asking for a Sunday returns an empty
 * edition, which reads as "this source has nothing" — the same class of wrong
 * answer a guessed slug gives, and the reason `scripts/capture-dou.ts` has
 * this function too.
 *
 * It does NOT know Brazilian public holidays. A holiday edition is genuinely
 * empty, and the report says how many notices it read, so an empty day is
 * visible rather than silent.
 */
export function lastWeekday(from: Date = new Date()): Date {
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
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
  if ("error" in page) throw unreachable(`DOU ${day} ${section} 取不到：${page.error}\n  ${url}`);
  const edition = parseDouEdition(page.html);
  if (edition === null) {
    // The page came back whole and carried no payload. That is a template
    // change at the National Press, not an empty edition — and the two need
    // opposite responses, so they are never reported as the same thing.
    throw unreachable(
      `DOU ${day} ${section} 页面取到了，但里面没有带 jsonArray 的 JSON 块 —— in.gov.br 多半改了页面结构\n  ${url}`,
    );
  }
  return { day, section, url, edition };
}
