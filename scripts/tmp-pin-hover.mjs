/**
 * Throwaway: does hovering a listing pin open a real card, and is the native tooltip gone?
 *
 * Drives a real mouse via CDP (`Input.dispatchMouseEvent`) rather than a synthetic
 * `pointerenter`: the whole feature is "when the pointer rests on the pin", and a
 * synthetic event would not prove the pin is where the mouse thinks it is.
 */
import { Browser, loginCookie } from "./lib/chrome.mjs";

const BASE = process.argv[2] ?? "http://localhost:3001";
const cookie = `${await loginCookie(BASE)}; ta_locale=zh-CN`;

const browser = new Browser({ width: 1500, height: 1100 });
await browser.start();
try {
  const { tabId, errors } = await browser.visit(`${BASE}/plan`, { cookies: cookie, settle: 4000 });

  // Zoom into a city so listing pins exist.
  await browser.evaluate(`
    (() => {
      const city = [...document.querySelectorAll('button[aria-label]')]
        .find((b) => /套房源|listings/.test(b.getAttribute('aria-label') ?? ''));
      city?.click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 2500));

  const before = await browser.evaluate(`
    (() => {
      const pins = [...document.querySelectorAll('[data-map-pin]')];
      return {
        pins: pins.length,
        nativeTitle: pins.filter((p) => p.hasAttribute('title')).length,
        first: pins[0]
          ? (() => {
              const r = pins[0].getBoundingClientRect();
              return { id: pins[0].getAttribute('data-map-pin'), cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
            })()
          : null,
      };
    })()
  `);
  console.log("pins:", JSON.stringify(before));
  console.log("no native title attribute:", before.nativeTitle === 0);

  // Put a real mouse on the first pin and let the hover delay pass.
  await browser.mouseMove(before.first.cx, before.first.cy);
  await new Promise((r) => setTimeout(r, 700));

  const hovered = await browser.evaluate(`
    (() => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return { open: false };
      const text = menu.innerText;
      return {
        open: true,
        width: Math.round(menu.getBoundingClientRect().width),
        hasImage: Boolean(menu.querySelector('img')),
        text: text.replace(/\\n/g, ' | '),
        hasViewLink: /查看详情/.test(text),
        portalParentIsBody: menu.closest('[data-radix-popper-content-wrapper]')?.parentElement?.tagName ?? null,
        insideMap: Boolean(menu.closest('[data-plan-map]')),
      };
    })()
  `);
  console.log("hover card:", JSON.stringify(hovered));
  console.log("runtime errors:", errors.slice(0, 2));

  await browser.screenshot(`${process.cwd()}/data/shots/pin-hover-card.png`);

  // And it must close when the pointer leaves.
  await browser.mouseMove(before.first.cx + 300, before.first.cy + 260);
  await new Promise((r) => setTimeout(r, 700));
  const closed = await browser.evaluate(`Boolean(document.querySelector('[role="menu"]'))`);
  console.log("card still open after moving away:", closed);

  await browser.closeTab(tabId);
} finally {
  browser.stop();
}
