"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NotificationPreferences } from "@/components/account/NotificationPreferences";
import { useUser } from "@/lib/auth";
import { canConfigureEmailNotifications } from "@/lib/access-control";
import { useEntitlement } from "@/lib/use-entitlement";

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const entitlement = useEntitlement(Boolean(user));
  useEffect(() => { if (!loading && !user) router.push("/login?next=/notifications"); }, [loading, user, router]);
  if (loading || !user) return null;
  const locked = entitlement ? !canConfigureEmailNotifications(entitlement.role) : true;

  return (
    <main className="flex-1 bg-[#f7f4ee]">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="border-b border-[#d8e0e3] pb-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#b86e00]">Notification center</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[#071826] sm:text-5xl">通知设置</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#64717c] sm:text-base">设置新标与项目状态邮件。试用期和订阅期每日 09:00、18:00 发送。</p>
        </header>
        {entitlement?.role === "trial" && <div className="mt-6 rounded-2xl border border-[#efcf80] bg-[#fff7df] px-5 py-4 text-sm font-bold text-[#805100]">3 天免费试用期间通知功能已开放；试用结束且未订阅时将自动停止发送。</div>}
        <div className="mt-6"><NotificationPreferences userId={user.id} locked={locked} lockReason="您的免费试用已结束，订阅后即可恢复邮件通知。" /></div>
      </div>
    </main>
  );
}
