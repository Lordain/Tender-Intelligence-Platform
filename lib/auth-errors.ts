/**
 * Supabase Auth errors, in the language the site speaks.
 *
 * Until 2026-10-04 the register, login and Google buttons put `error.message`
 * on screen as it came back: "Email not confirmed", "Invalid login
 * credentials", "For security purposes, you can only request this after 42
 * seconds". To a Chinese-speaking visitor who has just signed up and not yet
 * clicked the confirmation link, that reads as the site being broken.
 *
 * The error `code` is the reliable key. Older Auth servers send no code, so
 * the English message is matched as a fallback. Anything unrecognised gets a
 * generic Chinese line rather than the raw English.
 *
 * Usage: authErrorMessage(error). Tested by scripts/test-auth-errors.ts.
 */

export type AuthErrorLike = {
  message?: string | null;
  code?: string | null;
  status?: number | null;
  name?: string | null;
};

export const EMAIL_NOT_CONFIRMED_MESSAGE =
  "这个邮箱还没有完成确认。请打开注册时收到的确认邮件（也看看垃圾邮件），点击里面的链接后再登录。没收到的话，可以点下面的按钮重新发送。";

const MESSAGE_BY_CODE: Record<string, string> = {
  email_not_confirmed: EMAIL_NOT_CONFIRMED_MESSAGE,
  invalid_credentials: "邮箱或密码不正确。忘记密码的话，可以改用「免密登录」，通过邮件链接登录。",
  user_already_exists: "这个邮箱已经注册过，请直接登录。",
  email_exists: "这个邮箱已经注册过，请直接登录。",
  identity_already_exists: "这个账号已经绑定过，请直接登录。",
  weak_password: "密码太简单，请换一个更长、更难猜的密码（至少 6 位）。",
  same_password: "新密码不能和原密码相同。",
  email_address_invalid: "邮箱格式不正确，请检查后再试。",
  email_address_not_authorized: "暂时无法向这个邮箱发送邮件，请换一个邮箱，或联系我们。",
  signup_disabled: "暂时关闭了新用户注册，请稍后再试，或联系我们。",
  email_provider_disabled: "暂时无法使用邮箱登录，请改用 Google 登录，或联系我们。",
  provider_disabled: "这个登录方式暂时不可用，请改用邮箱登录。",
  otp_disabled: "暂时无法使用邮箱链接登录，请改用密码登录。",
  otp_expired: "链接已经过期或已被使用过，请重新获取。",
  flow_state_expired: "登录链接已过期，请重新登录。",
  flow_state_not_found: "登录链接已失效，请重新登录。",
  bad_code_verifier: "登录链接需要在申请它的同一个浏览器里打开，请重新登录。",
  user_banned: "这个账号已被停用，如有疑问请联系我们。",
  user_not_found: "没有找到这个账号，请先注册。",
  captcha_failed: "人机验证没有通过，请刷新页面后重试。",
  request_timeout: "请求超时，请检查网络后再试。",
  validation_failed: "填写的信息不完整或格式不对，请检查后再试。",
};

const RATE_LIMIT_CODES = new Set(["over_request_rate_limit", "over_email_send_rate_limit", "over_sms_send_rate_limit"]);

/** Older servers send no code; these are their English messages. */
const MESSAGE_PATTERNS: [RegExp, string][] = [
  [/email not confirmed/i, "email_not_confirmed"],
  [/invalid login credentials/i, "invalid_credentials"],
  [/user already registered/i, "user_already_exists"],
  [/password should (?:be|contain)/i, "weak_password"],
  [/unable to validate email address|invalid format|email address .* is invalid/i, "email_address_invalid"],
  [/signups? not allowed/i, "signup_disabled"],
  [/(?:token|link) (?:has )?expired|is invalid or has expired/i, "otp_expired"],
  [/user (?:is )?banned/i, "user_banned"],
];

const NETWORK_ERROR = /failed to fetch|network ?error|load failed|fetch failed/i;

export const GENERIC_AUTH_ERROR = "操作没有成功，请稍后再试。如果一直这样，请联系我们。";

/** The Supabase error code, or the one implied by an older server's English message. */
export function authErrorCode(error: AuthErrorLike | null | undefined): string | null {
  if (!error) return null;
  if (error.code) return error.code;
  const message = error.message ?? "";
  if (/rate limit|only request this after/i.test(message)) return "over_request_rate_limit";
  for (const [pattern, code] of MESSAGE_PATTERNS) if (pattern.test(message)) return code;
  return null;
}

export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_AUTH_ERROR;
  const message = error.message ?? "";
  const code = authErrorCode(error);

  if (code && RATE_LIMIT_CODES.has(code)) {
    const seconds = message.match(/after (\d+) seconds?/i)?.[1];
    return seconds
      ? `操作太频繁，请 ${seconds} 秒后再试。`
      : "操作太频繁，请过几分钟再试。";
  }
  if (code && MESSAGE_BY_CODE[code]) return MESSAGE_BY_CODE[code];
  if (error.status === 0 || error.name === "AuthRetryableFetchError" || NETWORK_ERROR.test(message)) {
    return "网络连接失败，请检查网络后再试。";
  }
  return GENERIC_AUTH_ERROR;
}

/**
 * Why /auth/callback sent the visitor back to /login. A confirmation link
 * opened in another browser (or a mail app's built-in browser) fails the
 * PKCE exchange even though Supabase has already confirmed the address, so
 * the safe advice is: try signing in first, resend only if that still fails.
 */
export function authCallbackMessage(errorCode: string | null): string {
  if (errorCode === "otp_expired") {
    return "这个链接已经过期或已被使用过。如果你是在确认注册邮箱，邮箱可能已经确认成功，请直接用密码登录；如果登录时仍提示未确认，可以重新发送确认邮件。";
  }
  return "链接没能完成登录。这通常是因为链接已过期，或是在另一个浏览器（例如邮箱 App 自带的浏览器）里打开的。如果你是在确认注册邮箱，邮箱可能已经确认成功，请直接用密码登录；如果仍提示未确认，可以重新发送确认邮件。";
}
