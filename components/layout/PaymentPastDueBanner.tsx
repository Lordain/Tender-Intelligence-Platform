"use client";

import Link from "next/link";
import { useUser } from "@/lib/auth";
import { PAYMENT_GRACE_DAYS } from "@/lib/access-control";
import { useEntitlement } from "@/lib/use-entitlement";

export function PaymentPastDueBanner() {
  const { user } = useUser();
  const entitlement = useEntitlement(Boolean(user));
  if (!user || !entitlement?.paymentPastDue) return null;

  // The grace window is three days; Stripe keeps retrying for around two
  // weeks. Between the two the account has no access — which is exactly when
  // it most needs to be told that recovery is still possible and how. So this
  // banner deliberately outlives the entitlement it started out warning about,
  // and only the wording changes.
  const isOwner = entitlement.subscriptionOwnerUserId === user.id;
  // Only a subscriber's periodStart is the failed billing cycle's; a trial
  // user's is their trial start, which says nothing about the grace window.
  const graceEndsAt = entitlement.role === "subscriber" && entitlement.periodStart
    ? new Date(new Date(entitlement.periodStart).getTime() + PAYMENT_GRACE_DAYS * 86_400_000)
    : null;
  const graceDate = graceEndsAt && Number.isFinite(graceEndsAt.getTime())
    ? graceEndsAt.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : null;

  // Someone still inside their free trial keeps full access no matter what
  // their subscription is doing, so they get the warning without the claim
  // that anything has been suspended or is about to be.
  const headline = entitlement.role === "free"
    ? "订阅付款仍未成功，账户权限已暂停。付款成功后会立即恢复。"
    : graceDate
      ? `订阅付款异常，当前权限暂时保留至 ${graceDate}。`
      : "订阅付款异常。";
  const action = isOwner
    ? " 请前往账户管理查看账单，并按照 Stripe 提示完成付款。"
    : " 请联系企业主账号处理付款问题。";

  return (
    <div role="alert" className="border-b border-amber-300 bg-amber-50 text-[#633b00]">
      <div className="mx-auto flex max-w-[94rem] flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="font-semibold leading-6">
          {headline}
          {action}
        </p>
        <Link href="/account" className="shrink-0 font-black text-[#8a5100] underline underline-offset-4 hover:text-[#5f3700]">
          查看账户状态
        </Link>
      </div>
    </div>
  );
}
