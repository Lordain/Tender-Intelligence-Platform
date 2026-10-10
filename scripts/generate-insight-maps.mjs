/**
 * Draws every country insight's region map from one template
 * (user, 2026-10-10: 每次生成都有不一样的地方，要拉齐整个设计 — the maps had been
 * separate AI images, each with its own palette, background and icon set,
 * and borders that were not the real ones).
 *
 *   npm run maps:insights            # all countries
 *   npm run maps:insights -- peru    # one
 *
 * Output: public/insights/<slug>-regions.svg, 1600 × 1000.
 *
 * Geography is Natural Earth (public domain): 1:10m admin-1 provinces for the
 * country, downloaded once into node_modules/.cache, and world-atlas's 1:50m
 * countries for the neighbours. Each province is coloured by the insight
 * region it belongs to (REGIONS below — the same colours as the region cards
 * under the map, lib/insight-articles/<slug>.ts), each region's outline
 * glows, and each region carries one label: its number, as on the card, and
 * its two or three industry icons from one shared set. A strip at the foot
 * names the icons used. Change the look here, once, and regenerate them all.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoMercator, geoPath, geoCentroid, geoBounds } from "d3-geo";
import { topology } from "topojson-server";
import { feature, merge, mesh } from "topojson-client";
import { presimplify, simplify, quantile } from "topojson-simplify";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "node_modules/.cache/insight-maps");
const ADMIN1_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_1_states_provinces.geojson";

const W = 1600;
const H = 1000;
const LEGEND_H = 86;

// ── The shared icon set (24 × 24, stroked) ──────────────────────────────────
const ICONS = {
  energy: { label: "电力", d: "M13.3 2.5 5.8 13h5l-1 8.5L18.2 10h-5.1l.2-7.5Z" },
  grid: { label: "输变电", d: "M12 2 7 22M12 2l5 20M8.6 15h6.8M9.7 10h4.6M5 6h14M6.5 6 12 10l5.5-4" },
  wind: { label: "风电", d: "M12 11v11M12 11 6 3.5M12 11l7.5-2M12 11l-2.5 7.5M9 22h6" },
  solar: { label: "光伏", d: "M3 15h18l-3-9H6l-3 9ZM9 6l-1 9M15 6l1 9M4.5 10.5h15M12 15v5M8 20h8" },
  oil: { label: "油气", d: "M8 21 12 3l4 18M9.6 14h4.8M10.6 9h2.8M5 21h14M17 7c1.5 2 2.5 3.3 2.5 4.6a2.5 2.5 0 0 1-5 0c0-1.3 1-2.6 2.5-4.6Z" },
  mine: { label: "矿业", d: "m4 19 5-9 3 5 3-8 5 12H4ZM7 5l10 4M12 3l-2 14" },
  rail: { label: "铁路", d: "M5 2.8h14v14H5zM8 7h8M8.5 12h.01M15.5 12h.01M8 21l3-4m5 4-3-4M6 21h12" },
  road: { label: "公路", d: "M8 21 10.3 3h3.4L16 21M12 5v3m0 3v3m0 3v3" },
  port: { label: "港口", d: "M4 20h16M7 17V5h8v12M7 8h8M15 6h3v6M18 12l-2 2M3 20c2 1.3 4 .7 5 0 2 1.3 4 .7 5 0 2 1.3 4 .7 5 0" },
  airport: { label: "机场", d: "M10.5 21 12 17l1.5 4M12 17V9M3 13l9-4 9 4M12 9V4.5a1.5 1.5 0 0 0-3 0" },
  water: { label: "水务", d: "M12 2.5c3.5 4.5 6 7.5 6 11A6 6 0 1 1 6 13.5c0-3.5 2.5-6.5 6-11Z" },
  city: { label: "城市", d: "M4 21V9l5-3v15M9 21V4l7 3v14M16 21v-9l4-2v11M6 12h1m-1 3h1m5-6h1m-1 3h1m-1 3h1m5 0h1" },
  health: { label: "医疗", d: "M8 3h8v5h5v8h-5v5H8v-5H3V8h5V3ZM12 8v8m-4-4h8" },
  education: { label: "教育", d: "m3 9 9-5 9 5-9 5-9-5ZM7 12v5c3 2 7 2 10 0v-5M21 9v6" },
  industry: { label: "工业", d: "M3 21V10l6 3V9l6 4V5h4v16H3ZM7 17h2m3 0h2m3 0h2" },
  digital: { label: "数字", d: "M3 4h18v12H3zM8 20h8M12 16v4M7 8h10M7 12h6" },
  agri: { label: "农业物流", d: "M12 21V9M12 13c-3 0-5-2-5-5 3 0 5 2 5 5Zm0 0c3 0 5-2 5-5-3 0-5 2-5 5Zm0-4c-2 0-3.5-1.5-3.5-3.5C10.5 5.5 12 7 12 9Zm0 0c2 0 3.5-1.5 3.5-3.5C13.5 5.5 12 7 12 9ZM6 21h12" },
};

/**
 * Per country: the admin-1 names (as Natural Earth spells them) of each
 * region, in the order of the region cards; the region's icons; and, where
 * the region is too thin to hold its label, where the label goes instead
 * (dx/dy from the region's centre, joined by a leader line).
 */
const COUNTRIES = {
  mexico: {
    admin: "Mexico",
    regions: [
      { color: "#f5a20b", icons: ["energy", "rail", "industry"], provinces: ["Sonora", "Chihuahua", "Coahuila", "Nuevo León", "Tamaulipas"] },
      { color: "#82c8f2", icons: ["rail", "road", "industry"], provinces: ["México", "Distrito Federal", "Hidalgo", "Querétaro", "Guanajuato", "San Luis Potosí", "Jalisco", "Puebla", "Tlaxcala"], label: { dx: 40, dy: 10 } },
      { color: "#ef6b2e", icons: ["port", "oil", "water"], provinces: ["Veracruz", "Tabasco", "Campeche", "Yucatán", "Quintana Roo", "Oaxaca", "Chiapas"] },
      { color: "#4e9ad4", icons: ["port", "road", "rail"], provinces: ["Baja California", "Sinaloa", "Colima", "Michoacán", "Guerrero"], label: { dx: -150, dy: 60 } },
    ],
  },
  brazil: {
    admin: "Brazil",
    regions: [
      { color: "#35a6c8", icons: ["port", "grid", "mine"], provinces: ["Pará", "Amazonas", "Amapá", "Rondônia", "Tocantins", "Acre", "Roraima"] },
      { color: "#e5ad35", icons: ["wind", "solar", "water"], provinces: ["Bahia", "Pernambuco", "Ceará", "Rio Grande do Norte", "Piauí", "Maranhão", "Paraíba", "Alagoas", "Sergipe"] },
      { color: "#b95d42", icons: ["port", "rail", "industry"], provinces: ["São Paulo", "Rio de Janeiro", "Minas Gerais", "Espírito Santo"], label: { dx: 170, dy: 40 } },
      { color: "#548c58", icons: ["agri", "rail", "road"], provinces: ["Mato Grosso", "Goiás", "Mato Grosso do Sul", "Paraná", "Santa Catarina", "Rio Grande do Sul", "Distrito Federal"], label: { dx: -230, dy: 10 } },
    ],
  },
  colombia: {
    admin: "Colombia",
    drop: (lon) => lon < -79.5, // San Andrés y Providencia
    regions: [
      { color: "#d9a62e", icons: ["wind", "grid", "port"], provinces: ["La Guajira", "Atlántico", "Bolívar", "Magdalena", "Cesar", "Córdoba", "Sucre"] },
      { color: "#0f8b72", icons: ["rail", "road", "airport"], provinces: ["Bogota", "Cundinamarca", "Boyacá", "Santander", "Antioquia", "Tolima", "Caldas", "Risaralda", "Quindío"] },
      { color: "#df6f52", icons: ["port", "road", "water"], provinces: ["Chocó", "Valle del Cauca", "Cauca", "Nariño"], label: { dx: -120, dy: 40 } },
      { color: "#6f78c9", icons: ["rail", "digital", "energy"], provinces: ["Meta", "Casanare", "Arauca", "Guaviare", "Putumayo", "Caquetá", "Amazonas", "Vichada", "Guainía", "Vaupés"] },
    ],
  },
  peru: {
    admin: "Peru",
    regions: [
      { color: "#d9a23a", icons: ["mine", "port", "water"], provinces: ["Tumbes", "Piura", "Lambayeque", "La Libertad", "Cajamarca", "Áncash"], label: { dx: -120, dy: 0 } },
      { color: "#59a8d8", icons: ["rail", "port", "health"], provinces: ["Lima", "Lima Province", "Callao", "Junín", "Pasco", "Huánuco", "Ica", "Huancavelica", "Ayacucho"], label: { dx: -150, dy: 20 } },
      { color: "#c85c43", icons: ["mine", "grid", "rail"], provinces: ["Arequipa", "Apurímac", "Cusco", "Moquegua", "Tacna", "Puno"] },
      { color: "#7b63a8", icons: ["port", "digital", "energy"], provinces: ["Loreto", "Ucayali", "San Martín", "Amazonas", "Madre de Dios"] },
    ],
  },
  chile: {
    admin: "Chile",
    drop: (lon) => lon < -76.5, // Juan Fernández, Rapa Nui, Desventuradas
    regions: [
      { color: "#d9a23a", icons: ["mine", "solar", "water"], provinces: ["Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama"], label: { dx: -200, dy: 0 } },
      { color: "#59a8d8", icons: ["road", "rail", "port"], provinces: ["Coquimbo", "Valparaíso", "Región Metropolitana de Santiago", "Libertador General Bernardo O'Higgins"], label: { dx: -200, dy: 0 } },
      { color: "#c85c43", icons: ["road", "rail", "agri"], provinces: ["Maule", "Ñuble", "Bío-Bío", "La Araucanía"], label: { dx: -200, dy: 0 } },
      { color: "#7b63a8", icons: ["airport", "energy", "digital"], provinces: ["Los Ríos", "Los Lagos", "Aisén del General Carlos Ibáñez del Campo", "Magallanes y Antártica Chilena"], label: { dx: -200, dy: -60 } },
    ],
  },
  argentina: {
    admin: "Argentina",
    regions: [
      { color: "#d9a23a", icons: ["mine", "oil", "grid"], provinces: ["Jujuy", "Salta", "Catamarca", "La Rioja", "San Juan", "Mendoza", "Tucumán", "Santiago del Estero"], label: { dx: -230, dy: -20 } },
      { color: "#59a8d8", icons: ["energy", "rail", "port"], provinces: ["Misiones", "Corrientes", "Chaco", "Formosa", "Entre Ríos", "Santa Fe"], label: { dx: 230, dy: -40 } },
      { color: "#c85c43", icons: ["grid", "water", "rail"], provinces: ["Buenos Aires", "Ciudad de Buenos Aires", "Córdoba", "La Pampa", "San Luis"], label: { dx: 230, dy: 30 } },
      { color: "#7b63a8", icons: ["oil", "wind", "port"], provinces: ["Neuquén", "Río Negro", "Chubut", "Santa Cruz", "Tierra del Fuego"], label: { dx: 230, dy: 0 } },
    ],
  },
  "dominican-republic": {
    admin: "Dominican Republic",
    regions: [
      { color: "#c85c43", icons: ["rail", "water", "health"], provinces: ["Distrito Nacional", "Santo Domingo"], label: { dx: 0, dy: 130 } },
      { color: "#d9a23a", icons: ["rail", "road", "water"], provinces: ["Santiago", "Puerto Plata", "Monte Cristi", "Valverde", "Santiago Rodríguez", "Dajabón", "Espaillat", "Hermanas", "La Vega", "Duarte", "María Trinidad Sánchez", "Samaná", "Sánchez Ramírez", "Monseñor Nouel"] },
      { color: "#59a8d8", icons: ["airport", "port", "grid"], provinces: ["La Altagracia", "La Romana", "San Pedro de Macorís", "El Seybo", "Hato Mayor", "Monte Plata"] },
      { color: "#7b63a8", icons: ["road", "water", "energy"], provinces: ["Barahona", "Pedernales", "San Juan", "La Estrelleta", "Bahoruco", "Independencia", "Azua", "San José de Ocoa", "Peravia", "San Cristóbal"] },
    ],
  },
  panama: {
    admin: "Panama",
    regions: [
      { color: "#c85c43", icons: ["port", "rail", "water"], provinces: ["Panama", "Colón"] },
      { color: "#d9a23a", icons: ["energy", "road", "agri"], provinces: ["Chiriquí", "Bocas del Toro", "Ngöbe Buglé"] },
      { color: "#59a8d8", icons: ["road", "water", "education"], provinces: ["Coclé", "Veraguas", "Herrera", "Los Santos"], label: { dx: 0, dy: 150 } },
      { color: "#7b63a8", icons: ["road", "health", "water"], provinces: ["Darién", "Emberá", "Kuna Yala"] },
    ],
  },
  ecuador: {
    admin: "Ecuador",
    // Galápagos is drawn in an inset, not at its real distance.
    inset: { province: "Galápagos", box: [1180, 640, 360, 220] },
    regions: [
      { color: "#c85c43", icons: ["water", "road", "city"], provinces: ["Pichincha", "Azuay", "Carchi", "Imbabura", "Cotopaxi", "Tungurahua", "Chimborazo", "Bolivar", "Cañar", "Loja"], label: { dx: 10, dy: -230 } },
      { color: "#d9a23a", icons: ["port", "road", "industry"], provinces: ["Guayas", "Manabi", "El Oro", "Esmeraldas", "Santa Elena", "Los Rios", "Santo Domingo de los Tsáchilas"], label: { dx: -200, dy: 40 } },
      { color: "#59a8d8", icons: ["energy", "grid", "road"], provinces: ["Napo", "Sucumbios", "Orellana", "Pastaza", "Morona Santiago", "Zamora Chinchipe"], label: { dx: 80, dy: 60 } },
      { color: "#7b63a8", icons: ["energy", "water"], provinces: ["Galápagos"] },
    ],
  },
  bolivia: {
    admin: "Bolivia",
    regions: [
      { color: "#c85c43", icons: ["mine", "road", "city"], provinces: ["La Paz", "Oruro", "Potosí"], label: { dx: -220, dy: 0 } },
      { color: "#d9a23a", icons: ["road", "water", "industry"], provinces: ["Cochabamba", "Chuquisaca"], label: { dx: 40, dy: 10 } },
      { color: "#59a8d8", icons: ["agri", "energy", "road"], provinces: ["Santa Cruz", "El Beni", "Pando"] },
      { color: "#7b63a8", icons: ["oil", "grid", "water"], provinces: ["Tarija"], label: { dx: 220, dy: 20 } },
    ],
  },
};

// ── Data ─────────────────────────────────────────────────────────────────────
async function admin1() {
  const file = join(CACHE, "ne_10m_admin_1_states_provinces.geojson");
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    console.log("下载 Natural Earth 省级边界（约 40 MB，只需一次）…");
    const response = await fetch(ADMIN1_URL);
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function worldCountries() {
  // Neighbours are context, drawn faint: far coarser than the country itself.
  let topo = JSON.parse(readFileSync(join(ROOT, "node_modules/world-atlas/countries-50m.json"), "utf8"));
  topo = presimplify(topo);
  topo = simplify(topo, quantile(topo, 0.25));
  return feature(topo, topo.objects.countries).features;
}

/** A province without its far-off islands (`drop(lon, lat)` true for a polygon to leave out). */
function withoutPolygons(f, drop) {
  if (!drop || f.geometry.type !== "MultiPolygon") return f;
  const coordinates = f.geometry.coordinates.filter((poly) => {
    const [lon, lat] = geoCentroid({ type: "Polygon", coordinates: poly });
    return !drop(lon, lat);
  });
  return { ...f, geometry: { type: "MultiPolygon", coordinates } };
}

const round = (d) => (d ?? "").replace(/-?\d+\.\d+/g, (n) => (Math.round(Number(n) * 10) / 10).toString());

// ── Drawing ──────────────────────────────────────────────────────────────────
function icon(name, x, y, size, color = "#ffffff") {
  const scale = size / 24;
  return `<path transform="translate(${x - size / 2} ${y - size / 2}) scale(${scale})" d="${ICONS[name].d}" fill="none" stroke="${color}" stroke-width="${1.7}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function label(index, region, x, y) {
  const n = region.icons.length;
  const width = 66 + n * 48 + 10;
  const left = x - width / 2;
  const parts = [
    `<g filter="url(#shadow)"><rect x="${left}" y="${y - 32}" width="${width}" height="64" rx="32" fill="#071826" fill-opacity="0.94" stroke="${region.color}" stroke-width="2.5"/></g>`,
    `<circle cx="${left + 32}" cy="${y}" r="22" fill="${region.color}" stroke="#ffffff" stroke-width="3"/>`,
    `<text x="${left + 32}" y="${y + 8}" text-anchor="middle" font-size="22" font-weight="800" fill="#ffffff" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${index + 1}</text>`,
  ];
  region.icons.forEach((name, i) => parts.push(icon(name, left + 84 + i * 48, y, 30)));
  return parts.join("");
}

function draw(slug, config, provincesAll, world) {
  const own = provincesAll
    .filter((f) => f.properties.admin === config.admin)
    .map((f) => withoutPolygons(f, config.drop));
  const insetName = config.inset?.province;
  const regionOf = new Map();
  config.regions.forEach((region, index) => region.provinces.forEach((name) => regionOf.set(name, index)));
  const unknown = config.regions.flatMap((region) => region.provinces).filter((name) => !own.some((f) => f.properties.name === name));
  if (unknown.length) throw new Error(`${slug}: 边界数据里没有这些省份：${unknown.join("、")}`);

  // One topology for the country, so regions dissolve along shared borders.
  let topo = topology({ provinces: { type: "FeatureCollection", features: own } }, 1e5);
  topo = presimplify(topo);
  topo = simplify(topo, quantile(topo, config.simplify ?? 0.12));
  const geoms = topo.objects.provinces.geometries;
  const provinceFeatures = feature(topo, topo.objects.provinces).features;

  const mapBox = [[60, 50], [W - 60, H - LEGEND_H - 30]];
  const projection = geoMercator().fitExtent(mapBox, { type: "FeatureCollection", features: provinceFeatures.filter((f) => f.properties.name !== insetName) });
  const path = geoPath(projection);

  // Neighbours: everything in view, faint.
  const [[x0, y0], [x1, y1]] = [projection.invert([0, H]), projection.invert([W, 0])];
  const neighbours = world
    .filter((f) => {
      const [[a, b], [c, d]] = geoBounds(f);
      return c >= x0 - 5 && a <= x1 + 5 && d >= y0 - 5 && b <= y1 + 5;
    })
    .map((f) => `<path d="${round(path(f))}"/>`)
    .join("");

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  parts.push(`<defs>
<radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#0b2a40"/><stop offset="100%" stop-color="#041422"/></radialGradient>
<pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.035"/></pattern>
<filter id="glow" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="shadow" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.45"/></filter>
<clipPath id="frame"><rect width="${W}" height="${H - LEGEND_H}"/></clipPath>
</defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H - LEGEND_H}" fill="url(#grid)"/>`);
  parts.push(`<g clip-path="url(#frame)"><g fill="#0f2c40" stroke="#24506b" stroke-width="1">${neighbours}</g>`);

  // Region glow, then provinces, then region outlines.
  const regionShapes = config.regions.map((region, index) => {
    const members = geoms.filter((g) => regionOf.get(g.properties.name) === index && g.properties.name !== insetName);
    return members.length ? merge(topo, members) : null;
  });
  regionShapes.forEach((shape, index) => {
    if (shape) parts.push(`<path d="${round(path(shape))}" fill="${config.regions[index].color}" fill-opacity="0.7" stroke="${config.regions[index].color}" stroke-width="14" stroke-opacity="0.9" filter="url(#glow)"/>`);
  });
  for (const f of provinceFeatures) {
    if (f.properties.name === insetName) continue;
    const index = regionOf.get(f.properties.name);
    const fill = index === undefined ? "#1b4560" : config.regions[index].color;
    parts.push(`<path d="${round(path(f))}" fill="${fill}" fill-opacity="${index === undefined ? 1 : 0.86}"/>`);
  }
  const inner = mesh(topo, topo.objects.provinces, (a, b) => a !== b);
  parts.push(`<path d="${round(path(inner))}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="0.9"/>`);
  regionShapes.forEach((shape) => {
    if (shape) parts.push(`<path d="${round(path(shape))}" fill="none" stroke="#fff6dd" stroke-opacity="0.85" stroke-width="2"/>`);
  });

  // Inset (Galápagos).
  let insetCentre = null;
  if (config.inset) {
    const [bx, by, bw, bh] = config.inset.box;
    const target = provinceFeatures.find((f) => f.properties.name === insetName);
    const insetProjection = geoMercator().fitExtent([[bx + 24, by + 24], [bx + bw - 24, by + bh - 24]], target);
    const insetPath = geoPath(insetProjection);
    const index = regionOf.get(insetName);
    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="18" fill="#071826" fill-opacity="0.75" stroke="#ffffff" stroke-opacity="0.25"/>`);
    parts.push(`<path d="${round(insetPath(target))}" fill="${config.regions[index].color}" fill-opacity="0.55" filter="url(#glow)"/>`);
    parts.push(`<path d="${round(insetPath(target))}" fill="${config.regions[index].color}" fill-opacity="0.9" stroke="#fff6dd" stroke-width="1.5"/>`);
    insetCentre = [bx + bw / 2, by + bh / 2];
  }
  parts.push(`</g>`);

  // Labels: at the region's centre, or offset with a leader line.
  config.regions.forEach((region, index) => {
    const shape = regionShapes[index];
    const [cx, cy] = shape ? path.centroid(shape) : insetCentre;
    const x = Math.round(cx + (region.label?.dx ?? 0));
    const y = Math.round(cy + (region.label?.dy ?? 0));
    if (region.label) parts.push(`<path d="M${Math.round(cx)} ${Math.round(cy)}L${x} ${y}" stroke="#ffffff" stroke-opacity="0.7" stroke-width="1.5"/><circle cx="${Math.round(cx)}" cy="${Math.round(cy)}" r="5" fill="#ffffff"/>`);
    parts.push(label(index, region, x, y));
  });

  // The icon strip.
  const used = [...new Set(config.regions.flatMap((region) => region.icons))];
  // Each entry as wide as its label (20px characters) plus the icon and a gap.
  const widths = used.map((name) => 42 + ICONS[name].label.length * 21 + 34);
  let x = W / 2 - widths.reduce((sum, w) => sum + w, 0) / 2;
  const legendY = H - LEGEND_H / 2;
  parts.push(`<rect y="${H - LEGEND_H}" width="${W}" height="${LEGEND_H}" fill="#041422" fill-opacity="0.85"/><path d="M0 ${H - LEGEND_H}H${W}" stroke="#ffffff" stroke-opacity="0.12"/>`);
  used.forEach((name, i) => {
    parts.push(icon(name, x + 18, legendY, 26, "#ffd06f"));
    parts.push(`<text x="${x + 42}" y="${legendY + 7}" font-size="20" font-weight="700" fill="#ffffff" fill-opacity="0.85" font-family="'PingFang SC','Microsoft YaHei','Noto Sans SC','Noto Sans CJK SC',sans-serif">${ICONS[name].label}</text>`);
    x += widths[i];
  });
  parts.push(`</svg>`);
  return parts.join("\n");
}

const only = process.argv.slice(2);
const provinces = (await admin1()).features;
const world = worldCountries();
for (const [slug, config] of Object.entries(COUNTRIES)) {
  if (only.length && !only.includes(slug)) continue;
  const svg = draw(slug, config, provinces, world);
  const out = join(ROOT, "public/insights", `${slug}-regions.svg`);
  writeFileSync(out, svg);
  console.log(`${slug}: ${out.replace(`${ROOT}/`, "")}（${Math.round(svg.length / 1024)} KB）`);
}
