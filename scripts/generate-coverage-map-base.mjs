/**
 * The base map for the homepage coverage map's painted background (user,
 * 2026-10-10: 当前首页我们使用的发光地图，能不能也替换成类似这种卫星图？).
 *
 * The same recipe as the insight maps (scripts/generate-insight-maps.mjs):
 * this script draws a plain map — covered countries amber, every other land
 * grey, the sea navy, no text — and an image model repaints only its texture
 * (relief, glow, night ocean) with every border held in place. The painting
 * is saved as public/home/coverage-terrain.webp; components/home/CoverageMap.tsx
 * lays it under the live, interactive outlines of lib/latam-map.ts.
 *
 *   npm run maps:coverage-base   # node_modules/.cache/coverage-map/base.png
 *
 * The projection is lib/latam-map.ts's own: Mercator, scale 392.766,
 * translate [824.545, 266.796] (recovered from its centroids, within 0.7 map
 * units). The picture spans the homepage canvas, map units x −300…900 and
 * y −20…780, at 1536 × 1024 — 1.28 pixels to the unit — so it fills the sea
 * under the cards on either side as well.
 */
import { mkdirSync, readFileSync } from "node:fs";
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
