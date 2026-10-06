import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { recordCronHeartbeat } from "@/lib/ops/cron-heartbeat";
import { reportOpsFailure } from "@/lib/notifications/ops-alert";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Starts the daily import on GitHub Actions at the time it was meant to run.
 *
 * The imports themselves stay on GitHub (.github/workflows/daily-ingest.yml
 * says why). Only the clock moves: GitHub started the scheduled run 4 to 7
 * hours late every day of 2026-09-27..10-04, while a Vercel cron on Hobby
 * fires within the hour it names. So Vercel calls this route twice a day
 * (vercel.json) and this route asks GitHub to start the workflow now (user,
 * 2026-10-04: 改成由 Vercel 定时去触发 GitHub ← OK).
 *
 *   ?pass=full   every job (11:00 UTC, Beijing evening)
 *   ?pass=light  everything but the status refresh and the search-engine push
 *                (21:00 UTC, Beijing morning) — see the workflow's header
 *
 * GITHUB_DISPATCH_TOKEN is a fine-grained token for this one repository with
 * "Actions: read and write" and nothing else: it can start, re-run and cancel
 * workflow runs, not touch code or secrets. Until it is set this route records
 * a skipped heartbeat and does nothing, and the workflow's own schedule — kept
 * as the fallback — runs the imports late, as before. A run that fallback
 * finds already started from here within the last 8 hours is not repeated.
 */
const REPOSITORY = "Lordain/tender-intelligence-platform";
const WORKFLOW = "daily-ingest.yml";

type Pass = "full" | "light";

function passFor(request: NextRequest): Pass {
  const asked = new URL(request.url).searchParams.get("pass");
  if (asked === "full" || asked === "light") return asked;
  // No parameter: the evening slot (21:xx UTC) is the light one.
  return new Date().getUTCHours() >= 20 ? "light" : "full";
}

async function trigger(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pass = passFor(request);
  const admin = createSupabaseAdminClient();
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  if (!token) {
    const reason = "没有配置 GITHUB_DISPATCH_TOKEN，每日导入仍按 GitHub 自己的定时运行（常晚几小时）";
    await recordCronHeartbeat(admin, "trigger-daily-ingest", "skipped", reason);
    return NextResponse.json({ dispatched: false, pass, reason });
  }

  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "latintender-cron",
    },
    // `via` names the run (the workflow's run-name), which is what its
    // fallback schedule looks for before running a second time.
    body: JSON.stringify({ ref: "main", inputs: { write: "true", pass, via: "vercel" } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let detail = text.slice(0, 300);
    try {
      detail = String((JSON.parse(text) as { message?: unknown }).message ?? detail);
    } catch {
      // not JSON — keep the raw start of the body
    }
    throw new Error(`GitHub 返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }

  await recordCronHeartbeat(admin, "trigger-daily-ingest", "ok", pass === "full" ? "已触发完整一轮" : "已触发早间一轮（不含状态刷新和搜索引擎推送）");
  return NextResponse.json({ dispatched: true, pass });
}

export async function GET(request: NextRequest) {
  try {
    return await trigger(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const admin = createSupabaseAdminClient();
    await recordCronHeartbeat(admin, "trigger-daily-ingest", "failed", message);
    await reportOpsFailure(admin, {
      source: "trigger-daily-ingest",
      title: "每日导入未能准点触发",
      message: `${message}。导入会由 GitHub 自己的定时晚几小时补跑；最常见的原因是 GITHUB_DISPATCH_TOKEN 过期或权限不足。`,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
