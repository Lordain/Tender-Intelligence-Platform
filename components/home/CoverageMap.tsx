import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { LATAM_MAP_SHAPES, LATAM_MAP_VIEWBOX } from "@/lib/latam-map";
import { Reveal } from "@/components/home/Reveal";
import { CoverageMapHighlight } from "@/components/home/CoverageMapHighlight";

/**
 * The homepage coverage map, in place of the four insight cards (user,
 * 2026-10-10: 将国家洞察改成一张拉美地图，然后我们已经覆盖的国家就点亮，并标出
 * 那个国家在我们网站有多少项目正在招标(每天刷新)+国家洞察页的链接; 点亮的国家
 * 持续发光，做成特效; then 还是有个标题（我们已覆盖的国家），然后我想把地图居中，
 * 把国家信息加进每个国家拉出来的点，右边的框都不要).
 *
 * The map sits in the middle of a wider canvas; each lit country has a line
 * drawn out to a card on its side — name, live count, link — the western
 * countries to the left, the rest to the right. The cards are HTML placed in
 * the canvas's own units, so they line up with the lines at any width; below
 * the lg breakpoint there is no room beside the map, and the same cards sit
 * under it in two columns instead.
 *
 * The picture is a painted satellite-style map (user, 2026-10-10: 当前首页我们
 * 使用的发光地图，能不能也替换成类似这种卫星图？… 发光效果也做成这种，只是同一色),
 * public/home/coverage-relief.webp: an image model's re-rendering of
 * scripts/generate-coverage-map-base.mjs's base, every covered country one
 * warm gold, borders held in place. It is an ordinary lazy next/image behind
 * the SVG, set to the base's span of the canvas (COVERAGE_ART).
 *
 * Over it, server-rendered SVG: each covered country's live outline, link and
 * hover light, its pin and line to its card. The outlines are <use>s of one
 * cached file, public/home/coverage-shapes.svg, so the path data sits neither
 * in the HTML nor in the page's JavaScript (user, 2026-10-10: 确保首页的打开速
 * 度不受影响 … 不要有卡顿). The only script is the hover link between a
 * country and its card (CoverageMapHighlight).
 *
 * The motion (app/globals.css, .coverage-*) is GPU work only: a pre-blurred
 * gold halo image breathing (opacity), a wave of light crossing the covered
 * countries west to east, the pins' pings and the lines flowing to the cards.
 * No SVG filter and no CSS mask runs per frame: a masked layer this large
 * took the map from 60 to ~20 frames a second. The section is not
 * rendered until it nears the screen (content-visibility). Under
 * prefers-reduced-motion it all holds still, still lit.
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

/** The canvas: the 600-wide map with room for a column of cards either side. */
const SIDE = 300;
const CANVAS = { x: -SIDE, width: LATAM_MAP_VIEWBOX.width + SIDE * 2, height: LATAM_MAP_VIEWBOX.height };
/**
 * Each card: the side it hangs off, the height of its line, and `edge`, the x
 * where the line meets the card — staggered on purpose (user, 2026-10-10:
 * 信息框的摆放可以不规则一点，不要刚好左右对齐), each card set into the open
 * sea or land beside its own country. Left edges stay ≥ -70 and right edges
 * ≤ 670 so a 13.5rem card never leaves the canvas.
 */
const CALLOUT: Record<string, { side: "left" | "right"; y: number; edge: number }> = {
  Mexico: { side: "left", y: 84, edge: -20 },
  Panama: { side: "left", y: 210, edge: -70 },
  Ecuador: { side: "left", y: 338, edge: 0 },
  Peru: { side: "left", y: 478, edge: -60 },
  Chile: { side: "left", y: 650, edge: 190 },
  "Dominican Republic": { side: "right", y: 62, edge: 480 },
  Colombia: { side: "right", y: 226, edge: 660 },
  Brazil: { side: "right", y: 372, edge: 670 },
  Bolivia: { side: "right", y: 520, edge: 600 },
  Argentina: { side: "right", y: 664, edge: 520 },
};

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

/** The covered countries' outlines, one cached file (scripts/generate-coverage-map-base.mjs). */
const COVERAGE_SHAPES = "/home/coverage-shapes.svg";

/** The painting's span, in map units (scripts/generate-coverage-map-base.mjs). */
const COVERAGE_ART = { x: -300, y: -20, width: 1200, height: 800 };

/** The painting placed under a map drawn with the given viewBox. */
function CoverageArt({ view, className }: { view: { x: number; width: number; height: number }; className: string }) {
  return (
    <div
      aria-hidden
      className={`coverage-art pointer-events-none absolute ${className}`}
      style={{
        left: pct(COVERAGE_ART.x - view.x, view.width),
        top: pct(COVERAGE_ART.y, view.height),
        width: pct(COVERAGE_ART.width, view.width),
        height: pct(COVERAGE_ART.height, view.height),
      }}
    >
      <Image src="/home/coverage-relief.webp" alt="" fill sizes="(min-width: 1024px) 72rem, 200vw" className="object-fill" />
      {/* The gold halo breathing: an opacity animation the GPU runs on its own. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed overlay, already sized and compressed */}
      <img src="/home/coverage-glow.webp" alt="" loading="lazy" decoding="async" className="coverage-glow absolute inset-0 h-full w-full" />
    </div>
  );
}

/** `facing`: the side the map is on, which carries the amber accent. */
function CountryCard({ entry, facing, className = "" }: { entry: CoverageCountry; facing?: "left" | "right"; className?: string }) {
  const accent = facing === "right" ? "lg:border-r-2 lg:border-r-[#ffb21c]/80" : facing === "left" ? "lg:border-l-2 lg:border-l-[#ffb21c]/80" : "";
  return (
    <Link
      href={entry.href}
      data-country={entry.country}
      className={`coverage-row group block rounded-2xl border border-white/10 bg-linear-to-br from-[#0d2a3f]/95 to-[#071826]/95 px-4 py-3 shadow-[0_18px_45px_-12px_rgba(0,0,0,0.6)] transition duration-200 hover:-translate-y-0.5 hover:border-[#ffb21c]/60 ${accent} ${className}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#ffb21c] shadow-[0_0_10px_2px_rgba(255,178,28,0.65)]" />
          <span className="truncate text-[15px] font-black tracking-[0.02em]">{entry.name}</span>
        </span>
        <span className="text-[1.65rem] font-black leading-none tabular-nums text-[#ffb21c] [text-shadow:0_0_18px_rgba(255,178,28,0.35)]">{entry.liveCount}</span>
      </span>
      <span className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-black text-[#ffd06f] transition-transform duration-200 group-hover:translate-x-0.5">{entry.linkLabel} →</span>
        <span className="text-white/50">个在招项目</span>
      </span>
    </Link>
  );
}

export function CoverageMap({ countries }: { countries: CoverageCountry[] }) {
  const byCountry = new Map(countries.map((entry) => [entry.country, entry]));
  const lit = LATAM_MAP_SHAPES.filter((shape) => shape.country && byCountry.has(shape.country));
  const total = countries.reduce((sum, entry) => sum + entry.liveCount, 0);
  const ranked = [...countries].sort((a, b) => b.liveCount - a.liveCount);

  return (
    <section id="country-insights" className="coverage-section scroll-mt-20 overflow-hidden bg-[#061b2b] px-5 py-16 text-white sm:px-8 sm:py-20">
      <div className="mx-auto max-w-[108rem]">
        <Reveal className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffb21c]">Coverage map</p>
            <h2 className="mt-3 text-[min(7.2vw,1.875rem)] font-black leading-[1.22] tracking-[0.02em] sm:text-4xl">我们已覆盖的国家</h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-2xl text-sm leading-7 text-white/66">
              已覆盖 <span className="font-black text-white">{countries.length}</span> 个国家 · 共{" "}
              <span className="font-black tabular-nums text-[#ffb21c]">{total}</span> 个在招项目，每天随数据更新。点击国家，看它的投资方向与项目机会。
            </p>
            <Link href="/insights" className="mt-5 inline-flex font-black text-[#ffb21c] transition hover:text-[#ffd06f]">
              查看全部国家洞察 →
            </Link>
          </div>
        </Reveal>

        <CoverageMapHighlight className="mx-auto mt-10 max-w-6xl">
          <div className="relative">
            <div className="relative mx-auto w-full max-w-[30rem] lg:max-w-none">
              <CoverageArt view={CANVAS} className="hidden lg:block" />
              <CoverageArt view={{ x: 0, ...LATAM_MAP_VIEWBOX }} className="lg:hidden" />
              <svg
                viewBox={`${CANVAS.x} 0 ${CANVAS.width} ${CANVAS.height}`}
                className="coverage-svg relative hidden h-auto w-full lg:block"
                role="img"
                aria-label={`拉美地图：已覆盖 ${countries.length} 个国家，共 ${total} 个在招项目`}
              >
                <MapBody lit={lit} byCountry={byCountry} callouts />
              </svg>
              <svg
                viewBox={`0 0 ${LATAM_MAP_VIEWBOX.width} ${LATAM_MAP_VIEWBOX.height}`}
                className="coverage-svg relative h-auto w-full lg:hidden"
                role="img"
                aria-label={`拉美地图：已覆盖 ${countries.length} 个国家，共 ${total} 个在招项目`}
              >
                <MapBody lit={lit} byCountry={byCountry} callouts={false} />
              </svg>
            </div>

            {/* The cards, once: from lg up laid over the map, each at the end of its
                country's line; below lg in two columns under it, busiest first. */}
            <ul className="mx-auto mt-8 grid max-w-xl grid-cols-2 gap-2 lg:pointer-events-none lg:absolute lg:inset-0 lg:mt-0 lg:block lg:max-w-none">
              {ranked.map((entry) => {
                const callout = CALLOUT[entry.country];
                const style = callout ? ({ "--x": pct(callout.edge - CANVAS.x, CANVAS.width), "--y": pct(callout.y, CANVAS.height) } as CSSProperties) : undefined;
                const placed = callout ? `lg:pointer-events-auto lg:absolute lg:left-(--x) lg:top-(--y) lg:w-[13.5rem] lg:-translate-y-1/2 ${callout.side === "left" ? "lg:-translate-x-full" : ""}` : "lg:hidden";
                return (
                  <li key={entry.country} style={style} className={placed}>
                    <CountryCard entry={entry} facing={callout ? (callout.side === "left" ? "right" : "left") : undefined} className="h-full lg:h-auto" />
                  </li>
                );
              })}
            </ul>
          </div>
        </CoverageMapHighlight>
      </div>
    </section>
  );
}

function MapBody({
  lit,
  byCountry,
  callouts,
}: {
  lit: typeof LATAM_MAP_SHAPES;
  byCountry: Map<string, CoverageCountry>;
  callouts: boolean;
}) {
  // The outlines live in a cached file (scripts/generate-coverage-map-base.mjs), not in this HTML.
  const ref = (shape: (typeof LATAM_MAP_SHAPES)[number]) => `${COVERAGE_SHAPES}#${shape.name.replace(/\W+/g, "-")}`;
  return (
    <>
      {/* The painting under this layer has the relief, the gold and the
          motion; here each covered country is the link, lit brighter when it
          or its card is pointed at. */}
      {/* A wave of light crossing the covered countries west to east every
          7s: each lights up in turn, its delay set by its longitude. No mask,
          no filter — the earlier masked band cost the map half its frames. */}
      <g aria-hidden className="pointer-events-none">
        {lit.map((shape) => (
          <use key={shape.name} href={ref(shape)} fill="#fff3d1" className="coverage-wave" style={{ animationDelay: `${((shape.cx - 100) / 500) * 1.6}s` }} />
        ))}
      </g>

      {lit.map((shape) => {
        const entry = byCountry.get(shape.country!)!;
        return (
          <a key={shape.name} href={entry.href} aria-label={`${entry.name}：${entry.liveCount} 个在招项目，${entry.linkLabel}`} data-country={entry.country} className="coverage-country">
            <use href={ref(shape)} fill="#fff3d1" fillOpacity={0} stroke="#fff3d1" strokeOpacity={0.45} strokeWidth={0.8} className="coverage-shape" />
          </a>
        );
      })}

      {lit.map((shape) => {
        const entry = byCountry.get(shape.country!)!;
        const callout = callouts ? CALLOUT[entry.country] : undefined;
        const edge = callout?.edge ?? 0;
        // An elbow: out from the country to the column, then level into the card.
        const elbowX = callout ? (callout.side === "left" ? edge + 40 : edge - 40) : 0;
        return (
          <g key={`${shape.name}-pin`} aria-hidden data-country={entry.country} className="coverage-country">
            {callout && (
              <>
                <path
                  d={`M${shape.cx} ${shape.cy}L${elbowX} ${callout.y}H${edge}`}
                  fill="none"
                  stroke="#ffd06f"
                  strokeOpacity={0.5}
                  strokeWidth={1.2}
                  strokeLinejoin="round"
                  className="coverage-leader"
                />
                <circle cx={edge} cy={callout.y} r={3} fill="#ffd06f" className="coverage-leader-end" />
              </>
            )}
            <circle cx={shape.cx} cy={shape.cy} r={4} fill="#fff8e6" />
            <circle cx={shape.cx} cy={shape.cy} r={4} fill="none" stroke="#fff8e6" strokeWidth={1.5} className="coverage-ping" />
          </g>
        );
      })}
    </>
  );
}
