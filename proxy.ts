import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { evaluateBotProtection } from "@/lib/security/bot-protection";

// Standard Supabase SSR proxy (formerly "middleware"): refreshes the auth
// session cookie on every request so the access token doesn't silently
// expire mid-session. A no-op (passes the request through unchanged) when
// Supabase isn't configured, so the app keeps working on mock data alone.
export async function proxy(request: NextRequest) {
  const blocked = evaluateBotProtection(request);
  if (blocked) return blocked;

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed-out visitor to any /admin page goes straight to /login from
  // here. The admin layouts redirect too, but a page renders alongside its
  // layout, so before this every anonymous hit on /admin/tenders or
  // /admin/analytics ran that page's full service-role queries first and was
  // answered 10–19 s later (user, 2026-10-11: 没登录就直接跳到登录页，不再碰
  // 数据库). Signed-in requests are unchanged: the layouts still decide who
  // is an admin.
  if (!user && ADMIN_PAGE_PATTERN.test(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}

const ADMIN_PAGE_PATTERN = /^\/admin(\/|$)/;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
