/**
 * Sign-in and sign-up closed for maintenance (user, 2026-10-30: 先把现在的登录
 * 页面/注册页面，改成网站维护中，暂时关闭新用户注册功能 … 这几天先关闭), while the
 * Supabase project is restricted for egress and every auth call would fail
 * anyway. /login and /register show components/auth/AuthMaintenanceNotice.tsx
 * in place of their forms; nothing else changes, and a session a visitor
 * already has keeps working.
 *
 * To reopen: set this to false and deploy.
 */
export const AUTH_MAINTENANCE = true;
