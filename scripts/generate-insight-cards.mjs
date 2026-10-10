/**
 * The /insights list's card pictures, graded to one look (user, 2026-10-10:
 * 能不能让每张图的色调看着一致，有些偏亮、有些暗). The heroes are real
 * photographs taken in every light — Belo Monte in white noon haze, the
 * Insurgente train at dusk — so side by side the cards read as ten different
 * pages. Each card here is the hero, cropped to 16:9 and then:
 *
 *   1. brought to one brightness and contrast (the luminance mean and spread
 *      moved toward TARGET, within LIMIT so no photograph is pushed far),
 *   2. brought to one colour strength (saturation toward TARGET.saturation),
 *   3. washed with the site's navy at GRADE_OPACITY, so they share one tint.
 *
 * The article heroes are untouched: those sit dimmed on navy already.
 *
 *   npm run images:insight-cards
 *
 * Output: public/insights/cards/<file>.webp, 1120 × 630, one per hero.
 *
 * sharp is the copy Next installs for its own image work; it is not added to
 * package.json, so the production dependency tree stays as it is.
 */
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "public/insights");
const OUT = join(SOURCE, "cards");
const WIDTH = 1120;
const HEIGHT = 630;

const TARGET = { mean: 128, spread: 58, saturation: 0.26 };
const LIMIT = { gain: [0.8, 1.3], saturation: [0.7, 1.25] };
const GRADE = { r: 6, g: 27, b: 43 };
const GRADE_OPACITY = 0.1;

const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

/** Luminance mean and spread (Rec. 709 weights) and mean HSV saturation. */
async function measure(image) {
  const { data } = await image.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let squares = 0;
  let saturation = 0;
  const pixels = data.length / 3;
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luminance;
    squares += luminance * luminance;
    const max = Math.max(r, g, b);
    saturation += max ? (max - Math.min(r, g, b)) / max : 0;
  }
  const mean = sum / pixels;
  return { mean, spread: Math.sqrt(squares / pixels - mean * mean), saturation: saturation / pixels };
}

mkdirSync(OUT, { recursive: true });
const heroes = readdirSync(SOURCE).filter((file) => file.endsWith(".webp"));

for (const file of heroes) {
  const base = sharp(join(SOURCE, file)).resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" });
  const before = await measure(base);

  const gain = clamp(TARGET.spread / before.spread, LIMIT.gain);
  const offset = TARGET.mean - gain * before.mean;
  const toned = sharp(await base.clone().linear(gain, offset).toBuffer());

  const middle = await measure(toned);
  const graded = await toned
    .modulate({ saturation: clamp(TARGET.saturation / middle.saturation, LIMIT.saturation) })
    .composite([{ input: { create: { width: WIDTH, height: HEIGHT, channels: 4, background: { ...GRADE, alpha: GRADE_OPACITY } } } }])
    .webp({ quality: 80 })
    .toFile(join(OUT, file));

  const after = await measure(sharp(join(OUT, file)));
  console.log(
    `${file}: brightness ${before.mean.toFixed(0)} → ${after.mean.toFixed(0)}, contrast ${before.spread.toFixed(0)} → ${after.spread.toFixed(0)}, saturation ${before.saturation.toFixed(2)} → ${after.saturation.toFixed(2)} (${Math.round(graded.size / 1024)} KB)`,
  );
}
