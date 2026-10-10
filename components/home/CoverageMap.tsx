import Link from "next/link";
import { LATAM_MAP_SHAPES, LATAM_MAP_VIEWBOX } from "@/lib/latam-map";
import { Reveal } from "@/components/home/Reveal";
import { CoverageMapHighlight } from "@/components/home/CoverageMapHighlight";

/**
 * The homepage coverage map, in place of the four insight cards (user,
 * 2026-10-10: 将国家洞察改成一张拉美地图，然后我们已经覆盖的国家就点亮，并标出
 * 那个国家在我们网站有多少项目正在招标(每天刷新)+国家洞察页的链接; then 点亮的
 * 国家持续发光，做成特效).
 *
 * Server-rendered SVG from lib/latam-map.ts, so the outlines are in the HTML
 * and never in the page's JavaScript. The only script is the hover link
 * between a country on the map and its row in the list
 * (CoverageMapHighlight). The glow is CSS (app/globals.css, .coverage-*):
 * a blurred copy of each lit country breathing behind it, staggered so the
 * countries do not pulse in unison; under prefers-reduced-motion it holds
 * still, still lit. On a phone the map is ~350px wide and a label would be
 * 7px type, so the labels give way to the list below it.
 *
 * Counts are the country pages' own (liveTenderCountForCountry), computed by
 * app/page.tsx on the homepage's five-minute revalidation, which every import
 * also triggers — so they follow the daily imports.
 */
export type CoverageCountry = {
  /** Tender.country key, e.g. "Dominican Republic". */
  country: string;
  name: string;
  liveCount: number;
  href: string;
  /** "国家洞察" when the country has an insight page, "国家页" otherwise. */
  linkLabel: string;
};

/**
 * Where each country's count sits, in map units. The centroid where the
 * country is wide enough to hold it; beside it, with a leader line, where it
 * is not (Panama, Ecuador, Chile, the Dominican Republic).
 */
const BADGE_AT: Record<string, { x: number; y: number }> = {
  Mexico: { x: 132, y: 96 },
  "Dominican Republic": { x: 404, y: 104 },
  Panama: { x: 214, y: 232 },
  Colombia: { x: 330, y: 238 },
  Ecuador: { x: 218, y: 290 },
  Peru: { x: 318, y: 336 },
  Brazil: { x: 470, y: 330 },
  Bolivia: { x: 384, y: 386 },
  Chile: { x: 262, y: 520 },
  Argentina: { x: 392, y: 530 },
};

/** Badge width in map units: CJK characters, then the digits, then padding. */
function badgeWidth(name: string, count: number): number {
  return name.length * 13 + String(count).length * 8 + 30;
}

export function CoverageMap({ countries }: { countries: CoverageCountry[] }) {
  const byCountry = new Map(countries.map((entry) => [entry.country, entry]));
  const shapes = LATAM_MAP_SHAPES.filter((shape) => !shape.country || byCountry.has(shape.country));
  const lit = shapes.filter((shape) => shape.country);
  const total = countries.reduce((sum, entry) => sum + entry.liveCount, 0);
  const ranked = [...countries].sort((a, b) => b.liveCount - a.liveCount);

  return (
    <section id="country-insights" className="scroll-mt-20 overflow-hidden bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[108rem]">
        <Reveal className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffb21c]">Coverage map</p>
            <h2 className="mt-3 text-[min(7.2vw,1.875rem)] font-black leading-[1.22] tracking-[0.02em] sm:text-4xl">
              <span className="block whitespace-nowrap">点亮的国家，</span><span className="block whitespace-nowrap">每天都有项目在招</span>
            </h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-2xl text-sm leading-7 text-white/66">
              亮起的是平台已覆盖的国家，数字是当前在招的项目数，每天随数据更新。点击国家，看它的投资方向与项目机会。
            </p>
            <Link href="/insights" className="mt-5 inline-flex font-black text-[#ffb21c] transition hover:text-[#ffd06f]">
              查看全部国家洞察 →
            </Link>
          </div>
        </Reveal>

        <CoverageMapHighlight className="mt-10 grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <div className="relative mx-auto w-full max-w-[34rem]">
            {/* A soft amber haze behind the continent, so the glow has something to sit in. */}
            <div aria-hidden className="pointer-events-none absolute inset-[12%] rounded-full bg-[#ffb21c]/10 blur-3xl" />
            <svg
              viewBox={`0 0 ${LATAM_MAP_VIEWBOX.width} ${LATAM_MAP_VIEWBOX.height}`}
              className="relative h-auto w-full"
              role="img"
              aria-label={`拉美地图：已覆盖 ${countries.length} 个国家，共 ${total} 个在招项目`}
            >
              <defs>
                <linearGradient id="coverage-lit" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffd06f" />
                  <stop offset="100%" stopColor="#f39c12" />
                </linearGradient>
                <filter id="coverage-blur" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="9" />
                </filter>
              </defs>

              {shapes.filter((shape) => !shape.country).map((shape) => (
                <path key={shape.name} d={shape.d} fill="#11324a" stroke="#1d4560" strokeWidth={0.7} />
              ))}

              <g aria-hidden filter="url(#coverage-blur)">
                {lit.map((shape, index) => (
                  <path key={shape.name} d={shape.d} fill="#ffb21c" className="coverage-glow" style={{ animationDelay: `${(index * 0.37) % 3.2}s` }} />
                ))}
              </g>

              {lit.map((shape) => {
                const entry = byCountry.get(shape.country!)!;
                return (
                  <a key={shape.name} href={entry.href} aria-label={`${entry.name}：${entry.liveCount} 个在招项目，${entry.linkLabel}`} data-country={entry.country} className="coverage-country">
                    <path d={shape.d} fill="url(#coverage-lit)" stroke="#fff3d1" strokeOpacity={0.55} strokeWidth={0.8} className="coverage-shape" />
                  </a>
                );
              })}

              {lit.map((shape) => {
                const entry = byCountry.get(shape.country!)!;
                const at = BADGE_AT[entry.country] ?? { x: shape.cx, y: shape.cy };
                const width = badgeWidth(entry.name, entry.liveCount);
                const offset = Math.hypot(at.x - shape.cx, at.y - shape.cy) > 24;
                return (
                  <a key={`${shape.name}-badge`} href={entry.href} aria-hidden tabIndex={-1} data-country={entry.country} className="coverage-country">
                    {offset && <line x1={shape.cx} y1={shape.cy} x2={at.x} y2={at.y} stroke="#ffd06f" strokeOpacity={0.7} strokeWidth={1} className="coverage-label" />}
                    <circle cx={shape.cx} cy={shape.cy} r={3.5} fill="#fff8e6" />
                    <circle cx={shape.cx} cy={shape.cy} r={3.5} fill="none" stroke="#fff8e6" strokeWidth={1.5} className="coverage-ping" />
                    <g className="coverage-badge coverage-label" transform={`translate(${at.x - width / 2} ${at.y - 13})`}>
                      <rect width={width} height={26} rx={13} fill="#071826" fillOpacity={0.88} stroke="#ffb21c" strokeOpacity={0.75} />
                      <text x={12} y={17.5} fontSize={13} fontWeight={800} fill="#ffffff">
                        {entry.name}
                        <tspan dx={6} fill="#ffb21c" style={{ fontVariantNumeric: "tabular-nums" }}>{entry.liveCount}</tspan>
                      </text>
                    </g>
                  </a>
                );
              })}
            </svg>
          </div>

          <div>
            <p className="text-sm text-white/66">
              已覆盖 <span className="font-black text-white">{countries.length}</span> 个国家 · 共{" "}
              <span className="font-black text-[#ffb21c] tabular-nums">{total}</span> 个在招项目
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {ranked.map((entry) => (
                <li key={entry.country}>
                  <Link
                    href={entry.href}
                    data-country={entry.country}
                    className="coverage-row group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:border-[#ffb21c]/60 hover:bg-white/[0.08]"
                  >
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#ffb21c] shadow-[0_0_10px_2px_rgba(255,178,28,0.65)]" />
                    <span className="min-w-0 flex-1 truncate font-black">{entry.name}</span>
                    <span className="shrink-0 text-right">
                      <span className="text-lg font-black tabular-nums text-[#ffb21c]">{entry.liveCount}</span>
                      <span className="ml-1 text-xs text-white/60">个在招</span>
                    </span>
                    <span className="shrink-0 text-xs font-black text-[#ffd06f] transition-transform group-hover:translate-x-0.5">{entry.linkLabel} →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </CoverageMapHighlight>
      </div>
    </section>
  );
}
