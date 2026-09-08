"use client";

import Link from "next/link";
import { useUser } from "@/lib/auth";
import { PAYMENT_GRACE_DAYS } from "@/lib/access-control";
import { useEntitlement } from "@/lib/use-entitlement";

export function PaymentPastDueBanner() {
  const { user } = useUser();
  const entitlement = useEntitlement(Boolean(user));
  if (!user || !entitlement?.paymentPastDue || entitlement.role !== "subscriber") return null;

  const isOwner = entitlement.subscriptionOwnerUserId === user.id;
  const graceEndsAt = entitlement.periodStart
    ? new Date(new Date(entitlement.periodStart).getTime() + PAYMENT_GRACE_DAYS * 86_400_000)
    : null;
  const graceDate = graceEndsAt && Number.isFinite(graceEndsAt.getTime())
    ? graceEndsAt.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div role="alert" className="border-b border-amber-300 bg-amber-50 text-[#633b00]">
      <div className="mx-auto flex max-w-[94rem] flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="font-semibold leading-6">
          订阅付款异常，当前权限暂时保留{graceDate ? `至 ${graceDate}` : ` ${PAYMENT_GRACE_DAYS} 天`}。
          {isOwner ? " 请根据 Stripe 的付款失败邮件更新支付方式。" : " 请联系企业主账号处理付款问题。"}
        </p>
        <Link href="/account" className="shrink-0 font-black text-[#8a5100] underline underline-offset-4 hover:text-[#5f3700]">
          查看账户状态
        </Link>
      </div>
    </div>
  );
}
