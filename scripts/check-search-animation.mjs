/**
 * The homepage search bar's scroll behaviour.
 *
 *     node scripts/check-search-animation.mjs [baseUrl]
 *
 * Asserts the state machine, not the pixels:
 *
 *  1. at the top the full hero bar is the one on screen;
 *  2. scrolling down hands over to the compact bar — and *never* shows both,
 *     which is the bug an earlier fixed-threshold version had;
 *  3. the phase is **latched**: more scrolling down does not retrigger it, and
 *     scrolling up mid-page does not expand either — only arriving back at the
 *     top does. This is the part a naive `scrollY > 100` implementation gets
 *     wrong, so it is the part worth pinning.
 *
 * Also checks the two properties that make the animation cheap and the compact
 * bar usable: a CSS transition (not a per-frame inline value), and a 44px touch
 * target on the button a thumb actually reaches for.
 */
import path from "node:path";

import { Browser } from "./lib/chrome.mjs";

const BASE = process.argv[2] ?? "http://localhost:3001";
const SHOTS = path.join(process.cwd(), "data", "shots");
const HEADER_HEIGHT = 64;

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

/** Scroll, settle past the transition, then report both bars' states. */
const sample = (browser, y) =>
  browser
    .evaluate(`(() => { window.scrollTo(0, ${y}); return true; })()`)
    .then(() => new Promise((resolve) => setTimeout(resolve, 450)))
    .then(() =>
      browser.evaluate(`
        (() => {
          const sticky = document.querySelector('[data-phase]');
          const heroBar = document.querySelector('section.surface-hero form');
          const heroRect = heroBar.getBoundingClientRect();
          const stickyBar = sticky.querySelector('form');
          const stickyRect = stickyBar.getBoundingClientRect();

          return {
            scrollY: Math.round(window.scrollY),
            phase: sticky.dataset.phase,
            stickyOpacity: Number(getComputedStyle(sticky).opacity),
            // "On screen" means: not behind the header, and with a usable height
            // left in the viewport.
            heroUsable: heroRect.bottom > ${HEADER_HEIGHT} + 4 && heroRect.top < window.innerHeight,
            stickyUsable: Number(getComputedStyle(sticky).opacity) > 0.5,
            heroWidth: Math.round(heroRect.width),
            stickyWidth: Math.round(stickyRect.width),
            stickyLeft: Math.round(stickyRect.left),
          };
        })()
      `),
    );

async function main() {
  const browser = await new Browser({ width: 1400, height: 900 }).start();

  try {
    const { tabId, errors } = await browser.visit(`${BASE}/`, { settle: 2500 });
    check("the homepage renders without a runtime error", errors.length === 0, errors.join(" | "));

    console.log("\n— at the top: the hero bar is the one in charge");

    const top = await sample(browser, 0);
    check("phase is expanded at scrollY 0", top.phase === "expanded", `phase=${top.phase}`);
    check("the compact bar is hidden", top.stickyOpacity === 0, `opacity=${top.stickyOpacity}`);
    check("the hero bar is on screen", top.heroUsable === true, JSON.stringify(top));

    console.log("\n— scrolling down hands over, exactly once");

    const down = await sample(browser, 700);
    check("phase is compact", down.phase === "compact", `phase=${down.phase}`);
    check("the compact bar is visible", down.stickyUsable === true, `opacity=${down.stickyOpacity}`);
    check(
      "the hero bar has left, so only one bar is on screen",
      down.heroUsable === false && down.stickyUsable === true,
      JSON.stringify(down),
    );
    check(
      "the compact bar is narrower than the hero bar, not merely moved",
      down.stickyWidth < down.heroWidth,
      `compact ${down.stickyWidth}px vs hero ${down.heroWidth}px`,
    );

    console.log("\n— the phase is latched (the part `scrollY > 100` gets wrong)");

    const deeper = await sample(browser, 2600);
    check("further scrolling down keeps it compact", deeper.phase === "compact", `phase=${deeper.phase}`);

    // The key rule: scrolling up mid-page does NOT expand.
    const upMidPage = await sample(browser, 900);
    check(
      "scrolling up mid-page does NOT expand",
      upMidPage.phase === "compact",
      `phase=${upMidPage.phase} at scrollY ${upMidPage.scrollY}`,
    );
    check(
      "and no second bar appears while it stays compact",
      upMidPage.heroUsable === false && upMidPage.stickyUsable === true,
      JSON.stringify(upMidPage),
    );

    console.log("\n— arriving back at the top restores the hero bar");

    const backToTop = await sample(browser, 0);
    check("phase is expanded again", backToTop.phase === "expanded", `phase=${backToTop.phase}`);
    check("the compact bar is hidden again", backToTop.stickyOpacity === 0, `opacity=${backToTop.stickyOpacity}`);
    check("the hero bar is on screen again", backToTop.heroUsable === true, JSON.stringify(backToTop));

    console.log("\n— the transition is CSS, and stays centred");

    const transition = await browser.evaluate(`
      (() => {
        const wrapper = document.querySelector('[data-phase]');
        const sized = wrapper.firstElementChild;
        return {
          wrapper: getComputedStyle(wrapper).transitionProperty,
          wrapperDuration: getComputedStyle(wrapper).transitionDuration,
          sized: getComputedStyle(sized).transitionProperty,
          sizedDuration: getComputedStyle(sized).transitionDuration,
          willChange: getComputedStyle(wrapper).willChange,
        };
      })()
    `);
    check(
      "the wrapper transitions opacity and transform",
      /opacity/.test(transition.wrapper) && /transform/.test(transition.wrapper),
      JSON.stringify(transition),
    );
    check(
      "the width animates over a real duration (not recomputed per frame)",
      /width/.test(transition.sized) && parseFloat(transition.sizedDuration) > 0.1,
      `${transition.sized} / ${transition.sizedDuration}`,
    );
    check(
      "transform is hinted for the compositor",
      /transform/.test(String(transition.willChange)),
      String(transition.willChange),
    );

    // Centred container + shrinking width = it shortens from both sides inward.
    const centre = await browser.evaluate(`
      (() => {
        const sticky = document.querySelector('[data-phase]');
        const bar = sticky.querySelector('form').getBoundingClientRect();
        const leftGap = bar.left;
        const rightGap = window.innerWidth - bar.right;
        return { leftGap: Math.round(leftGap), rightGap: Math.round(rightGap) };
      })()
    `);
    check(
      "the compact bar is centred, so it shrinks from both sides",
      Math.abs(centre.leftGap - centre.rightGap) <= 2,
      `left ${centre.leftGap}px vs right ${centre.rightGap}px`,
    );

    console.log("\n— reduced motion is respected");

    await browser.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const reduced = await browser.evaluate(`
      (() => {
        const wrapper = document.querySelector('[data-phase]');
        const sized = wrapper.firstElementChild;
        return {
          wrapperProperty: getComputedStyle(wrapper).transitionProperty,
          sizedProperty: getComputedStyle(sized).transitionProperty,
        };
      })()
    `);
    /*
     * `transition-none` sets `transition-property: none` and leaves the duration
     * alone, so the assertion has to look at the property. (Checking the duration
     * first reported this as broken while the transition was, in fact, disabled —
     * a duration only applies to whatever properties are listed.)
     */
    check(
      "transitions are disabled under prefers-reduced-motion",
      reduced.wrapperProperty === "none" && reduced.sizedProperty === "none",
      JSON.stringify(reduced),
    );
    await browser.send("Emulation.setEmulatedMedia", { features: [] });

    // And the emulation itself was doing something: back to normal, the wrapper
    // lists real properties again.
    const restored = await browser.evaluate(
      `getComputedStyle(document.querySelector('[data-phase]')).transitionProperty`,
    );
    check(
      "and the transition comes back when the preference is removed",
      /opacity/.test(String(restored)),
      String(restored),
    );

    console.log("\n— the compact bar is thumb-sized on a phone");

    const phone = await new Browser({ width: 390, height: 844 }).start();
    try {
      const mobile = await phone.visit(`${BASE}/`, { settle: 2500 });
      await phone.evaluate("window.scrollTo(0, 700)");
      await new Promise((resolve) => setTimeout(resolve, 450));
      const targets = await phone.evaluate(`
        (() => {
          const sticky = document.querySelector('[data-phase]');
          const bar = sticky.querySelector('form').getBoundingClientRect();
          const button = sticky.querySelector('button[type=submit]');
          const rect = button.getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            barHeight: Math.round(bar.height),
          };
        })()
      `);
      check(
        "the compact submit button is at least 44px tall on a 390px viewport",
        targets.height >= 44,
        `${targets.width}×${targets.height}`,
      );
      /*
       * And the bar itself has to stay a bar. It used to inherit the hero's
       * column layout on a phone, which made the "compact" state a ~250px panel
       * covering the page it was supposed to give access to — the sticky bar was
       * bigger than the thing it floated over.
       */
      check(
        "the compact bar is a single short row on a phone, not a stacked panel",
        targets.barHeight <= 90,
        `${targets.barHeight}px tall`,
      );
      check("the mobile check raised no runtime error", mobile.errors.length === 0, mobile.errors.join(" | "));
      await phone.screenshot(path.join(SHOTS, "search-compact-mobile.png"));
      await phone.closeTab(mobile.tabId);
    } finally {
      phone.stop();
    }

    // Leave a picture of each state behind for review.
    await sample(browser, 700);
    await browser.screenshot(path.join(SHOTS, "search-compact.png"));
    await sample(browser, 0);
    await browser.screenshot(path.join(SHOTS, "search-expanded.png"));

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
