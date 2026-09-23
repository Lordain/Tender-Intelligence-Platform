export type DigestCadence = "weekly" | "daily" | "twice_daily";

export function digestCadence(plan: string | null, isEnterpriseMember: boolean, isTrial: boolean): DigestCadence {
  if (plan === "basic") return "daily";
  if (plan === "professional" || plan === "enterprise" || isEnterpriseMember || isTrial) return "twice_daily";
  return "weekly";
}
