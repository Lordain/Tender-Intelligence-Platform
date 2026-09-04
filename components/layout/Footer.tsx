import Link from "next/link";

const columns = [
  { title: "产品", links: [["招标项目", "/tenders"], ["我的收藏", "/saved"], ["价格方案", "/pricing"]] },
  { title: "资源", links: [["问题澄清", "/clarifications"], ["管理后台", "/admin/tenders"], ["待补文件", "/admin/documents-needed"]] },
  { title: "法律", links: [["服务条款", "/terms"], ["隐私政策", "/privacy"]] },
] as const;

function FooterMark() {
  return (
    <svg viewBox="0 0 40 44" className="size-9 fill-none" aria-hidden="true">
      <path d="M20 2 36 11v22L20 42 4 33V11L20 2Z" stroke="white" strokeWidth="4" strokeLinejoin="round" />
      <path d="m20 22 15-9v20l-15 9V22Z" fill="#FFB21C" />
      <path d="M5 13 20 22v20L5 33V13Z" stroke="white" strokeWidth="4" strokeLinejoin="round" />
      <path d="m8 11 12 7 12-7" stroke="white" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#031521] text-white">
      <div className="mx-auto grid max-w-[94rem] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.25fr_1fr] lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <Link href="/" className="inline-flex items-center gap-3"><FooterMark /><span className="text-lg font-black tracking-[0.08em]">招投标情报</span></Link>
          <p className="mt-5 text-sm leading-7 text-white/52">把墨西哥政府招标信息转化为结构化中文情报，帮助中国团队更快发现、理解和跟进机会。</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className="text-xs font-black uppercase tracking-[0.15em] text-[#ffb21c]">{column.title}</h2>
            <ul className="mt-4 space-y-3">
              {column.links.map(([label, href]) => <li key={href}><Link href={href} className="text-sm text-white/58 transition-colors hover:text-white">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[94rem] flex-col gap-3 px-5 py-6 text-[11px] leading-5 text-white/38 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p>招投标情报提供决策支持，不构成投标资格保证。重要要求请以官方原始文件为准。</p>
          <p>© {new Date().getFullYear()} 招投标情报 · 平台独立整理公开信息，与相关政府机构无隶属关系。</p>
        </div>
      </div>
    </footer>
  );
}
