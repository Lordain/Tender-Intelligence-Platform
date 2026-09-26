import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { SUPPORT_EMAIL, SUPPORT_WECHAT } from "@/lib/support";

const columns = [
  { title: "产品", links: [["招标项目", "/tenders"], ["招标周报", "/weekly"], ["我的收藏", "/saved"], ["订阅服务", "/pricing"]] },
  { title: "帮助", links: [["国家洞察", "/insights"], ["参标指南", "/guides"], ["问题澄清", "/clarifications"]] },
  { title: "法律", links: [["服务条款", "/terms"], ["隐私政策", "/privacy"], ["Cookie 政策", "/cookies"], ["订阅退款政策", "/refund-policy"]] },
] as const;

/**
 * The five countries as links to their tender pages. They replace the
 * sentence that used to list them inside a five-line intro (user,
 * 2026-09-25: 左边的介绍是不是太长了) — the same coverage said in a glance,
 * and every page of the site now links each country page.
 */
const countries = [
  ["墨西哥", "/countries/mexico"],
  ["巴西", "/countries/brazil"],
  ["哥伦比亚", "/countries/colombia"],
  ["秘鲁", "/countries/peru"],
  ["智利", "/countries/chile"],
] as const;

const headingClass = "text-xs font-black uppercase tracking-[0.15em] text-[#ffb21c]";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#031521] text-white">
      <div className="mx-auto grid max-w-[108rem] grid-cols-2 gap-x-6 gap-y-10 px-5 py-12 sm:px-8 md:grid-cols-4 xl:grid-cols-[2fr_repeat(4,minmax(0,1fr))] xl:gap-x-8">
        <div className="col-span-2 max-w-sm md:col-span-4 xl:col-span-1">
          <Link href="/" className="inline-flex items-center gap-3"><BrandLogo variant="dark" className="size-10" /><span className="text-lg font-black tracking-[0.08em]">拉美招投标信息平台</span></Link>
          <p className="mt-5 text-sm leading-7 text-white/70">拉美五国政府招标采购信息，一站式中文平台。</p>
          <p className="mt-1 text-sm leading-7 text-white/45">中文翻译 · 人工精筛 · 按国家、行业、项目规模筛选</p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="覆盖国家">
            {countries.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="inline-flex rounded-full border border-white/12 px-3 py-1 text-xs font-bold text-white/62 transition-colors hover:border-[#ffb21c] hover:text-[#ffcd67]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className={headingClass}>{column.title}</h2>
            <ul className="mt-4 space-y-3">
              {column.links.map(([label, href]) => <li key={href}><Link href={href} className="text-sm text-white/58 transition-colors hover:text-white">{label}</Link></li>)}
            </ul>
          </div>
        ))}
        <div className="col-span-2 md:col-span-1">
          <h2 className={headingClass}>联系我们</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-white/38">邮箱</dt>
              <dd className="mt-0.5">
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white/70 transition-colors hover:text-white">{SUPPORT_EMAIL}</a>
              </dd>
            </div>
            {SUPPORT_WECHAT && (
              <div>
                <dt className="text-xs text-white/38">微信</dt>
                <dd className="mt-0.5 select-all font-mono tracking-wide text-white/85">{SUPPORT_WECHAT}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[108rem] flex-col gap-2 px-5 py-6 text-[11px] leading-5 text-white/38 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <p>© {new Date().getFullYear()} 拉美招投标信息平台 · latintender.com</p>
          <p>本站独立整理公开信息，与各国政府机构无隶属关系；不受理或代办投标，重要要求请以官方原始文件为准。</p>
        </div>
      </div>
    </footer>
  );
}
