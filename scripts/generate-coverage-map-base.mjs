/**
 * The base map for the homepage coverage map's painted background (user,
 * 2026-10-10: 当前首页我们使用的发光地图，能不能也替换成类似这种卫星图？).
 *
 * The same recipe as the insight maps (scripts/generate-insight-maps.mjs):
 * this script draws a plain map — covered countries amber, every other land
 * grey, the sea navy, no text — and an image model repaints only its texture
 * (relief, glow, night ocean) with every border held in place. The painting
 * is saved as public/home/coverage-relief.webp; components/home/CoverageMap.tsx
 * lays it under the live, interactive outlines of lib/latam-map.ts.
 *
 *   npm run maps:coverage-base   # node_modules/.cache/coverage-map/base.png
 *
 * It also writes the three files the homepage draws over the painting, so
 * none of the outlines sit in the page's HTML (user, 2026-10-10: 确保首页的打开
 * 速度不受影响 … 不要有卡顿):
 *   public/home/coverage-shapes.svg  each covered country's outline, by id,
 *                                    for <use href="…#id"> (cached file);
 *   public/home/coverage-glow.webp   their gold edge halo, pre-blurred, so
 *                                    the breathing is an opacity animation
 *                                    the GPU composites — no SVG filter
 *                                    repainting every frame;
 * Re-run it whenever lib/latam-map.ts or the covered countries change.
 *
 * And it fades the painting's edges into the section's navy (#061b2b),
 * writing public/home/coverage-relief.webp from the model's painting,
 * data/coverage-map-art.webp: a CSS mask did that before, and a masked layer
 * that large dropped the animated map to ~20 frames a second.
 *
 * The projection is lib/latam-map.ts's own: Mercator, scale 392.766,
 * translate [824.545, 266.796] (recovered from its centroids, within 0.7 map
 * units). The picture spans the homepage canvas, map units x −300…900 and
 * y −20…780, at 1536 × 1024 — 1.28 pixels to the unit — so it fills the sea
 * under the cards on either side as well.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { presimplify, simplify, quantile } from "topojson-simplify";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "node_modules/.cache/coverage-map");

export const COVERAGE_ART = { x: -300, y: -20, width: 1200, height: 800, pixelWidth: 1536, pixelHeight: 1024 };

const projection = geoMercator().scale(392.76574).translate([824.54545, 266.7962]);
const path = geoPath(projection);

// The homepage's own outlines, so the painting lines up with them exactly.
const source = readFileSync(join(ROOT, "lib/latam-map.ts"), "utf8");
const latam = [...source.matchAll(/name: "([^"]+)", country: (null|"[^"]+"), cx: [\d.]+, cy: [\d.]+, d: "([^"]+)"/g)].map((m) => ({
  name: m[1],
  covered: m[2] !== "null",
  d: m[3],
}));
/** The sprite id of a country, as components/home/CoverageMap.tsx builds it. */
export const coverageShapeId = (name) => name.replace(/\W+/g, "-");
if (latam.length < 25) throw new Error(`lib/latam-map.ts: only ${latam.length} shapes read`);

// Everything else on the canvas (the United States, the Caribbean, Africa's
// edge…) from the same Natural Earth data, as plain land.
let topo = JSON.parse(readFileSync(join(ROOT, "node_modules/world-atlas/countries-50m.json"), "utf8"));
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.2));
const latamNames = new Set(latam.map((shape) => shape.name));
const world = feature(topo, topo.objects.countries).features.filter((f) => !latamNames.has(f.properties.name));

const { x, y, width, height, pixelWidth, pixelHeight } = COVERAGE_ART;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}">
<defs><radialGradient id="sea" cx="55%" cy="50%" r="75%"><stop offset="0%" stop-color="#0b2a40"/><stop offset="100%" stop-color="#041422"/></radialGradient></defs>
<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#sea)"/>
<g fill="#3d4650" stroke="#5f6a75" stroke-width="0.6">${world.map((f) => `<path d="${path(f)}"/>`).join("")}</g>
<g fill="#3d4650" stroke="#5f6a75" stroke-width="0.6">${latam.filter((shape) => !shape.covered).map((shape) => `<path d="${shape.d}"/>`).join("")}</g>
<g fill="#e8a531" stroke="#fff3d1" stroke-width="0.8">${latam.filter((shape) => shape.covered).map((shape) => `<path d="${shape.d}"/>`).join("")}</g>
</svg>`;

mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, "base.png");
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`首页覆盖地图底图：${out.replace(`${ROOT}/`, "")}（${pixelWidth} × ${pixelHeight}）`);

// The overlays.
const covered = latam.filter((shape) => shape.covered);
const HOME = join(ROOT, "public/home");
mkdirSync(HOME, { recursive: true });

const sprite = `<svg xmlns="http://www.w3.org/2000/svg">${covered.map((shape) => `<path id="${coverageShapeId(shape.name)}" d="${shape.d}"/>`).join("")}</svg>\n`;
writeFileSync(join(HOME, "coverage-shapes.svg"), sprite);

const frame = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${pixelWidth}" height="${pixelHeight}">${body}</svg>`);
const halo = await sharp(frame(`<g fill="none" stroke="#ffb21c" stroke-width="6" stroke-linejoin="round">${covered.map((shape) => `<path d="${shape.d}"/>`).join("")}</g>`))
  .blur(9)
  .webp({ quality: 70, alphaQuality: 60 })
  .toFile(join(HOME, "coverage-glow.webp"));
console.log(`首页叠加层：coverage-shapes.svg（${Math.round(sprite.length / 1024)} KB）、coverage-glow.webp（${Math.round(halo.size / 1024)} KB）`);

// The painting, its edges faded into the section (12% at the sides, 8% top and bottom).
const ART = join(ROOT, "data/coverage-map-art.webp");
if (existsSync(ART)) {
  const navy = "#061b2b";
  const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}">
<defs>
<linearGradient id="h" x1="0" x2="1"><stop offset="0" stop-color="${navy}"/><stop offset="0.12" stop-color="${navy}" stop-opacity="0"/><stop offset="0.88" stop-color="${navy}" stop-opacity="0"/><stop offset="1" stop-color="${navy}"/></linearGradient>
<linearGradient id="v" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${navy}"/><stop offset="0.08" stop-color="${navy}" stop-opacity="0"/><stop offset="0.92" stop-color="${navy}" stop-opacity="0"/><stop offset="1" stop-color="${navy}"/></linearGradient>
</defs><rect width="100%" height="100%" fill="url(#h)"/><rect width="100%" height="100%" fill="url(#v)"/></svg>`);
  const terrain = await sharp(ART).resize(pixelWidth, pixelHeight, { fit: "fill" }).composite([{ input: fade }]).webp({ quality: 82 }).toFile(join(HOME, "coverage-relief.webp"));
  console.log(`首页地图：coverage-relief.webp（${Math.round(terrain.size / 1024)} KB，边缘已淡入背景色）`);
} else {
  console.log("还没有 data/coverage-map-art.webp：把模型重绘的底图存到这里再运行。");
}
