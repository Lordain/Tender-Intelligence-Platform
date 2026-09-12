import Link from "next/link";
import { OBRAS_POR_IMPUESTOS_GUIDE } from "@/lib/obras-por-impuestos";

/**
 * Sits directly under the overview on an OxI project, before the reader has
 * started costing a bid, because the thing it says changes whether bidding
 * makes sense at all — see lib/obras-por-impuestos.ts.
 *
 * Deliberately not styled as a risk/warning: OxI is a legitimate and active
 * route into Peruvian infrastructure, and several Chinese contractors work it
 * as the executing party. What it is not is an ordinary tender, and this says
 * which of the two roles the reader is looking at.
 */
export function ObrasPorImpuestosNotice() {
  return (
    <section className="rounded-3xl border border-[#bcd7e4] bg-[#f2f8fb] p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#1f6f96] text-white"
        >
          <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18M8 7h8M6 21h12" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#1f6f96]">Obras por Impuestos · Ley N.° 29230</p>
          <h2 className="mt-1 text-base font-black text-[#071826] sm:text-lg">这不是普通招标，是「以工程抵税」项目</h2>
          <p className="mt-3 text-sm leading-7 text-[#33505f]">
            秘鲁的 OxI 机制是：<strong className="text-[#071826]">私营企业先自己出钱把项目建好</strong>，验收后由财政部签发 CIPRL／CIPGN
            证书返还投资额，而这些证书<strong className="text-[#071826]">只能用来抵缴在秘鲁的第三类所得税</strong>。
          </p>
          <p className="mt-2.5 text-sm leading-7 text-[#33505f]">
            也就是说，在秘鲁没有应税所得的企业，直接去当「出资企业」并不自动划算——中国企业更常见的切入点是做
            <strong className="text-[#071826]">执行企业（empresa ejecutora）</strong>，由有秘鲁纳税主体的出资方选定来施工或供货。
            遴选投的是出资方，两种角色的资格条件和责任并不一样。
          </p>
          <Link
            href={OBRAS_POR_IMPUESTOS_GUIDE}
            className="mt-4 inline-flex h-9 items-center rounded-xl border border-[#9fc4d6] bg-white px-4 text-xs font-black text-[#155573] transition-colors hover:border-[#1f6f96] hover:bg-[#e6f1f7]"
          >
            先看 OxI 参标指南 <span aria-hidden="true" className="ml-1.5">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
