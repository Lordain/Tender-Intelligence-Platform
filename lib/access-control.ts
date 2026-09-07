export type ViewerRole = "guest" | "trial" | "free" | "subscriber";
export type SubscriptionPlan = "basic" | "professional" | "enterprise" | null;
export type AccessPromptKind = "login" | "subscription";

export type ViewerEntitlement = {
  role: ViewerRole;
  plan: SubscriptionPlan;
  trialEndsAt: string | null;
  subscriptionOwnerUserId: string | null;
  isEnterpriseOwner: boolean;
};

export const TRIAL_DAYS = 7;

export function canOpenTenderDetail(role: ViewerRole, isHomepageFreePreview: boolean): boolean {
  return isHomepageFreePreview || role === "trial" || role === "subscriber";
}

export function tenderDetailPrompt(role: ViewerRole): AccessPromptKind {
  return role === "guest" ? "login" : "subscription";
}

export function canConfigureEmailNotifications(role: ViewerRole): boolean {
  return role === "trial" || role === "subscriber";
}
