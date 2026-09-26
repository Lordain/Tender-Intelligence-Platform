import type { TenderLink } from "@/lib/tender-links";
import type { TenderLifecycle as Lifecycle } from "@/lib/db/tenders";
import type { TenderStatus } from "@/types/tender";
import { formatDate } from "@/lib/format";
import { platformDay } from "@/lib/tender-status";
import { DetailSectionHeading } from "@/components/tenders/DetailSectionHeading";
import { TenderLinkCards } from "@/components/tenders/TenderLinkCards";

/**
 * 项目动态 — a tender's pause, resumption, 流标 or cancellation, and the
 * other rounds of the same procedure when it was re-issued under a new code
 * (user, 2026-09-26: 不要只有暂停，也要考虑后续的恢复或者取消、重发).
 *
 * Renders nothing for the ordinary tender that was never paused, ended early
 * or re-issued, so the page is unchanged for nearly every row. A server
 * component; the data comes from fetchTenderLifecycle.
 *
 * `monthOnly` for the guest view, which shows every date at month precision
 * (lib/public-redaction.ts) — a status change's day is no different.
 */
function eventText(previous: TenderStatus, next: TenderStatus): string {
  if (next === "suspended") return "采购方暂停招标";
  if (next === "deserted") return "流标（无有效投标或无人中标）";
  if (next === "cancelled") return "采购方取消招标";
  if (previous === "suspended" && next === "awarded") return "恢复后已定标";
  if (previous === "suspended") return "恢复招标";
  return "状态更新";
}

export function TenderLifecycle({
  lifecycle,
  status,
  previousRounds,
  nextRounds,
  monthOnly = false,
}: {
  lifecycle: Lifecycle;
  status: TenderStatus;
  previousRounds: TenderLink[];
  nextRounds: TenderLink[];
  monthOnly?: boolean;
}) {
  const events = lifecycle.events;
  if (events.length === 0 && previousRounds.length === 0 && nextRounds.length === 0 && status !== "suspended") return null;

  const day = (value: string) => {
    const calendar = platformDay(value) ?? value.slice(0, 10);
    return formatDate(monthOnly ? calendar.slice(0, 7) : calendar, "zh");
  };

  return (
    <section className="flex flex-col gap-4">
      <DetailSectionHeading title="项目动态" description="暂停、恢复、流标、取消与重新招标，平台每天自动核对来源并更新" />
      <div className="rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] px-6 py-5 shadow-[0_20px_55px_-48px_rgba(6,27,43,.55)] sm:px-8">
        {status === "suspended" && (
          <p className="rounded-xl border-l-4 border-[#f59e0b] bg-[#fff7e6] px-4 py-3 text-sm leading-6 text-[#5f4a1d]">
            <strong className="text-[#071826]">本项目目前暂停中。</strong>
            采购方恢复后，交标日期通常会重新安排；平台每天核对来源，恢复或终止都会在这里更新。
          </p>
        )}
        {events.length > 0 && (
          <ol className={`flex flex-col gap-2 ${status === "suspended" ? "mt-4" : ""}`}>
            {events.map((event) => (
              <li key={`${event.changedAt}-${event.next}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="w-28 shrink-0 font-bold tabular-nums text-[#536772]">{day(event.changedAt)}</span>
                <span className="font-black text-[#071826]">{eventText(event.previous, event.next)}</span>
              </li>
            ))}
          </ol>
        )}
        {(previousRounds.length > 0 || nextRounds.length > 0) && (
          <p className={`text-xs leading-5 text-[#75838c] ${events.length > 0 || status === "suspended" ? "mt-4 border-t border-[#e4e9eb] pt-4" : ""}`}>
            {previousRounds.length > 0 && "本项目是重新招标：同一采购方、同一标的，上一轮已流标、取消或暂停。"}
            {previousRounds.length > 0 && nextRounds.length > 0 && " "}
            {nextRounds.length > 0 && "本项目已以新编号重新招标，最新一轮见下方。"}
          </p>
        )}
      </div>
      {previousRounds.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-black text-[#425461]">上一轮招标</p>
          <TenderLinkCards links={previousRounds} />
        </div>
      )}
      {nextRounds.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-black text-[#425461]">重新招标</p>
          <TenderLinkCards links={nextRounds} />
        </div>
      )}
    </section>
  );
}
