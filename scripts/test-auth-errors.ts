/**
 * Supabase Auth errors reach the visitor in Chinese, never as raw English.
 *
 * Usage: npm run test:auth-errors
 */
import { authCallbackMessage, authErrorCode, authErrorMessage, EMAIL_NOT_CONFIRMED_MESSAGE, GENERIC_AUTH_ERROR } from "../lib/auth-errors";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) return;
  failures += 1;
  console.error(`FAIL ${name}\n  expected: ${String(expected)}\n  actual:   ${String(actual)}`);
}
function checkMatch(name: string, actual: string, pattern: RegExp) {
  if (pattern.test(actual)) return;
  failures += 1;
  console.error(`FAIL ${name}\n  expected to match ${pattern}\n  actual: ${actual}`);
}

// By code (current servers).
check("code email_not_confirmed", authErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" }), EMAIL_NOT_CONFIRMED_MESSAGE);
checkMatch("code invalid_credentials", authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }), /邮箱或密码不正确/);
checkMatch("code user_already_exists", authErrorMessage({ code: "user_already_exists", message: "User already registered" }), /已经注册过/);
checkMatch("code weak_password", authErrorMessage({ code: "weak_password", message: "Password should be at least 6 characters." }), /密码太简单/);
checkMatch("code email_address_invalid", authErrorMessage({ code: "email_address_invalid", message: 'Email address "a@b" is invalid' }), /邮箱格式不正确/);

// By message (older servers, no code).
check("message Email not confirmed", authErrorMessage({ message: "Email not confirmed" }), EMAIL_NOT_CONFIRMED_MESSAGE);
check("code from message", authErrorCode({ message: "Email not confirmed" }), "email_not_confirmed");
checkMatch("message Invalid login credentials", authErrorMessage({ message: "Invalid login credentials" }), /邮箱或密码不正确/);
checkMatch("message User already registered", authErrorMessage({ message: "User already registered" }), /已经注册过/);
checkMatch("message password length", authErrorMessage({ message: "Password should be at least 6 characters" }), /密码太简单/);

// Rate limits keep the wait time.
check("rate limit with seconds", authErrorMessage({ code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 42 seconds." }), "操作太频繁，请 42 秒后再试。");
check("rate limit by message", authErrorMessage({ message: "For security purposes, you can only request this after 7 seconds." }), "操作太频繁，请 7 秒后再试。");
check("rate limit without seconds", authErrorMessage({ code: "over_request_rate_limit", message: "Request rate limit reached" }), "操作太频繁，请过几分钟再试。");
check("email rate limit exceeded", authErrorMessage({ message: "Email rate limit exceeded" }), "操作太频繁，请过几分钟再试。");

// Network and unknown.
checkMatch("network", authErrorMessage({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }), /网络连接失败/);
check("unknown", authErrorMessage({ code: "something_new", message: "Something new went wrong" }), GENERIC_AUTH_ERROR);
check("null", authErrorMessage(null), GENERIC_AUTH_ERROR);

// No English ever comes through.
for (const message of ["Email not confirmed", "Invalid login credentials", "Something odd", "Database error saving new user"]) {
  checkMatch(`no English: ${message}`, authErrorMessage({ message }), /^[^A-Za-z]*$/);
}

// Callback notices.
checkMatch("callback expired", authCallbackMessage("otp_expired"), /过期或已被使用过/);
checkMatch("callback default", authCallbackMessage(null), /另一个浏览器/);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("auth errors: all checks pass");
