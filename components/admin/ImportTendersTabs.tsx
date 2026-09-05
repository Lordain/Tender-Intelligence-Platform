"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountryFlag } from "@/components/tenders/CountryFlag";

/**
 * Per-country tab nav for /admin/import-tenders — split out of one long
 * page per the user's explicit request (2026-09-04): "把墨西哥和哥伦比亚的
 * 操作页拆开，考虑后续会增加其他国家，不要全部放在一起". Adding a new
 * country later is just one more entry in this array plus its own
 * app/admin/import-tenders/<country>/page.tsx — no other page needs
 * touching.
 */
const TABS = [
  { href: "/admin/import-tenders/mexico", label: "墨西哥", country: "Mexico" },
  { href: "/admin/import-tenders/colombia", label: "哥伦比亚", country: "Colombia" },
];

export function ImportTendersTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="选择项目国家" className="flex w-fit flex-wrap gap-1 rounded-xl border border-[#dbe2e5] bg-[#fffdf9] p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black transition-colors ${
              active ? "bg-[#061b2b] text-white shadow-sm" : "text-[#64717c] hover:bg-[#f2f4f3] hover:text-[#071826]"
            }`}
          >
            <CountryFlag country={tab.country} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
