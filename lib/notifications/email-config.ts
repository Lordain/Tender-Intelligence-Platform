import "server-only";
import { notificationsEnabled } from "@/lib/notifications/tender-digest";

/**
 * What the email pipeline actually needs, read at runtime on the server.
 *
 * This exists because of a specific way the verification can lie. The admin
 * test button (app/api/admin/email-preview/test/route.ts) calls the real
 * templates against the real Resend account and reports honestly — but it
 * does NOT check EMAIL_NOTIFICATIONS_ENABLED, while the nightly digest cron
 * does, and skips the whole run when it is off. So "I clicked 测试 and the
 * email arrived" is compatible with "not one customer has received a digest".
 * That is exactly the gap #25 was opened for, and no amount of clicking the
 * button closes it.
 *
 * Values are shown for APP_URL and RESEND_FROM_EMAIL and never for
 * RESEND_API_KEY or CRON_SECRET. That split is not caution for its own sake:
 * the two shown are the ones that fail SILENTLY and WRONGLY when misset — a
 * stale APP_URL sends every customer a button pointing at localhost, and a
 * from-address on an unverified domain makes Resend accept the call and drop
 * the mail. The two hidden ones fail loudly, as a 401 or a thrown error.
 */
export type EmailConfigCheck = {
  key: string;
  label: string;
  ok: boolean;
  /** Shown to the admin. Null when the value must not be printed — `ok` still says whether it is set. */
  value: string | null;
  /** What breaks, in the admin's terms, when this one is wrong. */
  consequence: string;
};

/**
 * Which deployment these values came from.
 *
 * Added immediately after the panel's first real use, where a local `next
 * dev` run showed three red rows and read as a production outage — the
 * opposite of what the panel is for. Vercel sets VERCEL_ENV on every
 * deployment; its absence means someone's own machine.
 */
export function describeEmailEnvironment(): { label: string; isLocal: boolean } {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  if (vercelEnv === "production") return { label: "生产环境", isLocal: false };
  if (vercelEnv === "preview") return { label: "Preview 部署", isLocal: false };
  if (vercelEnv) return { label: `Vercel ${vercelEnv}`, isLocal: false };
  return { label: "本机开发环境（.env.local）", isLocal: true };
}

export function describeEmailConfig(): EmailConfigCheck[] {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const appUrl = process.env.APP_URL?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const enabled = notificationsEnabled();

  return [
    {
      key: "RESEND_API_KEY",
      label: "Resend API Key",
      ok: Boolean(apiKey),
      value: null,
      consequence: "没有它，一封都发不出——测试按钮会直接报错，不会假装成功。",
    },
    {
      key: "RESEND_FROM_EMAIL",
      label: "发件地址",
      ok: Boolean(from),
      value: from ?? null,
      consequence: "域名没在 Resend 验证过的话，接口会返回成功但邮件被丢弃——这是最难发现的一种失败。",
    },
    {
      key: "APP_URL",
      label: "站点地址",
      ok: Boolean(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl ?? ""),
      value: appUrl ?? null,
      consequence: "邮件里所有按钮和链接都由它拼出来。指向 localhost 的话，每个收件人点了都打不开。",
    },
    {
      key: "EMAIL_NOTIFICATIONS_ENABLED",
      label: "每日摘要总开关",
      ok: enabled,
      value: enabled ? "true" : process.env.EMAIL_NOTIFICATIONS_ENABLED?.trim() || "(未设置)",
      consequence: "关着的时候，下面的测试按钮照发不误，但每晚的摘要任务会整个跳过——测试通过不等于客户收得到。",
    },
    {
      key: "CRON_SECRET",
      label: "定时任务密钥",
      ok: Boolean(cronSecret),
      value: null,
      consequence: "摘要和续费提醒都靠 Vercel 定时任务触发；密钥不对，每次调用都是 401，没有任何邮件发出。",
    },
  ];
}
