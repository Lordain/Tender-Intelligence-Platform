import type { EmailConfigCheck } from "@/lib/notifications/email-config";

/**
 * The runtime state of everything the email pipeline depends on, next to the
 * button that tests it.
 *
 * Placed ABOVE the test sender on purpose: the failure this page exists to
 * prevent is reading a successful test as proof that customers are receiving
 * mail, and the switch that makes those two different (the digest master
 * toggle) is invisible from the test result alone.
 */
export function EmailConfigStatus({ checks }: { checks: EmailConfigCheck[] }) {
  const broken = checks.filter((check) => !check.ok);

  return (
    <section className="rounded-2xl border border-[#dbe2e5] bg-[#fffdf9] p-5 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">Delivery config</p>
      <h2 className="mt-1 text-lg font-black text-[#071826]">邮件配置实况</h2>
      <p className="mt-1 text-sm text-[#52636e]">
        这是<strong>当前服务器上</strong>读到的值，不是 .env.example 里写的。
        {broken.length === 0
          ? "五项全部就绪。"
          : `有 ${broken.length} 项没就绪——下面标红的那几项。`}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {checks.map((check) => (
          <li
            key={check.key}
            className={`rounded-xl border px-4 py-3 ${
              check.ok ? "border-[#dbe2e5] bg-white" : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                  check.ok ? "bg-[#e7f5ec] text-[#186a3b]" : "bg-red-100 text-red-700"
                }`}
              >
                {check.ok ? "就绪" : "缺失"}
              </span>
              <span className="text-sm font-black text-[#071826]">{check.label}</span>
              <code className="text-[11px] text-[#78868e]">{check.key}</code>
              {check.value !== null && (
                <code className="truncate text-[11px] font-bold text-[#314b5c]">{check.value}</code>
              )}
            </div>
            <p className={`mt-1 text-xs ${check.ok ? "text-[#64717c]" : "text-red-700"}`}>{check.consequence}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
