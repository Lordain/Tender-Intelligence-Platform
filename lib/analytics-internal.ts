import "server-only";

export const INTERNAL_TRAFFIC_COOKIE = "latintender_internal_traffic";

export function internalTrafficCookieOptions(maxAge = 60 * 60 * 24 * 365) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

