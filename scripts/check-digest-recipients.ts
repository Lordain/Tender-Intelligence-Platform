/**
 * Prints who WOULD receive the twice-daily digest right now, and sends
 * nothing. The cron route can't be used to check this: it only runs at 09:00
 * and 18:00 America/Mexico_City, and when it does run it delivers real mail.
 *
 * What this is for is the eligibility rule itself — subscribers, users still
 * inside the seven-day trial, and accepted enterprise seats, intersected with
 * the people who turned notifications on. After `npm run seed:test-accounts`
 * the expected answer is four of the six seeded accounts, with qa-free absent
 * even though it asked for mail.
 *
 * Read-only. Requires SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage: npm run check:digest-recipients
 */
import { getDigestRecipients } from "../lib/notifications/tender-digest";

getDigestRecipients()
  .then((recipients) => {
    if (recipients.length === 0) {
      console.log("没有收件人。（没有人开启通知，或没有人处于试用/订阅状态。）");
      return;
    }
    console.log(`${recipients.length} 位收件人：\n`);
    for (const recipient of recipients) {
      const filters = [
        recipient.countries.length ? `国家=${recipient.countries.join(",")}` : null,
        recipient.industries.length ? `行业=${recipient.industries.join(",")}` : null,
        recipient.statuses.length ? `状态=${recipient.statuses.join(",")}` : null,
        recipient.relevance_tiers.length ? `相关度=${recipient.relevance_tiers.join(",")}` : null,
        recipient.keywords.length ? `关键词=${recipient.keywords.join(",")}` : null,
      ].filter(Boolean);
      console.log(`  ${recipient.email.padEnd(34)} ${filters.length ? filters.join(" · ") : "无筛选条件（全部）"}`);
    }
    console.log("\n未列出的人不会收到邮件。");
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
