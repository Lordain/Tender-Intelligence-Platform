import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function AuthFrame({ mode, children }: { mode: "login" | "register"; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 bg-[#f7f4ee] px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#dbe2e5] bg-[#fffdf9] shadow-[0_28px_80px_-62px_rgba(6,27,43,.65)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative overflow-hidden bg-[#061b2b] p-8 text-white sm:p-10">
          <div className="absolute -right-16 -top-16 size-56 rounded-full bg-[#ffb21c]/12 blur-3xl" />
          <div className="relative flex h-full min-h-[24rem] flex-col">
            <Link href="/" className="inline-flex items-center gap-3 text-sm font-black tracking-[0.08em]">
              <BrandLogo variant="dark" className="size-11" priority />
              拉美招投标信息平台
            </Link>
            <div className="my-auto py-10">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffb21c]">Tender intelligence</p>
              <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-0.04em]">更快发现机会，<br />更稳做出投标判断</h1>
              <p className="mt-5 max-w-sm text-sm leading-7 text-white/62">专注于拉美五国政府招标采购信息，一站式中文平台。覆盖墨西哥、巴西、哥伦比亚、秘鲁、智利，汇集各官方采购平台，中文翻译，人工精筛，按国家、行业、项目规模筛选。帮企业省时、省力、省钱，快速获取精准拉美项目机会。</p>
            </div>
          </div>
        </section>
        <section className="flex items-center p-7 sm:p-10 lg:p-14">
          <div className="w-full">
            <p className="mb-3 text-xs font-black text-[#b86e00]">{mode === "login" ? "欢迎回来" : "开始使用"}</p>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
