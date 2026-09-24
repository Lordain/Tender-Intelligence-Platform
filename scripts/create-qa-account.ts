/**
 * Creates ONE disposable QA account in the state a live payment test needs,
 * and nothing else.
 *
 * scripts/seed-test-accounts.ts already builds six QA identities, but it is
 * the wrong tool here: it resets the password of any of those six that
 * already exist and deletes their subscription rows, which is not something
 * to do to a live project in order to test one checkout. This touches one
 * account, the one it is given.
 *
 * The state that matters, and why:
 *
 *  - **Trial already expired.** A fresh signup is `role: "trial"` for
 *    TRIAL_DAYS and a trial can see everything, so a brand-new account shows
 *    full access whether or not the webhook ever landed — the test would pass
 *    while proving nothing. With the clock set behind, `subscriber` can only
 *    be coming from the subscription, which is the thing under test. Same
 *    reasoning as the seed script's own comment about its subscriber roles.
 *  - **Email pre-confirmed**, so no confirmation mail has to arrive.
 *  - **No subscription row**, so the starting point is unambiguous.
 *
 * It REFUSES an address in ADMIN_EMAILS. getViewerEntitlement() short-circuits
 * to subscriber/enterprise for an admin before it reads any subscription, so
 * an admin address makes every downstream check pass for the wrong reason —
 * the single most expensive way to waste a live payment test.
 *
 * Writes. Requires SUPABASE_SERVICE_ROLE_KEY. Not for creating real users.
 *
 * Usage:
 *   npm run create:qa-account -- --email you+qa1@gmail.com
 *   npm run create:qa-account -- --email you+qa1@gmail.com --password 'S0me!Pass'
 *   npm run create:qa-account -- --email you+qa1@gmail.com --delete
 */
import { isAdminEmail } from "../lib/admin-emails";
import { createSupabaseAdminClient } from "../lib/supabase/admin-client";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

/** listUsers has no email filter, so finding one means walking the pages — same as the seed script. */
async function findUserIdByEmail(admin: ReturnType<typeof createSupabaseAdminClient>, email: string): Promise<string | null> {
  const wanted = email.toLowerCase();
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin!.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`用户检索失败：${error.message}`);
    if (!data.users.length) return null;
    const match = data.users.find((user) => user.email?.toLowerCase() === wanted);
    if (match) return match.id;
  }
  return null;
}

async function main() {
  const email = argValue("--email");
  if (!email) {
    console.error("要一个 --email。例：npm run create:qa-account -- --email you+qa1@gmail.com");
    process.exit(1);
  }
  const password = argValue("--password") ?? "TenderQA123!";
  const remove = process.argv.includes("--delete");

  // Before anything is written, and before Supabase is even reached: an admin
  // address cannot be made into a useful test subject at all.
  if (isAdminEmail(email)) {
    console.error(`${email} 在 ADMIN_EMAILS 里。admin 账号会绕过全部订阅判断（access-control-server.ts），拿它测什么都会「通过」。换一个地址，例如 Gmail 的 +别名。`);
    process.exit(1);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error("Supabase 未配置（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）。见 .env.example。什么都没有写入。");
    process.exit(1);
  }

  const existingId = await findUserIdByEmail(admin, email);

  if (remove) {
    if (!existingId) { console.log(`${email} 不存在，无需删除。`); return; }
    const { error } = await admin.auth.admin.deleteUser(existingId);
    if (error) throw new Error(`删除失败：${error.message}`);
    console.log(`已删除 ${email}（${existingId}）。`);
    return;
  }

  let userId = existingId;
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw new Error(`${email} 更新失败：${error.message}`);
    console.log(`账号已存在，重置了密码：${email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`${email} 创建失败：${error?.message ?? "no user returned"}`);
    userId = data.user.id;
    console.log(`已创建 ${email}`);
  }

  // handle_new_user() creates the profiles row on signup; only the clock needs
  // moving. Retried briefly because that trigger and this update race on a
  // freshly created account.
  const expired = new Date(Date.now() - 86_400_000).toISOString();
  let updated = false;
  for (let attempt = 0; attempt < 5 && !updated; attempt += 1) {
    const { data, error } = await admin.from("profiles").update({ trial_ends_at: expired }).eq("id", userId).select("id");
    if (error) throw new Error(`试用期设置失败：${error.message}`);
    if (data && data.length > 0) updated = true;
    else await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!updated) throw new Error("profiles 行始终没出现，试用期没能改成已过期 —— 别用这个账号测，它还在试用期内，会盖住测试结果。");

  const { data: subs, error: subsError } = await admin.from("subscriptions").select("id, plan, status").eq("user_id", userId);
  if (subsError) throw new Error(`订阅读取失败：${subsError.message}`);

  console.log(`
────────────────────────────────────────────────────────
  邮箱      ${email}
  密码      ${password}
  user id   ${userId}
  试用       已设为过期（${expired.slice(0, 10)}）→ role 应为 free
  订阅       ${subs?.length ? subs.map((s) => `${s.plan}/${s.status}`).join("， ") : "无（符合预期）"}
────────────────────────────────────────────────────────

下一步：
  npm run check:subscription-state -- --email ${email}
  期望 role=free、订阅 0 行、免费额度 0/5。不是的话先别往下测。

测完清理：
  npm run create:qa-account -- --email ${email} --delete
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
