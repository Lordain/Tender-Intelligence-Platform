/**
 * The site's own absolute origin, resolved without a Request.
 *
 * Metadata routes (app/sitemap.ts) and metadataBase need an absolute URL and
 * have no incoming request to read a host from, which is what separates this
 * from appOrigin() in lib/stripe.ts — that one is for route handlers and
 * deliberately falls back to the request's own origin.
 *
 * APP_URL is the answer whenever it is set; it is already required for
 * Checkout redirects and digest email links, so a deployment that can bill or
 * send mail already has it. The Vercel fallback exists so a preview build
 * still emits a working sitemap instead of one pointing at localhost, and it
 * uses VERCEL_PROJECT_PRODUCTION_URL rather than VERCEL_URL: the latter is the
 * per-deployment URL, which changes on every push and would put a throwaway
 * hostname in front of a crawler.
 */
export function siteOrigin(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return new URL(configured).origin;

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
