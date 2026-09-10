import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { SUPPORT_EMAIL } from "@/lib/support";

const columns = [
  { title: "产品", links: [["招标项目", "/tenders"], ["我的收藏", "/saved"], ["订阅服务", "/pricing"]] },
  { title: "帮助", links: [["问题澄清", "/clarifications"]] },
  { title: "法律", links: [["服务条款", "/terms"], ["隐私政策", "/privacy"], ["Cookie 政策", "/cookies"], ["订阅退款政策", "/refund-policy"]] },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#031521] text-white">
      <div className="mx-auto grid max-w-[94rem] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.25fr_1fr] lg:grid-cols-[1.35fr_0.8fr_0.8fr_0.9fr_1fr]">
        <div className="max-w-sm">
          <Link href="/" className="inline-flex items-center gap-3"><BrandLogo variant="dark" className="size-10" /><span className="text-lg font-black tracking-[0.08em]">拉美招投标信息平台</span></Link>
          <p className="mt-5 text-sm leading-7 text-white/52">持续整理和汇总拉美市场的公开招标与采购信息，帮助中国企业高效了解当地采购需求、发现潜在合作机会</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className="text-xs font-black uppercase tracking-[0.15em] text-[#ffb21c]">{column.title}</h2>
            <ul className="mt-4 space-y-3">
              {column.links.map(([label, href]) => <li key={href}><Link href={href} className="text-sm text-white/58 transition-colors hover:text-white">{label}</Link></li>)}
            </ul>
          </div>
        ))}
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.15em] text-[#ffb21c]">联系</h2>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-4 block text-sm text-white/58 transition-colors hover:text-white">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[94rem] flex-col gap-3 px-5 py-6 text-[11px] leading-5 text-white/38 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p>拉美招投标信息平台仅提供信息整理与决策支持，不受理或代办投标。重要要求请以官方原始文件为准。</p>
          <p>© {new Date().getFullYear()} 拉美招投标信息平台 · 本网站独立整理公开信息，与相关政府机构无隶属关系。</p>
        </div>
      </div>
    </footer>
  );
}
