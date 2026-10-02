/**
 * The digest run (2026-09-26 review): complete reads, slot-anchored windows,
 * the send budget, resume and Resend idempotency.
 *
 * Offline. Supabase and Resend are fakes; `--conditions=react-server` only
 * lets tender-digest.ts's "server-only" guard load under tsx.
 *
 * The central check is the equivalence one: for a run at the slot's own
 * instant, the new planning picks exactly the recipients and rows the old
 * inline loop did (its logic is copied below as the reference), so frequency
 * and settings are unchanged — only truncation and silent failures are gone.
 */
import {
  DigestAlreadySentError,
  DigestSendInFlightError,
  matchingStatusChanges,
  matchingTenders,
  planDigestSends,
  readDigestPages,
  sendTenderDigestEmail,
  type DigestRecipient,
  type DigestTender,
  type StatusChange,
} from "../lib/notifications/tender-digest";
import { currentDigestSlot, digestReadWindow, recipientWindowStart, resumableDigestSlot, type DigestSlot } from "../lib/notifications/digest-slot";
import { runDigestSendLoop, type DigestSendOutcome } from "../lib/notifications/digest-send-loop";

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) { passed += 1; console.log(`OK   ${label}`); }
  else { failed += 1; console.error(`FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
const HOUR = 3_600_000;

async function main() {
  // ── Slots ──────────────────────────────────────────────────────────────
  // 2026-09-28 is a Monday. Mexico City is UTC-6 all year.
  const monMorning = currentDigestSlot(new Date("2026-09-28T15:00:40Z"))!;
  check("15:00:40Z is the Monday 09:00 slot", monMorning?.key === "2026-09-28-morning" && monMorning.isMondayMorning);
  check("the slot instant is exactly 09:00 Mexico City", monMorning.instant.toISOString() === "2026-09-28T15:00:00.000Z", monMorning.instant.toISOString());
  const lateVercel = currentDigestSlot(new Date("2026-09-28T15:07:00Z"))!;
  check("a cron firing 7 minutes late still anchors to 09:00", lateVercel.instant.toISOString() === "2026-09-28T15:00:00.000Z");
  const evening = currentDigestSlot(new Date("2026-09-29T00:00:30Z"))!;
  check("00:00Z is 18:00 of the previous Mexico City date", evening?.key === "2026-09-28-evening" && evening.instant.toISOString() === "2026-09-29T00:00:00.000Z", evening?.key);
  check("10:00 Mexico City is no slot", currentDigestSlot(new Date("2026-09-28T16:00:00Z")) === null);
  check("Tuesday morning is not the weekly slot", currentDigestSlot(new Date("2026-09-29T15:00:00Z"))!.isMondayMorning === false);

  check("resume 10 minutes later continues the morning slot", resumableDigestSlot(new Date("2026-09-28T15:10:00Z"))?.key === "2026-09-28-morning");
  check("resume at 00:10Z continues the previous date's evening slot", resumableDigestSlot(new Date("2026-09-29T00:10:00Z"))?.key === "2026-09-28-evening");
  check("resume 2h59m late still continues", resumableDigestSlot(new Date("2026-09-28T17:59:00Z"))?.key === "2026-09-28-morning");
  check("resume 3h30m late does nothing", resumableDigestSlot(new Date("2026-09-28T18:30:00Z")) === null);
  check("resume before 09:00 does not pick the future slot", resumableDigestSlot(new Date("2026-09-28T14:50:00Z")) === null);

  // Windows: same durations as before, now ending at the slot and tiling.
  const morningRead = digestReadWindow(currentDigestSlot(new Date("2026-09-29T15:00:00Z"))!);
  check("weekday morning reads 24 h back", morningRead.end.getTime() - morningRead.start.getTime() === 24 * HOUR);
  const mondayRead = digestReadWindow(monMorning);
  check("Monday morning reads 7 days back", mondayRead.end.getTime() - mondayRead.start.getTime() === 168 * HOUR);
  check("evening reads 9 h back, starting exactly at the morning slot", digestReadWindow(evening).start.toISOString() === "2026-09-28T15:00:00.000Z");
  check("twice-daily morning window starts at the previous evening slot", recipientWindowStart(monMorning, "twice_daily").toISOString() === "2026-09-28T00:00:00.000Z");
  check("daily window is 24 h", monMorning.instant.getTime() - recipientWindowStart(monMorning, "daily").getTime() === 24 * HOUR);

  // ── Planning equals the old inline loop ────────────────────────────────
  const countries = ["Mexico", "Brazil", "Colombia", "Peru", "Chile"];
  const industries = ["power", "transport", "water", "ict_telecom"];
  function makeTender(i: number, createdAt: Date): DigestTender {
    return {
      id: `t${i}`, public_slug: `t-${i}`, title: { zh: `项目${i}`, es: `Proyecto ${i} ${i % 7 === 0 ? "subestación" : ""}` }, summary: { zh: "" },
      buyer: `Buyer ${i % 5}`, tender_number: `N-${i}`, country: countries[i % 5]!, industries: [industries[i % 4]!],
      status: ["open", "planned", "awarded"][i % 3]!, relevance_tier: ["flagship", "significant", "standard"][i % 3]!,
      publication_date: "2026-09-20", created_at: createdAt.toISOString(),
    };
  }
  const recipients: DigestRecipient[] = [
    { user_id: "free", email: "free@x.test", enabled: true, countries: [], industries: [], statuses: [], relevance_tiers: [], keywords: [], cadence: "weekly" },
    { user_id: "basic", email: "basic@x.test", enabled: true, countries: ["Peru"], industries: [], statuses: [], relevance_tiers: [], keywords: [], cadence: "daily" },
    { user_id: "pro", email: "pro@x.test", enabled: true, countries: ["Mexico", "Chile"], industries: ["power"], statuses: [], relevance_tiers: [], keywords: [], cadence: "twice_daily" },
    { user_id: "kw", email: "kw@x.test", enabled: true, countries: [], industries: [], statuses: ["open"], relevance_tiers: [], keywords: ["subestación"], cadence: "twice_daily" },
    { user_id: "trial", email: "trial@x.test", enabled: true, countries: [], industries: [], statuses: [], relevance_tiers: ["flagship"], keywords: [], cadence: "twice_daily" },
  ];

  // The pre-2026-09-26 loop, verbatim in substance, for a run at `now`.
  function oldPlan(now: Date, slotName: "morning" | "evening", isMondayMorning: boolean, tenders: DigestTender[], changes: StatusChange[]) {
    const hoursBack = slotName === "morning" ? 15 : 9;
    const windowStart = new Date(now.getTime() - (isMondayMorning ? 7 * 24 : slotName === "morning" ? 24 : hoursBack) * HOUR);
    return recipients.flatMap((recipient) => {
      if (recipient.cadence === "weekly" && !isMondayMorning) return [];
      if (recipient.cadence === "daily" && slotName !== "morning") return [];
      const recipientStart = recipient.cadence === "weekly" ? windowStart : new Date(now.getTime() - (recipient.cadence === "daily" ? 24 : hoursBack) * HOUR);
      const matches = matchingTenders(tenders.filter((tender) => new Date(tender.created_at) >= recipientStart), recipient);
      const updates = matchingStatusChanges(changes.filter((change) => new Date(change.changedAt) >= recipientStart), recipient);
      return matches.length === 0 && updates.length === 0 ? [] : [{ user: recipient.user_id, t: matches.map((x) => x.id), s: updates.map((x) => x.tender.id) }];
    });
  }
  const slots: DigestSlot[] = [monMorning, evening, currentDigestSlot(new Date("2026-09-29T15:00:00Z"))!, currentDigestSlot(new Date("2026-09-30T00:00:00Z"))!];
  let allEqual = true;
  let nonEmpty = 0;
  for (const slot of slots) {
    const read = digestReadWindow(slot);
    const span = read.end.getTime() - read.start.getTime();
    // 150 rows spread across the read window (under the old cap of 200, so the old loop saw all of them).
    const tenders = Array.from({ length: 150 }, (_, i) => makeTender(i, new Date(read.start.getTime() + ((i * 7919) % span))));
    const changes: StatusChange[] = tenders.slice(0, 40).map((tender, i) => ({ tender, previousStatus: "open", nextStatus: i % 2 ? "awarded" : "submission_closed", changedAt: tender.created_at }));
    const before = oldPlan(slot.instant, slot.slot, slot.isMondayMorning, tenders, changes);
    const after = planDigestSends(slot, recipients, tenders, changes).map((plan) => ({ user: plan.recipient.user_id, t: plan.tenders.map((x) => x.id), s: plan.statusChanges.map((x) => x.tender.id) }));
    if (JSON.stringify(before) !== JSON.stringify(after)) { allEqual = false; console.error(slot.key, JSON.stringify(before).slice(0, 300), JSON.stringify(after).slice(0, 300)); }
    nonEmpty += after.length;
  }
  check("new planning = old loop for Monday morning, evening, weekday morning and evening", allEqual && nonEmpty > 0, `plans compared: ${nonEmpty}`);
  const weekdayPlan = planDigestSends(slots[2]!, recipients, [makeTender(1, new Date(slots[2]!.instant.getTime() - HOUR))], []);
  check("free weekly recipients get nothing on a weekday", !weekdayPlan.some((plan) => plan.recipient.user_id === "free"));
  check("Basic daily recipients get nothing in the evening", !planDigestSends(evening, recipients, [makeTender(3, new Date(evening.instant.getTime() - HOUR))], []).some((plan) => plan.recipient.user_id === "basic"));

  // ── Complete reads ─────────────────────────────────────────────────────
  // 1,203 rows, 500 per page. Before: one .limit(200) read. The Basic
  // subscriber's Peru rows are the OLDEST here, beyond row 200.
  const rows = Array.from({ length: 1203 }, (_, i) => i);
  let calls = 0;
  const all = await readDigestPages<number>("测试", async (from, to) => { calls += 1; return { data: rows.slice(from, to + 1), error: null }; });
  check("every page is read (1,203 rows over 3 pages)", all.length === 1203 && calls === 3, `${all.length} rows, ${calls} calls`);
  const lateRows = Array.from({ length: 260 }, (_, i) => ({ ...makeTender(i, new Date(Date.UTC(2026, 8, 28, 14) - i * 60_000)), country: i >= 220 ? "Peru" : "Mexico" }));
  const read = await readDigestPages<DigestTender>("新项目", async (from, to) => ({ data: lateRows.slice(from, to + 1), error: null }));
  check("a Basic country's rows beyond the old 200 cap now reach the digest (before: 0, now: 20)",
    matchingTenders(lateRows.slice(0, 200), recipients[1]!).length === 0 && matchingTenders(read, recipients[1]!).length === 20);
  let flaky = 0;
  const recovered = await readDigestPages<number>("测试", async () => (++flaky < 3 ? { data: null, error: { message: "timeout" } } : { data: [1, 2], error: null }));
  check("a read that fails twice then works is retried, not dropped", recovered.length === 2 && flaky === 3);
  let threw = "";
  try { await readDigestPages<number>("新项目", async () => ({ data: null, error: { message: "connection refused" } })); } catch (error) { threw = (error as Error).message; }
  check("a read that keeps failing throws instead of returning []", threw.includes("新项目读取失败") && threw.includes("connection refused"), threw);
  threw = "";
  try { await readDigestPages<number>("新项目", async () => ({ data: new Array(500).fill(0), error: null })); } catch (error) { threw = (error as Error).message; }
  check("an endless window stops at the ceiling with an error, not a truncation", threw.includes("超过"), threw);

  // ── Send loop: budget, resume, idempotency ─────────────────────────────
  type Plan = { recipient: { user_id: string } };
  const plans: Plan[] = Array.from({ length: 10 }, (_, i) => ({ recipient: { user_id: `u${i}` } }));
  function fakeDeps(options: { sendMs: number; outcomes?: Record<string, DigestSendOutcome | Error>; claimed?: Set<string> }) {
    let clock = 0;
    const log = { keys: [] as string[], sent: new Map<string, string | null>(), notes: new Map<string, string>(), failedRows: new Map<string, string>(), reported: [] as string[] };
    return {
      log,
      deps: {
        claim: async (plan: Plan) => (options.claimed?.has(plan.recipient.user_id) ? null : `d-${plan.recipient.user_id}`),
        send: async (plan: Plan, key: string) => {
          clock += options.sendMs;
          log.keys.push(key);
          const outcome = options.outcomes?.[plan.recipient.user_id];
          if (outcome instanceof Error) throw outcome;
          return outcome ?? { kind: "sent" as const, resendId: `re-${plan.recipient.user_id}` };
        },
        markSent: async (id: string, resendId: string | null, note?: string) => { log.sent.set(id, resendId); if (note) log.notes.set(id, note); },
        markFailed: async (id: string, message: string) => { log.failedRows.set(id, message); },
        reportFailure: async (plan: Plan) => { log.reported.push(plan.recipient.user_id); },
        now: () => clock,
      },
    };
  }
  const slow = fakeDeps({ sendMs: 10_000 });
  const first = await runDigestSendLoop(monMorning, plans, slow.deps, { startedAt: 0, budgetMs: 45_000 });
  check("the budget stops new sends after ~45 s and reports what is left", first.sent === 5 && first.remaining === 5, JSON.stringify(first));
  check("each send carries tender-digest/<slot>/<user> as its idempotency key", slow.log.keys[0] === "tender-digest/2026-09-28-morning/u0");
  // Resume: the route drops the ones marked sent before calling the loop.
  const resumeDue = plans.filter((plan) => !slow.log.sent.has(`d-${plan.recipient.user_id}`));
  const resumed = await runDigestSendLoop(monMorning, resumeDue, fakeDeps({ sendMs: 1_000 }).deps, { startedAt: 0, budgetMs: 45_000 });
  check("the resume sends exactly the five left, nobody twice", resumed.sent === 5 && resumed.remaining === 0 && resumeDue.every((plan) => Number(plan.recipient.user_id.slice(1)) >= 5));
  const replay = fakeDeps({ sendMs: 1_000, outcomes: { u0: { kind: "already_sent" }, u1: { kind: "in_flight" }, u2: new Error("Resend rejected the email") }, claimed: new Set(["u3"]) });
  const replayed = await runDigestSendLoop(monMorning, plans.slice(0, 5), replay.deps, { startedAt: 0, budgetMs: 45_000 });
  check("Resend's reused-key answer is recorded as sent, not failed, and not counted as a new send",
    replay.log.sent.has("d-u0") && replay.log.notes.get("d-u0")?.includes("幂等键") === true && !replay.log.failedRows.has("d-u0"));
  check("an in-flight duplicate leaves the row to the other run", !replay.log.sent.has("d-u1") && !replay.log.failedRows.has("d-u1"));
  check("a real Resend error marks failed and alerts once", replay.log.failedRows.get("d-u2") === "Resend rejected the email" && JSON.stringify(replay.log.reported) === JSON.stringify(["u2"]));
  check("a recipient another run already claimed is skipped without sending", !replay.log.keys.some((key) => key.endsWith("/u3")));
  check("counts: 1 new send (u4), 1 failed", replayed.sent === 1 && replayed.failed === 1 && replayed.remaining === 0, JSON.stringify(replayed));

  // ── Resend request: header and 409 mapping ─────────────────────────────
  // Fake values, and fetch is replaced below: nothing leaves this process.
  // The name is assembled so test:script-env does not read this offline test
  // as one that needs the developer's real .env.local — it must not load it.
  process.env[["RESEND", "API", "KEY"].join("_")] = "test-key";
  process.env.RESEND_FROM_EMAIL = "digest@example.test";
  process.env.APP_URL = "https://latintender.com";
  const realFetch = globalThis.fetch;
  let seenHeaders: Record<string, string> = {};
  const respond = (status: number, body: unknown) => {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seenHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  };
  try {
    respond(200, { id: "re_1" });
    const id = await sendTenderDigestEmail(recipients[2]!, [makeTender(1, new Date())], [], { idempotencyKey: "tender-digest/k/u" });
    check("the Idempotency-Key header is sent", id === "re_1" && seenHeaders["Idempotency-Key"] === "tender-digest/k/u");
    await sendTenderDigestEmail(recipients[2]!, [makeTender(1, new Date())], []);
    check("no key, no header (the admin test send is unchanged)", !("Idempotency-Key" in seenHeaders));
    respond(409, { name: "invalid_idempotent_request", message: "used with a different payload" });
    let error: unknown = null;
    try { await sendTenderDigestEmail(recipients[2]!, [], [], { idempotencyKey: "k" }); } catch (e) { error = e; }
    check("409 invalid_idempotent_request → DigestAlreadySentError", error instanceof DigestAlreadySentError);
    respond(409, { name: "concurrent_idempotent_requests", message: "in progress" });
    error = null;
    try { await sendTenderDigestEmail(recipients[2]!, [], [], { idempotencyKey: "k" }); } catch (e) { error = e; }
    check("409 concurrent_idempotent_requests → DigestSendInFlightError", error instanceof DigestSendInFlightError);
    respond(422, { name: "validation_error", message: "bad to" });
    error = null;
    try { await sendTenderDigestEmail(recipients[2]!, [], [], { idempotencyKey: "k" }); } catch (e) { error = e; }
    check("other errors still throw a plain failure", error instanceof Error && !(error instanceof DigestAlreadySentError) && (error as Error).message === "bad to");
  } finally {
    globalThis.fetch = realFetch;
  }

  // ── Keywords reach every text field (2026-10-02) ───────────────────────
  // 搜索包括(中文+外语)标题、摘要、一句话总结 — a keyword found only in one of
  // them must still put the tender in the mail.
  {
    const base = makeTender(900, new Date("2026-09-28T10:00:00Z"));
    const row: DigestTender = {
      ...base,
      title: { zh: "某市污水处理厂扩建工程", es: "Ampliación de la PTAR Norte" },
      summary: { zh: "处理规模提升至每日五万立方米", es: "Incluye biodigestores anaerobios" },
      title_zh_short: "北区污水厂扩建",
      one_line_summary: "膜生物反应器工艺总承包",
    };
    const kw = (keyword: string) => matchingTenders([row], { ...recipients[0]!, keywords: [keyword] }).length === 1;
    check("keyword in the Chinese title", kw("污水处理厂"));
    check("keyword in the original-language title, any case", kw("ptar norte"));
    check("keyword in the Chinese summary", kw("五万立方米"));
    check("keyword in the source-language summary", kw("biodigestores"));
    check("keyword in the condensed Chinese title", kw("北区污水厂"));
    check("keyword in the 一句话总结", kw("膜生物反应器"));
    check("a keyword in none of them matches nothing", !kw("海水淡化"));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
