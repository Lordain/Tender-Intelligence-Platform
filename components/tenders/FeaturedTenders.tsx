"use client";

import Link from "next/link";
import type { TenderCardData } from "@/lib/tender-card";
import { TenderCard } from "@/components/tenders/TenderCard";

export function FeaturedTenders({ tenders }: { tenders: TenderCardData[] }) {
  return (
    <section className="w-full border-t border-[#dbe2e5] bg-[#f7f4ee] px-5 py-4 sm:px-8">
      <div className="mx-auto max-w-[94rem]">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((tender, index) => (
          // Phones show the first 4 and tablets 8 (full rows of two); the
          // rest are one tap away via 查看全部项目. All 9 from lg up.
          <div key={tender.id} className={index >= 8 ? "hidden lg:block" : index >= 4 ? "hidden md:block" : undefined}>
            <TenderCard tender={tender} showOneLineSummary />
          </div>
        ))}
      </div>

      <Link
        href="/tenders"
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-[#0a2b40] px-5 py-3 text-sm font-bold text-[#0a2b40] transition-colors hover:bg-[#0a2b40] hover:text-white lg:hidden"
      >
        查看全部项目
      </Link>
      </div>
    </section>
  );
}
