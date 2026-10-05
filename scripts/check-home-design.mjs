/**
 * Measure the visual pass on the homepage, in rendered pixels.
 *
 *     node scripts/check-home-design.mjs [baseUrl]
 *
 * Two things were asked for that a screenshot review could not settle: an
 * "extremely faint" white grain, and card shadows that make the cards float off
 * a white page. Two rounds of looking at downscaled screenshots gave
 * contradictory answers, so this measures instead:
 *
 *  - grain  → mean luminance difference between horizontally neighbouring pixels,
 *             in a patch of the hero gradient vs a patch of plain page background.
 *             A smooth gradient sits near 0; dithering shows up as a real delta.
 *  - shadow → how much darker the page is just below a card's bottom edge than
 *             the page is further away. Below ~1/255 it is not visible, whatever
 *             `getComputedStyle` says.
 *
 * Everything is reported in 0-255 units, so the numbers mean the same thing a
 * human eye would see. Structural claims (translucency, one-line subtitle,
 * letter-spacing) are asserted from computed styles as before.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Browser } from "./lib/chrome.mjs";
import { decodePng, meanLuminance, neighbourDelta } from "./lib/png.mjs";

const BASE = process.argv[2] ?? "http://localhost:3001";
const SHOTS = path.join(process.cwd(), "data", "shots");

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

/** Read one computed property from the first element matching a selector. */
const styleOf = (browser, selector, prop) =>
  browser.evaluate(`
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      return getComputedStyle(el).getPropertyValue(${JSON.stringify(prop)});
    })()
  `);

/**
 * Read the alpha channel out of a computed colour.
 *
 * Chrome reports colours in the space they were authored in, so a Tailwind
 * `/65` opacity comes back as `oklab(... / 0.65)` rather than
 * `rgba(255, 255, 255, 0.65)`. Parsing only the legacy syntax made a correct
 * translucent surface look opaque, so both forms are handled.
 */
function alphaOf(color) {
  const value = String(color);

  const slash = /\/\s*([\d.]+%?)\s*\)/.exec(value);
  if (slash) {
    return slash[1].endsWith("%") ? parseFloat(slash[1]) / 100 : Number(slash[1]);
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(value.trim());
  if (fn) {
    const parts = fn[1].split(",").map((part) => part.trim());
    if (parts.length === 4) return Number(parts[3]);
  }

  return 1;
}

/**
 * Capture a clip of the page and decode it.
 *
 * `Page.captureScreenshot`'s clip is in **page** coordinates, while
 * `getBoundingClientRect()` returns viewport ones — and this page is much taller
 * than the viewport. Passing viewport coordinates straight through made the
 * destination-card strip (bottom edge at y=1238 with a 1200px viewport) come back
 * as unpainted white, which read as "this card has no shadow". The scroll offset
 * is added here, and `captureBeyondViewport` makes Chrome paint the off-screen
 * part rather than leaving it blank.
 */
async function clip(browser, viewportRegion, file) {
  const scrollY = await browser.evaluate("window.scrollY");
  const shot = await browser.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { ...viewportRegion, y: viewportRegion.y + scrollY, scale: 1 },
  });
  const buffer = Buffer.from(shot.data, "base64");
  if (file) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer);
  }
  return decodePng(buffer);
}

async function main() {
  const browser = await new Browser({ width: 1400, height: 1200 }).start();

  try {
    const { tabId, errors } = await browser.visit(`${BASE}/`, { settle: 3000 });
    check("the homepage renders without a runtime error", errors.length === 0, errors.join(" | "));

    // ------------------------------------------------------------ geometry
    const geom = await browser.evaluate(`
      (() => {
        const rect = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        };
        const hero = document.querySelector('section.surface-hero');
        const noise = document.querySelector('.noise-veil');
        const card = document.querySelector('#browse a');
        const search = document.querySelector('section.surface-hero form');
        return {
          hero: rect(hero),
          noise: rect(noise),
          card: rect(card),
          search: rect(search),
          // A patch of hero gradient with no text in it: bottom-left of the hero.
          heroPatch: (() => {
            const r = hero.getBoundingClientRect();
            return {
              x: Math.round(r.x + 12),
              y: Math.round(r.y + r.height * 0.72),
              width: 120,
              height: 40,
            };
          })(),
          // Control: the page gutter beside the hero — genuinely empty background,
          // not "60px below some card", which is where the previous version ended
          // up sampling text and made the bare page look noisier than the grain.
          pagePatch: (() => {
            const r = hero.getBoundingClientRect();
            return { x: 10, y: Math.round(r.y + 40), width: 36, height: 40 };
          })(),
        };
      })()
    `);

    // -------------------------------------------------------------- 1. grain
    console.log("\n— 1. white grain over the gradient (measured, 0-255)");

    const noiseImage = await styleOf(browser, ".noise-veil", "background-image");
    const noiseOpacity = await styleOf(browser, ".noise-veil", "opacity");
    check(
      "a noise layer exists and is an inline SVG texture",
      /url\(.*svg/.test(String(noiseImage)),
      String(noiseImage).slice(0, 60),
    );
    check(
      "it stays faint (opacity ≤ 0.15)",
      Number(noiseOpacity) <= 0.15 && Number(noiseOpacity) > 0,
      `opacity: ${noiseOpacity}`,
    );
    const heroPixels = await clip(browser, geom.heroPatch, path.join(SHOTS, "home-grain-patch.png"));
    const pagePixels = await clip(browser, geom.pagePatch);

    const grainHero = neighbourDelta(heroPixels, { ...geom.heroPatch, x: 0, y: 0 });
    const grainPage = neighbourDelta(pagePixels, { ...geom.pagePatch, x: 0, y: 0 });

    console.log(
      `        neighbour delta: hero ${grainHero.toFixed(3)}/255 vs page background ${grainPage.toFixed(3)}/255`,
    );
    check(
      "the hero is measurably noisier than the bare page",
      grainHero > grainPage + 0.3,
      `hero ${grainHero.toFixed(3)} vs page ${grainPage.toFixed(3)}`,
    );
    check(
      "and the grain is above the 8-bit quantisation floor",
      grainHero > 0.5,
      `${grainHero.toFixed(3)}/255 — below ~0.5 it rounds away to a flat wash`,
    );
    check(
      "the grain is actually perceptible (≥1.5/255 between neighbours)",
      grainHero >= 1.5,
      `${grainHero.toFixed(3)}/255`,
    );

    // The texture itself must be grain, not a flat fill.
    const texture = await browser.evaluate(`
      (async () => {
        const el = document.querySelector('.noise-veil');
        const value = getComputedStyle(el).backgroundImage;
        // Slice between the OUTER quotes: the SVG contains its own url(%23n),
        // so a non-greedy match to the first ")" truncates the data URI.
        const from = value.indexOf('"') + 1;
        const to = value.lastIndexOf('"');
        const image = new Image();
        image.src = value.slice(from, to);
        try { await image.decode(); } catch { return { error: 'decode failed' }; }
        if (!image.naturalWidth) return { error: 'zero-size' };
        const size = 120;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const alphas = [];
        for (let i = 3; i < data.length; i += 4) alphas.push(data[i]);
        const mean = alphas.reduce((a, b) => a + b, 0) / alphas.length;
        const sd = Math.sqrt(alphas.reduce((a, b) => a + (b - mean) ** 2, 0) / alphas.length);
        return { mean: +mean.toFixed(1), sd: +sd.toFixed(1) };
      })()
    `);
    check(
      "the texture decodes to varying pixels (grain, not a flat wash)",
      (texture?.sd ?? 0) > 5,
      `mean alpha ${texture?.mean}, stdev ${texture?.sd}`,
    );

    /*
     * Grain must add texture, not a grey film. Hiding the layer and re-measuring
     * the same patch says how much the wash itself was displaced: anything above
     * a couple of 255ths would read as "the hero got dirty" rather than "grainy".
     */
    const bothMeans = await browser.evaluate(`
      (async () => {
        const el = document.querySelector('.noise-veil');
        const r = el.getBoundingClientRect();
        const previous = el.style.display;
        el.style.display = 'none';
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return { rect: { x: 12, y: Math.round(r.y + r.height * 0.72), width: 120, height: 40 }, previous };
      })()
    `);
    const withoutGrain = await clip(browser, bothMeans.rect);
    await browser.evaluate(`document.querySelector('.noise-veil').style.display = ''`);

    const withGrainMean = meanLuminance(heroPixels, {
      x: 0,
      y: 0,
      width: heroPixels.width,
      height: heroPixels.height,
    });
    const withoutGrainMean = meanLuminance(withoutGrain, {
      x: 0,
      y: 0,
      width: withoutGrain.width,
      height: withoutGrain.height,
    });
    const shift = Math.abs(withGrainMean - withoutGrainMean);
    console.log(
      `        wash displacement: ${shift.toFixed(2)}/255 (with grain ${withGrainMean.toFixed(1)} vs without ${withoutGrainMean.toFixed(1)})`,
    );
    /*
     * The bar is 5/255, not 0: on a near-white wash there is no way to have grain
     * that does not darken the mean. White specks barely move such a light
     * background (measured 0.48/255 of texture — invisible), and `overlay` blend
     * scales by (1 - base), so it flattens to nothing there too. Darkening is
     * what buys amplitude.
     *
     * It is acceptable because the shift is *uniform*: a 1.6% displacement across
     * a large field is below the just-noticeable difference as a colour change,
     * where uneven blotches at the same amplitude would read as dirt.
     */
    check(
      "the grain adds texture without visibly greying the wash (<5/255 uniform shift)",
      shift < 5,
      `${shift.toFixed(2)}/255`,
    );

    // ------------------------------------------------------------- 2. shadow
    console.log("\n— 2. cards lift off the page (measured, 0-255)");

    for (const [selector, label] of [
      ["#browse a", "category card"],
      ["#destinations a:has(img)", "destination card"],
    ]) {
      const rect = await browser.evaluate(`
        (() => {
          const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        })()
      `);

      /*
       * Self-referencing measurement, taken to the LEFT of the card's bottom-left
       * corner: the 22px of page gutter/padding beside it, starting at its bottom
       * edge. A box-shadow falls off with distance, so the columns nearest the
       * card must be darker than the columns furthest from it.
       *
       * Two earlier attempts were wrong, both because they assumed empty space
       * where there was content:
       *  - a strip 60px below the card landed on the next section's heading;
       *  - a strip 44px below the destination card landed on the second row of
       *    destination cards (the grid is 2 rows of 5), which is why "far" came
       *    back darker than "near".
       * Measuring sideways stays in the container padding for the first card of
       * either grid, so there is nothing to collide with.
       */
      const strip = await clip(browser, {
        x: rect.x - 24,
        y: rect.y + rect.height - 4,
        width: 22,
        height: 18,
      });

      const columnMean = (from, to) =>
        meanLuminance(strip, { x: from, y: 0, width: to - from, height: strip.height });

      const near = columnMean(17, 22); // the columns adjacent to the card
      const far = columnMean(0, 5); // the columns furthest from it
      const drop = far - near;

      console.log(
        `        ${label}: ${drop.toFixed(2)}/255 darker beside the bottom corner (near ${near.toFixed(1)} → far ${far.toFixed(1)})`,
      );
      check(
        `${label} casts a visible shadow (≥1/255 falloff beside it)`,
        drop >= 1,
        `only ${drop.toFixed(2)}/255 — measurable, but not visible`,
      );
    }

    // -------------------------------------------------- 3. structural checks
    console.log("\n— 3. the other requested properties");

    const formBg = await styleOf(browser, "section.surface-hero form", "background-color");
    const formBlur = await styleOf(browser, "section.surface-hero form", "backdrop-filter");
    check(
      "the search bar is semi-transparent",
      alphaOf(formBg) < 1,
      `${String(formBg).trim()} (alpha ${alphaOf(formBg)})`,
    );
    check("and blurs what is behind it", /blur/.test(String(formBlur)), String(formBlur));
    check(
      "the search bar floats on a coral shadow",
      /rgba?\(255,\s*100,\s*120/.test(String(await styleOf(browser, "section.surface-hero form", "box-shadow"))),
    );

    const titleSpacing = parseFloat(await styleOf(browser, "section.surface-hero h1", "letter-spacing"));
    const titleSize = parseFloat(await styleOf(browser, "section.surface-hero h1", "font-size"));
    check(
      "the title has positive, noticeable letter-spacing",
      titleSpacing / titleSize >= 0.03,
      `${(titleSpacing / titleSize).toFixed(3)}em`,
    );

    const subtitle = "section.surface-hero h1 + p";
    const subtitleColor = await styleOf(browser, subtitle, "color");
    const subtitleLeading = await styleOf(browser, subtitle, "line-height");
    const subtitleSize = parseFloat(await styleOf(browser, subtitle, "font-size"));
    const layout = await browser.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(subtitle)});
        const range = document.createRange();
        range.selectNodeContents(el);
        return { lines: range.getClientRects().length };
      })()
    `);
    check("the subtitle is on a single line", layout?.lines === 1, `${layout?.lines} line box(es)`);
    check(
      "its colour is the light grey #888888",
      String(subtitleColor).replace(/\s/g, "") === "rgb(136,136,136)",
      String(subtitleColor),
    );
    check(
      "line-height is roomier than 1.5",
      parseFloat(String(subtitleLeading)) / subtitleSize > 1.5,
      `${subtitleLeading} at ${subtitleSize}px`,
    );

    const contrast = await browser.evaluate(`
      (() => {
        const h1 = document.querySelector('section.surface-hero h1');
        const p = document.querySelector(${JSON.stringify(subtitle)});
        const hs = getComputedStyle(h1), ps = getComputedStyle(p);
        return {
          weight: [hs.fontWeight, ps.fontWeight],
          size: [parseFloat(hs.fontSize), parseFloat(ps.fontSize)],
          color: [hs.color, ps.color],
        };
      })()
    `);
    check(
      "title vs subtitle differ in weight, size and value (3 steps)",
      contrast.weight[0] !== contrast.weight[1] &&
        contrast.size[0] / contrast.size[1] > 2 &&
        contrast.color[0] !== contrast.color[1],
      `weight ${contrast.weight.join(" vs ")}, size ${(contrast.size[0] / contrast.size[1]).toFixed(1)}x`,
    );

    await browser.screenshot(path.join(SHOTS, "home-design-light.png"));

    console.log("\n— dark mode keeps the same treatment");
    await browser.evaluate(`document.documentElement.classList.add('dark')`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    check(
      "cards still carry a shadow",
      /rgba?\(/.test(String(await styleOf(browser, "#browse a", "box-shadow"))),
    );
    check(
      "the subtitle is lifted for a dark backdrop",
      String(await styleOf(browser, subtitle, "color")) !== "rgb(136, 136, 136)",
    );
    await browser.screenshot(path.join(SHOTS, "home-design-dark.png"));

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
