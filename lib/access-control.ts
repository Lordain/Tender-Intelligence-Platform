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

export const TRIAL_DAYS = 7;
export const PAYMENT_GRACE_DAYS = 3;

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

export function canOpenTenderDetail(role: ViewerRole, isHomepageFreePreview: boolean): boolean {
  return isHomepageFreePreview || role === "trial" || role === "subscriber";
}

export function tenderDetailPrompt(role: ViewerRole): AccessPromptKind {
  return role === "guest" ? "login" : "subscription";
}

export function canConfigureEmailNotifications(role: ViewerRole): boolean {
  return role === "trial" || role === "subscriber";
}
