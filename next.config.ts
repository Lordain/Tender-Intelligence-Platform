import type { NextConfig } from "next";

// Confirmed against a real production build (2026-09-05): this app's
// hydration (React Server Components flight data, `self.__next_f.push(...)`)
// ships as genuine inline <script> tags with no `src` and no nonce — core,
// unavoidable Next.js App Router behavior, not a dev-only artifact. A CSP
// that omits 'unsafe-inline' from script-src would break hydration/
// interactivity on every page. The fully strict alternative (a per-request
// nonce via proxy.ts) requires forcing every page to dynamic rendering,
// which would give up this app's current static prerendering for `/`,
// `/pricing`, `/privacy`, `/terms`, `/tenders`, etc. — a real architectural
// trade-off, not made here without a separate explicit decision. This CSP
// still blocks the most common real-world case (a THIRD-PARTY script
// injected from a different origin) and every other directive below stays
// strict; only inline-script-based XSS isn't covered by script-src alone.
//
// connect-src needs the project's own Supabase URL because auth calls
// (supabase.auth.signInWithPassword/signUp — see app/login, app/register)
// go directly from the browser to Supabase, not through this app's server.
//
// Stripe/Resend integration note (being built separately): a redirect-based
// Stripe Checkout needs no CSP change; embedded Stripe Elements/Checkout
// would need `https://js.stripe.com` added to script-src and frame-src.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .join("; ")
  .concat(";");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
