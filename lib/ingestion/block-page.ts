/**
 * Telling a refusal from an answer when the status code will not.
 *
 * This exists because of a measured mistake. `probe:brazil-concessions`
 * retried every failed step with browser headers and judged the retry by its
 * status code — and ANTT's F5 appliance serves
 * "The requested URL was rejected" as **HTTP 200**. So the probe reported
 * "browser headers got us in" for a block notice, three times in one run. A
 * tool that overstates its own findings is worse than one that fails, because
 * the overstatement is what gets acted on.
 *
 * The signatures are deliberately the vendor strings rather than anything
 * clever: F5's rejection page, Cloudflare's two interstitials, and the
 * hand-written Portuguese block page CCEE serves. They are matched against
 * the returned body, never against a URL or a header, because a body is the
 * one thing a proxy cannot fake away.
 */
const BLOCK_PAGE_SIGNATURES = [
  /Request Rejected/i,
  /Your support ID is/i,
  /Acesso bloqueado/i,
  // Added after run three: PPI's static-file host answers a blocked request
  // with "Acesso Negado!" at HTTP 200 and a 364-character body. Without this
  // line the English edital PDF read as "answered, but nearly empty" — which
  // is a different diagnosis leading to a different, wrong next step.
  /Acesso Negado/i,
  /Acesso Denegado/i,
  /Attention Required/i,
  /Just a moment/i,
  /__cf_chl|cf-browser-verification|cf_chl_opt/i,
  /Access Denied/i,
];

/** The matched signature when the body is a refusal page, else null. */
export function blockPageReason(text: string): string | null {
  const hit = BLOCK_PAGE_SIGNATURES.find((pattern) => pattern.test(text));
  return hit ? (text.match(hit)?.[0] ?? "拦截页").slice(0, 40) : null;
}

/** The page's own title — usually the fastest way to see what a 200 really is. */
export function pageTitle(text: string): string {
  return (text.match(/<title[^>]*>([\s\S]{0,160}?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Body text with scripts, styles and tags removed.
 *
 * Reported alongside the verdict rather than instead of it: a single-page-app
 * shell and an interstitial both answer 200 with almost no text, and nothing
 * short of reading the words tells them apart. On run two, four different PPI
 * URLs — `sitemap.xml` among them — all returned the same 266-character body,
 * which is the shape of exactly that ambiguity.
 */
export function visibleText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
