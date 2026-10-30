import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";

/** The form side of /login and /register while AUTH_MAINTENANCE is on (lib/auth-maintenance.ts). */
export function AuthMaintenanceNotice({ mode }: { mode: "login" | "register" }) {
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-3xl font-black text-[#071826]">网站维护中</h1>
      <p className="rounded-xl bg-[#fff4d8] p-4 text-sm leading-6 text-[#72521b]">
        {mode === "register" ? "系统正在维护，暂时关闭新用户注册。" : "系统正在维护，暂时无法登录。"}
        维护完成后会第一时间恢复，给您带来不便，敬请谅解。
      </p>
      <p className="text-sm leading-6 text-[#64717c]">
        如有问题，请联系{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4">
          {SUPPORT_EMAIL}
        </a>
        。
      </p>
      <p className="text-sm text-[#64717c]">
        <Link href="/" className="font-bold text-[#0a2b40] underline decoration-[#ffb21c] decoration-2 underline-offset-4">
          返回首页
        </Link>
      </p>
    </div>
  );
}
