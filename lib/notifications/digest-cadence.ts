export type DigestCadence = "weekly" | "daily" | "twice_daily";

export function digestCadence(plan: string | null, isEnterpriseMember: boolean, isTrial: boolean): DigestCadence {
  if (plan === "basic") return "daily";
  if (plan === "professional" || plan === "enterprise" || isEnterpriseMember || isTrial) return "twice_daily";
  return "weekly";
}

/**
 * The countries a 基础个人版 digest covers: the plan's own countries, narrowed
 * to the ones the subscriber ticked on /notifications. Nothing ticked — or
 * only countries outside the plan — means all of the plan's countries.
 */
export function basicDigestCountries(planCountries: readonly string[], ticked: readonly string[] | null | undefined): string[] {
  const narrowed = (ticked ?? []).filter((country) => planCountries.includes(country));
  return narrowed.length > 0 ? narrowed : [...planCountries];
}
