"use client";

import Link from "next/link";
import type { Tender } from "@/types/tender";
import { TenderCard } from "@/components/tenders/TenderCard";

export function FeaturedTenders({ tenders }: { tenders: Tender[] }) {
  return (
    <section className="w-full border-t border-[#dbe2e5] bg-[#f7f4ee] px-5 py-4 sm:px-8">
      <div className="mx-auto max-w-[94rem]">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {tenders.map((tender) => (
          <TenderCard key={tender.id} tender={tender} />
        ))}
      </div>

      <Link
        href="/tenders"
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-[#0a2b40] px-5 py-3 text-sm font-bold text-[#0a2b40] transition-colors hover:bg-[#0a2b40] hover:text-white sm:hidden"
      >
        查看全部项目
      </Link>
      </div>
    </section>
  );
}
