/**
 * The digest's send loop, with everything it touches passed in — the database
 * writes, the send itself and the clock — so scripts/test-digest-run.ts can
 * drive the cases that matter against fakes: the time budget cutting a run
 * short, a resume skipping who was already mailed, and a retried send that
 * Resend recognises by its Idempotency-Key.
 *
 * app/api/cron/tender-digest/route.ts wires in the real Supabase and Resend.
 */

import type { DigestSlot } from "./digest-slot";

/** One recipient's mail for the slot; the loop only needs to know whose it is. */
export type DigestPlanLike = { recipient: { user_id: string } };

/** What the send reported: sent, sent by an earlier attempt, or someone else is sending it right now. */
export type DigestSendOutcome = { kind: "sent"; resendId: string | null } | { kind: "already_sent" } | { kind: "in_flight" };

export type DigestSendLoopDeps<P extends DigestPlanLike> = {
  /** Mark this recipient 'processing' for the slot; null when another run owns or finished it. */
  claim: (plan: P) => Promise<string | null>;
  send: (plan: P, idempotencyKey: string) => Promise<DigestSendOutcome>;
  markSent: (deliveryId: string, resendId: string | null, note?: string) => Promise<void>;
  markFailed: (deliveryId: string, message: string) => Promise<void>;
  reportFailure: (plan: P, message: string) => Promise<void>;
  now: () => number;
};

export type DigestSendLoopResult = { sent: number; failed: number; remaining: number; recovered: string[] };

export function digestIdempotencyKey(slot: DigestSlot, userId: string): string {
  return `tender-digest/${slot.key}/${userId}`;
}

export async function runDigestSendLoop<P extends DigestPlanLike>(
  slot: DigestSlot,
  due: P[],
  deps: DigestSendLoopDeps<P>,
  options: { startedAt: number; budgetMs: number },
): Promise<DigestSendLoopResult> {
  let sent = 0;
  let failed = 0;
  let index = 0;
  const recovered: string[] = [];
  for (; index < due.length; index += 1) {
    // Checked before each send, never during one: a send that has started is
    // allowed to finish, so the budget has to leave room for the slowest one.
    if (deps.now() - options.startedAt > options.budgetMs) break;
    const plan = due[index]!;
    const deliveryId = await deps.claim(plan);
    if (!deliveryId) continue;

    try {
      const outcome = await deps.send(plan, digestIdempotencyKey(slot, plan.recipient.user_id));
      if (outcome.kind === "in_flight") continue;
      if (outcome.kind === "already_sent") {
        await deps.markSent(deliveryId, null, "已由本时段较早的一次发送送出（Resend 幂等键），未重复发送");
      } else {
        await deps.markSent(deliveryId, outcome.resendId);
        sent += 1;
      }
      recovered.push(plan.recipient.user_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await deps.markFailed(deliveryId, message.slice(0, 500));
      failed += 1;
      await deps.reportFailure(plan, message);
    }
  }
  return { sent, failed, remaining: due.length - index, recovered };
}
