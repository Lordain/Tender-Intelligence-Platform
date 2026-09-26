import Link from "next/link";
import { formatDate } from "@/lib/format";
import { PUBLIC_AFTER_DEADLINE_DAYS, TRIAL_DAYS } from "@/lib/access-control";
import type { TenderStatus } from "@/types/tender";

/**
 * Shown above a tender that is open to this reader only because its deadline
 * passed PUBLIC_AFTER_DEADLINE_DAYS ago. Two jobs: say why the full page is
 * free (so nobody takes it for a live opportunity), and point the reader at
 * the tenders that are still open — the ones that need an account.
 */
export function ReleasedTenderNotice({
  audience,
  submissionDeadline,
  status,
}: {
  audience: "guest" | "member";
  submissionDeadline?: string;
  status: TenderStatus;
}) {
  const deadline = submissionDeadline ? formatDate(submissionDeadline, "zh") : null;
  // An awarded or cancelled tender with no deadline was released from the day
  // it ended, so that is what the sentence names.
  const ended = deadline ? `已于 ${deadline} 截止投标` : status === "awarded" ? "已完成定标" : status === "cancelled" ? "已取消" : status === "deserted" ? "已流标" : "已截止投标";
  const action = audience === "guest"
    ? { href: "/register?next=%2Ftenders", label: `注册免费试用 ${TRIAL_DAYS} 天` }
    : { href: "/pricing", label: "查看订阅方案" };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#efd898] bg-[#fff8e8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="text-sm font-black text-[#071826]">
          本项目{ended}，完整信息现已免费公开
        </p>
        <p className="mt-1 text-xs leading-6 text-[#6b5a35]">
          项目截止或结束 {PUBLIC_AFTER_DEADLINE_DAYS} 天后，平台免费公开其全部整理内容，可作为同类项目的参考。正在招标的项目，完整分析仅向会员开放。
        </p>
      </div>
      <Link href={action.href} className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#ffb21c] px-4 text-xs font-black text-[#071826] hover:bg-[#ffc247]">
        {action.label}
      </Link>
    </section>
  );
}
