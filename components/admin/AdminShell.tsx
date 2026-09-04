"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/tenders", label: "项目管理", detail: "招标数据" },
  { href: "/admin/tenders/new", label: "添加项目", detail: "人工录入" },
  { href: "/admin/import-tenders", label: "新项目清单", detail: "批量导入+翻译" },
  { href: "/admin/analyze-document", label: "标书附件分析", detail: "上传+AI分析" },
  { href: "/admin/import-analysis", label: "导入分析结果", detail: "批量分析写入" },
  { href: "/admin/documents-needed", label: "待补文件", detail: "下载清单" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-[calc(100vh-4.75rem)] bg-[#eef1ef] lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-white/10 bg-[#061b2b] px-5 py-6 text-white lg:border-b-0 lg:border-r lg:px-4 lg:py-8">
        <div className="mx-auto max-w-[94rem] lg:sticky lg:top-8">
          <div className="mb-7 px-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffb21c]">Control center</p>
            <h1 className="mt-2 text-xl font-black">管理后台</h1>
            <p className="mt-1 text-xs text-white/48">招标内容与文件工作台</p>
          </div>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col">
            {links.map((item) => {
              const active = item.href === "/admin/tenders"
                ? pathname === item.href || (pathname !== "/admin/tenders/new" && /^\/admin\/tenders\/[^/]+$/.test(pathname))
                : pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`min-w-fit rounded-xl px-3 py-2.5 transition-colors ${active ? "bg-[#ffb21c] text-[#071826]" : "text-white/68 hover:bg-white/8 hover:text-white"}`}>
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className={`hidden text-[10px] lg:block ${active ? "text-[#071826]/60" : "text-white/38"}`}>{item.detail}</span>
                </Link>
              );
            })}
          </nav>
          <Link href="/tenders" className="mt-8 hidden border-t border-white/10 px-3 pt-6 text-xs font-semibold text-white/52 hover:text-white lg:block">← 返回前台</Link>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
