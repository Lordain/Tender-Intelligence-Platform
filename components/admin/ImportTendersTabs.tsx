"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountryFlag } from "@/components/tenders/CountryFlag";

/**
 * Tab nav for /admin/import-tenders — split out of one long page per the
 * user's explicit request (2026-09-04): "把墨西哥和哥伦比亚的操作页拆开，
 * 考虑后续会增加其他国家，不要全部放在一起". Adding a new country later is
 * just one more entry in this array plus its own
 * app/admin/import-tenders/<country>/page.tsx — no other page needs touching.
 *
 * 通用维护 is the one non-country tab (2026-09-11, user's call: "单独一个
 * 分页？放在国家前面？"). It comes first and is separated by a rule, because
 * it is a different KIND of thing — cross-country actions rather than one
 * country's daily import — and sorting it in among the countries would read
 * as if it were another one. /admin/import-tenders still lands on 墨西哥:
 * this is the tab you open on purpose, not the one you want every day.
 */
const TABS = [
  { href: "/admin/import-tenders/maintenance", label: "通用维护", country: null },
  { href: "/admin/import-tenders/mexico", label: "墨西哥", country: "Mexico" },
  { href: "/admin/import-tenders/colombia", label: "哥伦比亚", country: "Colombia" },
  { href: "/admin/import-tenders/peru", label: "秘鲁", country: "Peru" },
];

function MaintenanceIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <path d="M14.7 6.3a4 4 0 0 1-5 5L5 16v3h3l4.7-4.7a4 4 0 0 1 5-5l-2.3-2.3 2.1-2.1a4 4 0 0 0-2.8 1.4Z" />
    </svg>
  );
}

export function ImportTendersTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="选择操作" className="flex w-fit flex-wrap items-center gap-1 rounded-xl border border-[#dbe2e5] bg-[#fffdf9] p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <span key={tab.href} className="contents">
            <Link
              href={tab.href}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black transition-colors ${
                active ? "bg-[#061b2b] text-white shadow-sm" : "text-[#64717c] hover:bg-[#f2f4f3] hover:text-[#071826]"
              }`}
            >
              {tab.country ? <CountryFlag country={tab.country} /> : <MaintenanceIcon />}
              {tab.label}
            </Link>
            {/* Separates the one cross-country tab from the per-country ones. */}
            {tab.country === null && <span aria-hidden="true" className="mx-1 h-6 w-px bg-[#dbe2e5]" />}
          </span>
        );
      })}
    </nav>
  );
}
