"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Per-country tab nav for /admin/import-tenders — split out of one long
 * page per the user's explicit request (2026-09-04): "把墨西哥和哥伦比亚的
 * 操作页拆开，考虑后续会增加其他国家，不要全部放在一起". Adding a new
 * country later is just one more entry in this array plus its own
 * app/admin/import-tenders/<country>/page.tsx — no other page needs
 * touching.
 */
const TABS = [
  { href: "/admin/import-tenders/mexico", label: "墨西哥" },
  { href: "/admin/import-tenders/colombia", label: "哥伦比亚" },
];

export function ImportTendersTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-[#dbe2e5]">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${
              active ? "border-[#ffb21c] text-[#071826]" : "border-transparent text-[#64717c] hover:text-[#071826]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
