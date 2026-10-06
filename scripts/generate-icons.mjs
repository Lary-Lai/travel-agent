/**
 * Generate the app icon set from the header's own logo mark.
 *
 *     node scripts/generate-icons.mjs
 *
 * Writes:
 *   app/icon.svg        — source of truth, crisp at every size (modern browsers)
 *   app/favicon.ico     — 16/32/48 PNG-in-ICO, for `/favicon.ico` and older engines
 *   app/apple-icon.png  — 180px, full-bleed (iOS applies its own mask)
 *
 * The geometry is not invented: it is measured from the rendered header mark
 * (`components/site-header.tsx`), which is a 32px `rounded-lg` coral square
 * containing a 16px lucide `Compass` — so the glyph is 50% of the square, the
 * corner radius is 37.5%, and the stroke is lucide's default `2` on a 24-unit
 * grid, i.e. 8.33% of the glyph. Reproducing those ratios is what makes the tab
 * icon and the on-page logo read as the same mark rather than two lookalikes.
 *
 * Before this existed, `app/favicon.ico` was the create-next-app default — the
 * black circle with a white triangle that was still showing on the deployed site.
 */
import { writeFileSync } from "node:fs";

import sharp from "sharp";

/** `--primary` from app/globals.css, in the form the theme declares it. */
const PRIMARY_OKLCH = { l: 0.645, c: 0.205, h: 22.5 };

const CANVAS = 64;
const RADIUS_RATIO = 0.375; // measured: 12px on a 32px mark
const GLYPH_RATIO = 0.5; // measured: 16px glyph in a 32px mark
const LUCIDE_GRID = 24; // lucide icons are drawn on a 24-unit grid
const LUCIDE_STROKE = 2;

/** oklch -> oklab -> linear sRGB -> sRGB, per the CSS Color 4 definitions. */
function oklchToHex({ l, c, h }) {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];

  const gamma = (value) => {
    const channel = Math.min(1, Math.max(0, value));
    return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
  };

  return (
    "#" +
    linear
      .map((channel) => Math.round(gamma(channel) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** sRGB -> Lab, only used to check the conversion above against the browser. */
function hexToLab(hex) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = [r, g, b].map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const [x, y, z] = [
    linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375,
    linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.072175,
    linear[0] * 0.0193339 + linear[1] * 0.119192 + linear[2] * 0.9503041,
  ];
  const f = (value) => (value > 0.008856451679 ? Math.cbrt(value) : 7.787037037 * value + 16 / 116);
  const [fx, fy, fz] = [f(x / 0.95047), f(y), f(z / 1.08883)];
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

const coral = oklchToHex(PRIMARY_OKLCH);

/*
 * Verified against the browser, not just against itself.
 *
 * Chrome reports this mark's colour as `lab(56.7024 65.2915 35.123)`, which is
 * the *wide-gamut* representation of the same colour and therefore does **not**
 * round-trip to the sRGB hex — `oklch(0.645 0.205 22.5)` sits slightly outside
 * sRGB, so the hex is a gamut-mapped value. Comparing the two directly (delta
 * 1.495 in Lab) looked like a conversion bug and is not one.
 *
 * The check that means something is canvas normalisation, which gamut-maps into
 * sRGB exactly as the display does:
 *
 *   ctx.fillStyle = 'oklch(0.645 0.205 22.5)'            -> '#f14850'
 *   ctx.fillStyle = 'lab(56.7024 65.2915 35.123)'        -> '#f14850'
 *   ctx.fillStyle = 'rgb(241, 72, 80)'                   -> '#f14850'
 *
 * So `#f14850` is both what this conversion produces and what the browser paints.
 */
const EXPECTED_SRGB = "#f14850";
const roundTrip = hexToLab(coral);
console.log(`brand colour: oklch(${PRIMARY_OKLCH.l} ${PRIMARY_OKLCH.c} ${PRIMARY_OKLCH.h}) -> ${coral}`);
console.log(
  `  wide-gamut lab(${roundTrip.l.toFixed(3)} ${roundTrip.a.toFixed(3)} ${roundTrip.b.toFixed(3)}); ` +
    `browser's canvas normalises the same value to ${EXPECTED_SRGB}`,
);

if (coral !== EXPECTED_SRGB) {
  console.error(`expected ${EXPECTED_SRGB} — the conversion no longer matches the browser; aborting`);
  process.exit(1);
}

/** The lucide `Compass` glyph, verbatim from the package. */
const COMPASS_CIRCLE = { cx: 12, cy: 12, r: 10 };
const COMPASS_PATH =
  "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z";

/**
 * @param {number} size    output edge length in px
 * @param {number} radius  corner radius in px
 * @param {number} glyph   glyph edge length in px
 */
function svg(size, radius, glyph) {
  const scale = glyph / LUCIDE_GRID;
  const offset = (size - glyph) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="旅居 Agent">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${coral}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-width="${LUCIDE_STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="${COMPASS_CIRCLE.cx}" cy="${COMPASS_CIRCLE.cy}" r="${COMPASS_CIRCLE.r}"/>
    <path d="${COMPASS_PATH}"/>
  </g>
</svg>
`;
}

// 1. The vector icon, at the ratios the site uses.
const iconSvg = svg(CANVAS, CANVAS * RADIUS_RATIO, CANVAS * GLYPH_RATIO);
writeFileSync("app/icon.svg", iconSvg, "utf8");
console.log("wrote app/icon.svg");

// 2. apple-icon: full bleed, because iOS applies its own rounded mask and a
//    pre-rounded square would show white corners inside it.
const APPLE = 180;
const appleSvg = svg(APPLE, 0, APPLE * GLYPH_RATIO);
await sharp(Buffer.from(appleSvg)).png().toFile("app/apple-icon.png");
console.log("wrote app/apple-icon.png");

// 3. favicon.ico: a real multi-size ICO whose entries are PNG payloads, which
//    every browser since Vista accepts. Kept so `/favicon.ico` — requested by
//    browsers even with no <link>, and cached aggressively — serves the new mark
//    instead of the old default.
const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) {
  const png = await sharp(Buffer.from(svg(size, size * RADIUS_RATIO, size * GLYPH_RATIO)))
    .png()
    .toBuffer();
  pngs.push({ size, png });
}

const HEADER = 6;
const ENTRY = 16;
const header = Buffer.alloc(HEADER);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);

let offset = HEADER + ENTRY * pngs.length;
const entries = [];
for (const { size, png } of pngs) {
  const entry = Buffer.alloc(ENTRY);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += png.length;
}

writeFileSync(
  "app/favicon.ico",
  Buffer.concat([header, ...entries, ...pngs.map((entry) => entry.png)]),
);
console.log(`wrote app/favicon.ico (${sizes.join("/")}, PNG payloads)`);
