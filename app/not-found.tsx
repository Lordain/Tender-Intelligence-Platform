import Link from "next/link";

/**
 * Site-wide 404. app/tenders/[slug]/not-found.tsx still handles the
 * specific "this tender doesn't exist" case with its own copy; this one
 * replaces Next's unstyled English default for every other bad URL.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-5 py-20 sm:px-8">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b86e00]">404</p>
      <h1 className="text-2xl font-black text-[#071826]">找不到这个页面</h1>
      <p className="text-sm leading-6 text-[#64717c]">链接可能已经失效，或者地址输入有误。</p>
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Link
          href="/tenders"
          className="h-10 rounded-xl bg-[#ffb21c] px-5 text-sm font-black leading-10 text-[#071826] transition-colors hover:bg-[#ffc247]"
        >
          浏览招标项目
        </Link>
        <Link
          href="/"
          className="h-10 rounded-xl border border-[#d8e0e3] bg-white px-5 text-sm font-black leading-10 text-[#52636e] transition-colors hover:border-[#9aa5ab]"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
