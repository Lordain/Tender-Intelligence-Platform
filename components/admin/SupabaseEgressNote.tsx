import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { assessEgress, FREE_PLAN_EGRESS_BYTES, formatEgressBytes, type EgressDayRow } from "@/lib/ops/supabase-egress";

/**
 * One line at the top of 项目管理: this billing cycle's Supabase egress as the
 * platform counts it (lib/ops/supabase-egress.ts), against the Free plan's
 * 5 GB. Amber from 60%, the first emailed threshold. Renders nothing when the
 * count cannot be read (no table yet, or Supabase not answering) — it is an
 * aid, never the reason the page fails.
 */
export async function SupabaseEgressNote() {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const now = new Date();
  const since = new Date(now.getTime() - 40 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin.from("supabase_egress_daily").select("day, bytes").gte("day", since);
  if (error || !data) return null;

  const usage = assessEgress(data as EgressDayRow[], now);
  const warn = usage.cycleShare >= 0.6 || usage.dailyOver;
  return (
    <p className={`rounded-xl border px-4 py-2.5 text-xs leading-5 ${warn ? "border-[#eed18c] bg-[#fff8e7] font-semibold text-[#8a5a00]" : "border-[#e1e7e9] bg-white text-[#52636e]"}`}>
      Supabase 流量（本计费周期 {usage.cycleStart} 起，平台自己记账）：{formatEgressBytes(usage.cycleBytes)} / {formatEgressBytes(FREE_PLAN_EGRESS_BYTES)}（
      {Math.round(usage.cycleShare * 100)}%）· {usage.lastDay} 一天 {formatEgressBytes(usage.lastDayBytes)}
      <span className="font-normal text-[#7a878f]"> · 不含浏览器直连部分，实际略高；到 60%、80%、100% 或一天超过 300 MB 会发邮件提醒。</span>
    </p>
  );
}
