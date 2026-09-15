import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site-url";

/**
 * /saved and /notifications joined the disallow list once app/sitemap.ts
 * existed to make the distinction meaningful: both are signed-in-only views
 * that render nothing useful to a crawler. /login and /register stay
 * crawlable — a person searching for the product by name should be able to
 * land on them — but neither is in the sitemap, since they are forms rather
 * than content.
 */
/** Everything signed-in or machine-only. Applied to every agent, named or not. */
const PRIVATE_PATHS = ["/admin", "/account", "/api", "/auth", "/saved", "/notifications"];

/**
 * The AI crawlers, named on purpose even though `*` already allows them.
 *
 * Being quoted by an assistant is a distribution channel this product wants:
 * the reader is a Chinese company asking "墨西哥的招标怎么参与" in a chat
 * window, which is the same question the 参标指南 pages answer. Two of these
 * agents fetch for answers rather than for training — OAI-SearchBot and
 * Claude-SearchBot — and a site that blocks them is not quotable no matter
 * what it publishes.
 *
 * Written out so the decision is visible and survives the next person who
 * tightens the `*` rule for some unrelated reason. There is nothing here to
 * protect: every tender page exposes only its approved public summary fields;
 * the protected analysis is omitted server-side for crawlers and guests.
 */
const AI_AGENTS = [
  // OpenAI: training, ChatGPT search, and user-initiated fetches.
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic.
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  // Perplexity.
  "PerplexityBot",
  "Perplexity-User",
  // Google's separate opt-out token for Gemini/AI training, distinct from
  // Googlebot: blocking it does not affect ordinary search ranking, and
  // allowing it does not grant anything Googlebot lacks.
  "Google-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow: PRIVATE_PATHS })),
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
