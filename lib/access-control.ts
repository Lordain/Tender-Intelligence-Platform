import type { TenderStatus } from "@/types/tender";

export type ViewerRole = "guest" | "trial" | "free" | "subscriber";
export type SubscriptionPlan = "basic" | "professional" | "enterprise" | null;
export type BillingInterval = "monthly" | "semiannual" | "annual";
export type AccessPromptKind = "login" | "subscription";

export type ViewerEntitlement = {
  role: ViewerRole;
  plan: SubscriptionPlan;
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

export const TRIAL_DAYS = 5;
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

/**
 * A tender nobody can bid on any more.
 *
 * `submission_closed` is derived, not stored — deriveTenderStatus() sets it
 * once the deadline day has passed (lib/tender-status.ts), so a tender with
 * no deadline at all never reaches it and stays behind the paywall, which is
 * the conservative direction.
 */
const CLOSED_TENDER_STATUSES: readonly TenderStatus[] = ["submission_closed", "awarded", "cancelled"];

export function isClosedTender(status: TenderStatus): boolean {
  return CLOSED_TENDER_STATUSES.includes(status);
}

/** How much analysis a tender has, counted from the rows an admin has logged. */
export type AnalysisPresence = {
  /** qualifications + experienceRequirements + requiredDocuments — all one table. */
  requirementCount: number;
  riskCount: number;
};

/**
 * Whether there is anything on this page worth reading.
 *
 * Same test the awarded-tender visibility rule has used since 2026-09-05
 * (fetchAllTendersFromDb): at least one requirement or one risk logged. The
 * title, the summary and the schedule arrive with the import and are true of
 * every row; requirements and risks only exist once someone — the extraction
 * pipeline or an admin — has actually read the bid documents. That is the
 * line between a page and a stub.
 */
export function hasPublishedAnalysis(counts: AnalysisPresence): boolean {
  return counts.requirementCount > 0 || counts.riskCount > 0;
}

/**
 * A closed tender that is worth showing the world.
 *
 * Opening closed tenders to everyone was a deliberate product decision (user,
 * 2026-09-15): the deadline has passed, so the page is worth nothing to a
 * subscriber and is the entire pitch to someone who has never heard of this
 * platform — a Chinese engineering company in Mexico searching a project name
 * lands on the full Chinese analysis and knows within seconds what this is.
 *
 * The analysis half of the test is the correction that followed (2026-09-16).
 * The user had been deleting tenders the moment they closed, and the reason
 * was not tidiness: 因为缺少大量标书分析内容. A closed tender with no analysis
 * logged is an empty page, and a few hundred empty pages under real project
 * names is worse for both search and the brand than not being indexed at all.
 * So the rule that already governed awarded tenders now governs every closed
 * one: no analysis, no public page — which means the ones that DO have
 * analysis no longer have to be deleted to keep the stubs out.
 *
 * Both parameters required rather than optional on purpose: they decide who
 * may read a page, so tsc naming every call site is the point. A default
 * would be the same "protection nobody remembered to opt into" that cost 13
 * bid deadlines.
 */
export function isPublicArchive(status: TenderStatus, counts: AnalysisPresence): boolean {
  return isClosedTender(status) && hasPublishedAnalysis(counts);
}

export function canOpenTenderDetail(
  role: ViewerRole,
  isHomepageFreePreview: boolean,
  /** isPublicArchive() — closed AND carrying analysis. */
  isArchived: boolean,
): boolean {
  if (isArchived) return true;
  // Homepage previews are a visitor acquisition surface, not a permanent
  // free-account entitlement. Once the three-day trial has ended, every
  // project detail requires a subscription — including a slug that happens
  // to be featured on the homepage.
  return role === "trial" || role === "subscriber" || (role === "guest" && isHomepageFreePreview);
}

/** Search, filters, pagination and saves share the same list-page paywall. */
export function canInteractWithTenderList(role: ViewerRole): boolean {
  return role === "trial" || role === "subscriber";
}

export function tenderDetailPrompt(role: ViewerRole): AccessPromptKind {
  return role === "guest" ? "login" : "subscription";
}

export function canConfigureEmailNotifications(role: ViewerRole): boolean {
  return role === "trial" || role === "subscriber";
}
