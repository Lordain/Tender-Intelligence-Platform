import type { TenderStatus } from "@/types/tender";

export type ViewerRole = "guest" | "trial" | "free" | "subscriber";
export type SubscriptionPlan = "basic" | "professional" | "enterprise" | null;
export type BillingInterval = "monthly" | "semiannual" | "annual";
export type AccessPromptKind = "login" | "subscription";

export type ViewerEntitlement = {
  role: ViewerRole;
  plan: SubscriptionPlan;
  selectedCountry: string | null;
  trialEndsAt: string | null;
  subscriptionOwnerUserId: string | null;
  isEnterpriseOwner: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval: BillingInterval | null;
  /** The subscription is inside the short retry grace window after a failed payment. */
  paymentPastDue: boolean;
  /**
   * Whether this subscription is attached to a billing agreement that can
   * renew it. Nothing in this codebase advances current_period_end — only a
   * payment provider's webhook can — so without a link the period end is
   * simply when access stops, and the account page must not imply otherwise.
   */
  hasBillingLink: boolean;
};

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  monthly: "按月",
  semiannual: "半年",
  annual: "年度",
};

export const TRIAL_DAYS = 7;
export const PAYMENT_GRACE_DAYS = 3;

export type SubscriptionEntitlementCandidate = {
  status: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  created_at?: string | null;
};

/**
 * Collapse Stripe's eight subscription statuses onto the four this database
 * stores — deliberately conservatively.
 *
 * Only Stripe's own `past_due` earns the three-day grace window. The other
 * non-live statuses look similar but mean the opposite of "still recovering":
 * `incomplete` and `incomplete_expired` are subscriptions whose FIRST payment
 * never succeeded, `unpaid` is what Stripe leaves behind once it has given up
 * retrying, and `paused` collects no money by design. Mapping any of them to
 * `past_due` — which a permissive fallback used to do — hands three days of
 * full access to an account that has paid nothing, repeatable by opening
 * another Checkout. So anything that is not explicitly live or explicitly
 * recovering is treated as cancelled.
 *
 * Takes a plain string rather than Stripe.Subscription.Status so the rule
 * lives beside the entitlement logic it feeds, and stays testable without the
 * Stripe SDK.
 */
export function subscriptionStatusFromStripe(status: string): "active" | "trialing" | "past_due" | "cancelled" {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due") return "past_due";
  return "cancelled";
}

export function isSubscriptionEntitled(
  status: string,
  currentPeriodStart: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now = Date.now(),
): boolean {
  if (status === "past_due") {
    // Legacy rows cannot prove when the failed renewal cycle began. Fail
    // closed instead of accidentally granting an open-ended grace period.
    if (!currentPeriodStart) return false;
    const startedAt = new Date(currentPeriodStart).getTime();
    return Number.isFinite(startedAt) && now < startedAt + PAYMENT_GRACE_DAYS * 86_400_000;
  }
  if (status !== "active" && status !== "trialing") return false;
  if (!currentPeriodEnd) return true;
  const endsAt = new Date(currentPeriodEnd).getTime();
  return Number.isFinite(endsAt) && endsAt >= now;
}

/**
 * Pick one deterministic billing truth when historical or concurrent Stripe
 * activity has left more than one candidate row for an account. Paid and
 * trialing rows always outrank a past-due grace row; within the same status
 * class, the newest database row wins.
 */
export function selectPreferredSubscription<T extends SubscriptionEntitlementCandidate>(
  subscriptions: readonly T[],
  now = Date.now(),
): T | undefined {
  const statusPriority = (status: string) => status === "active" || status === "trialing" ? 1 : 0;
  const createdAt = (value: string | null | undefined) => {
    if (!value) return Number.NEGATIVE_INFINITY;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
  };

  return subscriptions
    .filter((subscription) => isSubscriptionEntitled(
      subscription.status,
      subscription.current_period_start,
      subscription.current_period_end,
      now,
    ))
    .sort((left, right) => {
      const priorityDifference = statusPriority(right.status) - statusPriority(left.status);
      return priorityDifference || createdAt(right.created_at) - createdAt(left.created_at);
    })[0];
}

// "suspended" is deliberately not here: a paused tender may resume, so it is
// not written off as closed (migration 0057).
const CLOSED_TENDER_STATUSES: readonly TenderStatus[] = ["submission_closed", "awarded", "cancelled", "deserted"];

export function isClosedTender(status: TenderStatus): boolean {
  return CLOSED_TENDER_STATUSES.includes(status);
}

/**
 * Days after the submission deadline at which a tender's full detail opens
 * to every visitor, signed in or not (user, 2026-09-26: 项目截止 3 天后，
 * 免费公开完整项目信息，以增加我们被找到的可能性).
 *
 * A closed tender is worth nothing to a paying member as an opportunity, but
 * its full page — requirements, documents, risks, key dates — is exactly the
 * content search engines and AI assistants index and cite. The three days
 * leave room for a late extension to land in the data before the page opens.
 */
export const PUBLIC_AFTER_DEADLINE_DAYS = 3;

/**
 * What the release counts from. Calendar days (YYYY-MM-DD) throughout.
 *
 * The submission deadline when there is one. An awarded or cancelled tender
 * with none (见招标文件, or never captured) counts from the day it ended
 * instead (user, 2026-09-26: 一样规则): its award date, else `closedOn`, the
 * platform day its status changed to awarded/cancelled (tender_status_history).
 */
export type TenderReleaseInput = {
  submissionDeadline?: string | null;
  status?: TenderStatus;
  awardDate?: string | null;
  closedOn?: string | null;
};

const ENDED_STATUSES: readonly TenderStatus[] = ["awarded", "cancelled", "deserted"];

/**
 * Whether the release has opened this tender to everyone.
 *
 * `today` is the platform day (lib/tender-status.ts's platformDay).
 * Calendar arithmetic, not instants — the same reason platformDay exists.
 * An open tender with no deadline never releases: there is no date to count
 * from.
 */
export function isReleasedAfterDeadline(input: TenderReleaseInput, today: string | null): boolean {
  const release = tenderReleaseDay(input);
  return Boolean(release && today && today >= release);
}

/** Whether the release needs `closedOn`, the one input that costs a query. */
export function releaseNeedsClosedOn(input: TenderReleaseInput): boolean {
  return !calendarDay(input.submissionDeadline) && ENDED_STATUSES.includes(input.status as TenderStatus) && !calendarDay(input.awardDate);
}

/** The calendar day the release opens a tender, or null when there is nothing to count from. */
export function tenderReleaseDay(input: TenderReleaseInput): string | null {
  // A paused tender is not over: its deadline usually moves when it resumes,
  // so it is never released while paused, whatever the old deadline says.
  if (input.status === "suspended") return null;
  const deadline = calendarDay(input.submissionDeadline);
  if (deadline) return addDays(deadline, PUBLIC_AFTER_DEADLINE_DAYS);
  if (!input.status || !ENDED_STATUSES.includes(input.status)) return null;
  const ended = calendarDay(input.awardDate) ?? calendarDay(input.closedOn);
  return ended ? addDays(ended, PUBLIC_AFTER_DEADLINE_DAYS) : null;
}

function calendarDay(value: string | null | undefined): string | null {
  return /^\d{4}-\d{2}-\d{2}/.exec(value ?? "")?.[0] ?? null;
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/**
 * Full analysis remains protected even though every tender now has an
 * indexable public summary page. The homepage's selected free cards are the
 * only exception, and only when the visitor actually follows that entry.
 */
export function canViewTenderProtectedContent(
  role: ViewerRole,
  isHomepageFreePreview: boolean,
  enteredFromHomepage: boolean,
): boolean {
  return role === "trial" || role === "subscriber" || (isHomepageFreePreview && enteredFromHomepage);
}

/**
 * Public discovery (search, filters, views and pagination) is open to every
 * visitor. Only account-specific list tools — saving a tender or a search —
 * remain an entitled feature.
 */
/**
 * Whether this visit spends one of a free account's five monthly detail views.
 *
 * The homepage free preview is a preview for EVERYONE, and
 * canViewTenderProtectedContent above already says so — it grants the same
 * slug to a guest and to a free account alike (both pinned in
 * scripts/test-access-control.ts). The detail page then re-decided the free
 * case on its own and overwrote that answer with the monthly quota, which
 * charged a view for the preview and, once the five were gone, refused it.
 * The result was that registering made a reader strictly worse off: the very
 * same tender stayed open to an anonymous visitor and closed to a member.
 *
 * So the rule lives here, next to the rule it must not contradict, rather
 * than being re-derived at the call site.
 */
export function shouldClaimFreeTenderView(
  role: ViewerRole,
  isHomepageFreePreview: boolean,
  enteredFromHomepage: boolean,
): boolean {
  if (role !== "free") return false;
  return !(isHomepageFreePreview && enteredFromHomepage);
}

export function canUseTenderListMemberFeatures(role: ViewerRole): boolean {
  return role === "trial" || role === "subscriber";
}

export function canViewCountry(entitlement: ViewerEntitlement, country: string): boolean {
  if (entitlement.role === "trial") return true;
  if (entitlement.role !== "subscriber") return false;
  return entitlement.plan !== "basic" || entitlement.selectedCountry === country;
}

export function canExportTenders(entitlement: ViewerEntitlement): boolean {
  return entitlement.role === "subscriber" && (entitlement.plan === "professional" || entitlement.plan === "enterprise");
}

export function tenderDetailPrompt(role: ViewerRole): AccessPromptKind {
  return role === "guest" ? "login" : "subscription";
}

export function canConfigureEmailNotifications(role: ViewerRole): boolean {
  return role !== "guest";
}
