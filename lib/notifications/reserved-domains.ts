/**
 * Addresses that can never receive mail, by standard — not by policy.
 *
 * RFC 2606 and RFC 6761 permanently reserve `example.com`, `example.net`,
 * `example.org` and the `.test` / `.example` / `.invalid` / `.localhost` TLDs
 * for documentation and testing. No mailbox exists behind any of them and no
 * provider will deliver to one; Resend rejects them outright ("Invalid `to`
 * field. Please use our testing email address instead of domains like
 * `example.com`").
 *
 * This matters because the QA accounts this project seeds
 * (scripts/seed-test-accounts.ts, default `--domain=example.com`) are real
 * rows with real digest preferences, so every scheduled run picked them up,
 * tried to mail them, failed, and filed an admin alert — five of them, every
 * run, for as long as those accounts exist. Confirmed on real production
 * output 2026-09-12: five standing alerts and a permanently red
 * "tender-digest" heartbeat.
 *
 * That is worse than useless. A monitor that is always red is a monitor
 * nobody reads, and it was hiding the actual, good news underneath — the
 * pipeline reached Resend and Resend answered, which is most of what
 * verifying email delivery was supposed to establish.
 *
 * So these addresses are skipped rather than attempted. Not an error, not an
 * alert, not a retry: attempting a guaranteed-undeliverable address is not a
 * test of anything. The counts are still reported, so "we skipped five" stays
 * visible and never reads as "we sent five".
 *
 * Deliberately NOT a config value: this is a property of the DNS standards,
 * identical in every deployment, and a switch to turn it off would only ever
 * be used to turn the noise back on.
 */
const RESERVED_SECOND_LEVEL = new Set(["example.com", "example.net", "example.org"]);
const RESERVED_TLDS = ["test", "example", "invalid", "localhost"];

export function isReservedEmailDomain(email: string | null | undefined): boolean {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  if (RESERVED_SECOND_LEVEL.has(domain)) return true;
  return RESERVED_TLDS.some((tld) => domain === tld || domain.endsWith(`.${tld}`));
}
