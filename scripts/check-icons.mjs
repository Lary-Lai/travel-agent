/**
 * The app icons: what the browser is told to use, and what those files contain.
 *
 *     node scripts/check-icons.mjs [baseUrl]
 *
 * Assertions on bytes and pixels rather than "a file exists":
 *
 *  - the served `<link rel="icon">` tags point at the icon Next generated;
 *  - `icon.svg` carries the brand colour and the compass glyph;
 *  - `favicon.ico` is structurally a valid ICO and Chrome can decode it as an
 *    image (this is the part that silently breaks when an ICO is hand-assembled);
 *  - decoding the artwork gives the coral square with white strokes on top,
 *    which is what distinguishes the new mark from the default that shipped.
 */
import path from "node:path";

import sharp from "sharp";

import { Browser } from "./lib/chrome.mjs";

const BASE = process.argv[2] ?? "http://localhost:3001";
const SHOTS = path.join(process.cwd(), "data", "shots");
const BRAND = "#f14850";
const BRAND_RGB = { r: 241, g: 72, b: 80 };

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const near = (value, target, tolerance = 12) => Math.abs(value - target) <= tolerance;

async function main() {
  // ------------------------------------------------ what the document declares
  const html = await fetch(`${BASE}/`).then((r) => r.text());
  const iconLinks = [...html.matchAll(/<link[^>]+rel="icon"[^>]*>/g)].map((match) => match[0]);
  const appleLinks = [...html.matchAll(/<link[^>]+rel="apple-touch-icon"[^>]*>/g)].map((m) => m[0]);

  check("the document declares at least one icon", iconLinks.length > 0, iconLinks.join(" | "));
  check(
    "a vector icon is declared (so the tab mark stays crisp)",
    iconLinks.some((link) => link.includes("image/svg+xml")),
    iconLinks.join(" | "),
  );
  check(
    "the /favicon.ico fallback is declared as well",
    iconLinks.some((link) => link.includes("/favicon.ico")),
    iconLinks.join(" | "),
  );
  check("an apple-touch-icon is declared", appleLinks.length > 0, appleLinks.join(" | "));

  // Select by the declared MIME type, not by "the href contains 'icon'" — the
  // fallback's href is `/favicon.ico`, which contains "icon" too.
  const svgLink = iconLinks.find((link) => link.includes("image/svg+xml"));
  const svgHref = svgLink ? /href="([^"]+)"/.exec(svgLink)?.[1] : null;
  check("the vector icon link resolves to a URL", Boolean(svgHref), String(svgLink));

  // ------------------------------------------------------------ the SVG icon
  const svgResponse = await fetch(`${BASE}${svgHref}`);
  const svg = await svgResponse.text();
  check("the vector icon is served", svgResponse.status === 200, `HTTP ${svgResponse.status}`);
  check(
    "it is served as SVG",
    String(svgResponse.headers.get("content-type")).includes("image/svg+xml"),
    String(svgResponse.headers.get("content-type")),
  );
  check(`it uses the brand colour ${BRAND}`, svg.toLowerCase().includes(BRAND), svg.slice(0, 120));
  check("it draws the compass circle", /<circle[^>]+r="10"/.test(svg));
  check("it draws the compass needle path", svg.includes("16.24 7.76"));
  check("the glyph is white", svg.includes('stroke="#ffffff"'));

  /*
   * Rasterise and read pixels: a valid SVG can still be blank, misplaced, or the
   * wrong colour, and none of the string checks above would notice.
   */
  const raster = await sharp(Buffer.from(svg)).resize(128, 128).png().toBuffer();
  const { data, info } = await sharp(raster).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelAt = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return { r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] };
  };

  /*
   * Sample where the shape's *form* is the question, not just its colour.
   *
   * The mark is a squircle: a 37.5% corner radius means the extreme corner is cut
   * away and genuinely transparent, while the middle of an edge is inside the
   * shape. Asserting "the corner is coral" sampled the cut corner and was simply
   * wrong about the geometry. The pair below is the useful one — an edge midpoint
   * is coral *and* the extreme corner is not, which is true of a rounded square
   * and false of a circle.
   */
  const edgeMidpoint = pixelAt(2, Math.round(info.height / 2));
  const extremeCorner = pixelAt(1, 1);

  check(
    "the rasterised icon is coral at the middle of an edge",
    near(edgeMidpoint.r, BRAND_RGB.r) && near(edgeMidpoint.g, BRAND_RGB.g) && near(edgeMidpoint.b, BRAND_RGB.b),
    JSON.stringify(edgeMidpoint),
  );
  check("and opaque there", edgeMidpoint.a > 250, `alpha ${edgeMidpoint.a}`);
  check(
    "the extreme corner is cut away (a rounded square, not a circle)",
    extremeCorner.a < 40,
    `alpha ${extremeCorner.a}`,
  );

  // Somewhere in the middle there must be white strokes.
  let whitePixels = 0;
  const centre = Math.round(info.width / 2);
  for (let y = centre - 20; y <= centre + 20; y++) {
    for (let x = centre - 20; x <= centre + 20; x++) {
      const pixel = pixelAt(x, y);
      if (pixel.r > 235 && pixel.g > 235 && pixel.b > 235) whitePixels++;
    }
  }
  check(
    "the compass glyph is drawn in white over the coral",
    whitePixels > 20,
    `${whitePixels} white pixel(s) near the centre`,
  );

  // ---------------------------------------------------------- the ICO fallback
  const icoResponse = await fetch(`${BASE}/favicon.ico`);
  const ico = Buffer.from(await icoResponse.arrayBuffer());
  check("/favicon.ico is served", icoResponse.status === 200, `HTTP ${icoResponse.status}`);

  const reserved = ico.readUInt16LE(0);
  const type = ico.readUInt16LE(2);
  const count = ico.readUInt16LE(4);
  check("it is a well-formed ICO container", reserved === 0 && type === 1 && count >= 1, `reserved=${reserved} type=${type} count=${count}`);

  const entries = [];
  for (let index = 0; index < count; index++) {
    const offset = 6 + index * 16;
    const width = ico.readUInt8(offset) || 256;
    const bytes = ico.readUInt32LE(offset + 8);
    const dataOffset = ico.readUInt32LE(offset + 12);
    const payload = ico.subarray(dataOffset, dataOffset + bytes);
    const isPng = payload.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    entries.push({ width, bytes, isPng });
  }
  check(
    "every entry carries a PNG payload",
    entries.length > 0 && entries.every((entry) => entry.isPng),
    JSON.stringify(entries),
  );
  check(
    "it offers the sizes browsers actually ask for",
    entries.some((entry) => entry.width === 16) && entries.some((entry) => entry.width === 32),
    entries.map((entry) => entry.width).join("/"),
  );

  const largest = Math.max(...entries.map((entry) => entry.width));
  const largestIndex = ico.readUInt32LE(6 + entries.findIndex((entry) => entry.width === largest) * 16 + 12);
  const icoPng = await sharp(ico.subarray(largestIndex)).raw().toBuffer({ resolveWithObject: true });
  const icoPixel = (x, y) => {
    const offset = (y * icoPng.info.width + x) * icoPng.info.channels;
    return { r: icoPng.data[offset], g: icoPng.data[offset + 1], b: icoPng.data[offset + 2] };
  };
  const icoEdge = icoPixel(1, Math.round(icoPng.info.height / 2));
  check(
    `the ${largest}px entry is the coral mark too`,
    near(icoEdge.r, BRAND_RGB.r) && near(icoEdge.g, BRAND_RGB.g) && near(icoEdge.b, BRAND_RGB.b),
    JSON.stringify(icoEdge),
  );

  // ------------------------------------------------------------ a real browser
  const browser = await new Browser({ width: 520, height: 300 }).start();
  try {
    const { tabId } = await browser.visit(`${BASE}/`, { settle: 2000 });

    const decoded = await browser.evaluate(`
      (async () => {
        const load = (src) => new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve({ ok: true, w: image.naturalWidth, h: image.naturalHeight });
          image.onerror = () => resolve({ ok: false });
          image.src = src;
        });
        return { ico: await load('/favicon.ico?_=' + Date.now()), svg: await load('/icon.svg?_=' + Date.now()) };
      })()
    `);
    check("Chrome decodes /favicon.ico as an image", decoded.ico.ok === true, JSON.stringify(decoded.ico));
    check(
      "and reads a sane size from it",
      decoded.ico.ok && decoded.ico.w >= 16 && decoded.ico.w <= 256,
      JSON.stringify(decoded.ico),
    );
    check("Chrome decodes /icon.svg as an image", decoded.svg.ok === true, JSON.stringify(decoded.svg));

    // A visual record: the three assets rendered side by side.
    await browser.evaluate(`
      (() => {
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;background:#fff;display:flex;gap:24px;align-items:center;justify-content:center;height:100vh';
        for (const [src, size] of [['/icon.svg', 128], ['/apple-icon.png', 128], ['/favicon.ico', 128]]) {
          const img = new Image();
          img.src = src + '?_=' + Date.now();
          img.style.cssText = 'width:' + size + 'px;height:' + size + 'px;image-rendering:auto';
          document.body.appendChild(img);
        }
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await browser.screenshot(path.join(SHOTS, "app-icons.png"));
    await browser.closeTab(tabId);
  } finally {
    browser.stop();
  }

  console.log(`\n${"=".repeat(58)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log("=".repeat(58));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
