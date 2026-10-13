/**
 * Real-browser route health check, plus the profile upload interaction.
 *
 *     node scripts/check-pages.mjs [baseUrl]
 *
 * Why this exists alongside the API suites: a React component that throws while
 * rendering still returns **HTTP 200** with server-rendered HTML, and a client
 * component that never hydrates looks fine in the response body. Only a browser
 * can tell you the page is actually alive — so every route is loaded here and
 * its uncaught exceptions and console errors are collected.
 *
 * The upload step is the other half: it drives the real `<input type="file">`
 * through the DevTools protocol, so the multipart path is exercised the way a
 * user exercises it rather than the way a test harness does.
 */
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Browser, loginCookie } from "./lib/chrome.mjs";
import { decodePng, neighbourDelta } from "./lib/png.mjs";
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

/**
 * Console errors that describe a *handled* degraded path rather than a broken
 * page. The weather provider is external and occasionally times out; the app
 * logs that and falls back to hiding the strip, which is the designed behaviour.
 * Anything not listed here still fails the route.
 */
const EXPECTED_BACKGROUND_ERRORS = [
  /\[weather\][\s\S]*lookup failed/,
  /\[weather\] request failed/,
];

const api = (path_, { cookie, method = "GET", body } = {}) =>  fetch(`${BASE}${path_}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => null),
  }));

async function main() {
  await mkdir(SHOTS, { recursive: true });
  // Pin the locale so the assertions below are deterministic: without the
  // cookie the page follows the browser's Accept-Language, which in headless
  // Chrome means English and would make every string check locale-dependent.
  const cookie = `${await loginCookie(BASE)}; ta_locale=zh-CN`;

  /*
   * Note before it bites someone again: this script walks the app **signed in**,
   * and the search page records a SearchEvent for a signed-in visitor with a
   * destination (`components/search-recorder.tsx`). So running this file leaves
   * real search history on the demo account — visiting Barcelona here really does
   * add a Barcelona row.
   *
   * That is the app behaving as designed, not a side effect worth patching out.
   * The consequence to know about is that any suite asserting on personalisation
   * MUST clear the history it depends on rather than assume it starts empty:
   * `verify-tools` asserted "the most recent search ranks first" and failed for
   * three rounds once the accumulated rows from these visits outweighed the city
   * it had just recorded. It now clears first.
   */

  // Discover ids for the parameterised routes instead of hardcoding them.
  const listingId = await fetch(`${BASE}/api/listings?pageSize=1`)
    .then((r) => r.json())
    .then((j) => j.data?.items?.[0]?.id);
  const session = await api("/api/auth/session", { cookie });
  const userId = session.body?.data?.user?.id;

  // A real seeded post, so the detail page is captured with content in it.
  const postHref = await fetch(`${BASE}/api/forum/posts?sort=new`)
    .then((r) => r.json())
    .then((j) => (j.data?.posts?.[0]?.id ? `/forum/${j.data.posts[0].id}` : null))
    .catch(() => null);

  /*
   * Reply to the newest seeded post as the demo user, so the "my reply" badge has
   * something to render. It is cleaned up below.
   *
   * This has to be done here, in a browser check, and cannot be an API assertion:
   * the forum detail view fetches its data on the client, so the server-rendered
   * HTML contains a skeleton and no badges at all. An attempt to assert it over
   * HTTP found zero occurrences of either label and looked like a broken fix.
   */
  const postId = postHref?.split("/").pop();
  const createdReply = postId
    ? await api(`/api/forum/posts/${postId}/replies`, {
        cookie,
        method: "POST",
        body: { body: "来自 check-pages 的回复，用于验证徽章文案。" },
      })
    : null;
  const createdReplyId = createdReply?.body?.data?.reply?.id ?? null;

  const browser = await new Browser().start();
  console.log(`  browser: ${browser.process?.spawnfile ?? "chromium"}\n`);

  try {
    /**
     * Routes that must render without a runtime error, with a string that only
     * the real page contains.
     *
     * The marker matters: a 404 is a perfectly healthy React page, so "no
     * runtime error" alone would pass for a route that does not exist. The
     * not-found copy is excluded explicitly for the same reason.
     */
    const routes = [
      ["/", "首页", "旅居 Agent"],
      ["/search?location=Tokyo", "搜索", "东京"],
      ["/wishlist", "心愿单", "心愿单"],
      ["/trips", "行程", "我的行程"],
      ["/profile", "个人主页", "公开资料"],
      ["/forum", "讨论区", "板块"],
      ["/friends", "好友", "好友"],
      [`/listings/${listingId}`, "房源详情", "入住"],
      ...(userId ? [[`/u/${userId}`, "公开主页（自己）", "这是你自己的主页"]] : []),
    ];

    console.log("— every route renders the real page, without a runtime error");
    for (const [href, label, marker] of routes) {
      const { tabId, errors } = await browser.visit(`${BASE}${href}`, { cookies: cookie });
      const text = await browser.evaluate("document.body.innerText");
      const notFound = text.includes("找不到这个页面");
      const found = text.includes(marker);
      const real = errors.filter((error) => !EXPECTED_BACKGROUND_ERRORS.some((re) => re.test(error)));
      const degraded = errors.length - real.length;

      check(
        `${label} ${href}`,
        real.length === 0 && !notFound && found,
        [
          real.length > 0 ? real.map((e) => e.split("\n")[0]).join(" | ") : null,
          notFound ? "rendered the 404 page" : null,
          !found ? `missing expected text ${JSON.stringify(marker)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "",
      );
      if (degraded > 0) console.log(`        note: ${degraded} handled background failure(s) logged`);
      await browser.closeTab(tabId);
    }

    /**
     * The browser tab title gets its own assertion: it comes from
     * `generateMetadata`, not from the page body, so no screenshot of the page
     * shows it — and a rename can leave it saying the old name indefinitely.
     */
    const forumTab = await browser.visit(`${BASE}/forum`, { cookies: cookie });
    const tabTitle = await browser.evaluate("document.title");
    check(
      "the /forum tab title follows the renamed heading",
      tabTitle.includes("讨论区") && !tabTitle.includes("自由讨论区"),
      tabTitle,
    );
    await browser.closeTab(forumTab.tabId);

    // ------------------------------------------------ clicking through the nav
    /**
     * Navigation has to be *clicked*, not just visited.
     *
     * Every check above loads a route directly, which is why none of them would
     * have caught the real bug this section was written for: a half-applied edit
     * left the header referencing an icon before its import, the header threw on
     * render, and every nav link in the app went dead — while the page body was
     * fine and each route still returned 200 when fetched by URL. A user hit it;
     * twenty suites did not.
     *
     * Real mouse events are used rather than `element.click()`, because a
     * synthetic click skips hit-testing and would also pass if an overlay were
     * covering the link.
     */
    console.log("\n— navigating by clicking the header");

    const nav = await browser.visit(`${BASE}/profile`, { cookies: cookie, settle: 2500 });

    const clickNavLink = async (label) => {
      const target = await browser.evaluate(`
        (() => {
          const link = [...document.querySelectorAll('header a')]
            .find((a) => a.textContent.trim() === ${JSON.stringify(label)});
          if (!link) return null;
          const r = link.getBoundingClientRect();
          const cx = Math.round(r.x + r.width / 2);
          const cy = Math.round(r.y + r.height / 2);
          const top = document.elementFromPoint(cx, cy);
          return { cx, cy, covered: !(top === link || link.contains(top)), path: location.pathname };
        })()
      `);
      if (!target) return { found: false };
      if (target.covered) return { found: true, covered: true };

      await browser.send("Input.dispatchMouseEvent", {
        type: "mousePressed", x: target.cx, y: target.cy, button: "left", clickCount: 1,
      });
      await browser.send("Input.dispatchMouseEvent", {
        type: "mouseReleased", x: target.cx, y: target.cy, button: "left", clickCount: 1,
      });

      /*
       * Poll for the path change instead of sleeping a fixed amount.
       *
       * A fixed wait is a flake waiting to happen whenever a route is slow to
       * compile — and a false failure here is indistinguishable from the real
       * "navigation is dead" bug this section exists to catch, which makes it worse
       * than useless.
       */
      const deadline = Date.now() + 8000;
      let path = await browser.evaluate("location.pathname");
      while (path === target.path && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        path = await browser.evaluate("location.pathname");
      }
      return { found: true, covered: false, path };
    };

    // The reported case: profile -> home.
    const toHome = await clickNavLink("首页");
    check(
      "clicking 首页 from the profile page navigates",
      toHome.found && !toHome.covered && toHome.path === "/",
      `found=${toHome.found} covered=${toHome.covered} path=${toHome.path ?? "n/a"}`,
    );

    // And the header keeps working for the rest of the app, in both directions.
    for (const [label, expected, from] of [
      ["旅行圈", "/forum", "/"],
      ["心愿单", "/wishlist", "/forum"],
      ["首页", "/", "/wishlist"],
    ]) {
      await browser.visit(`${BASE}${from}`, { cookies: cookie, settle: 1500 });
      const result = await clickNavLink(label);
      check(
        `clicking ${label} from ${from} navigates to ${expected}`,
        result.found && !result.covered && result.path === expected,
        `found=${result.found} covered=${result.covered} path=${result.path ?? "n/a"}`,
      );
    }

    check(
      "the header never fell back to its error state",
      !(await browser.evaluate(
        `document.querySelector('header').innerText.includes('重新加载')`,
      )),
    );

    await browser.closeTab(nav.tabId);

    // ------------------------------------------------ the avatar hover card
    /**
     * Hovering the avatar must open the account menu, and the menu must survive
     * the trip from the avatar into it.
     *
     * Real pointer input throughout (`Input.dispatchMouseEvent`), because the
     * whole feature is pointer-event driven: a synthetic `mouseenter` would pass
     * even if the handlers were wired to the wrong element, and the delay cannot
     * be observed at all without real timing.
     */
    console.log("\n— hovering the avatar opens the account menu");

    const hover = await browser.visit(`${BASE}/`, { cookies: cookie, settle: 2500 });

    const moveTo = async (x, y) => {
      await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    };
    const pointIn = async (selector) =>
      browser.evaluate(`
        (() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()
      `);
    const menuOpen = () =>
      browser.evaluate(`Boolean(document.querySelector('[role="menu"]'))`);

    const avatar = await pointIn('header button[aria-label="账户菜单"]');
    check("the avatar trigger is on the page", Boolean(avatar), String(avatar));

    if (avatar) {
      await moveTo(avatar.x, avatar.y);
      await new Promise((r) => setTimeout(r, 400));
      check("hovering the avatar opens the menu", (await menuOpen()) === true);

      /*
       * It must then *stay* open while the pointer does not move.
       *
       * This is the assertion whose absence let a real flicker ship. The menu was
       * modal (Radix's default), so opening it set `pointer-events: none` on the
       * page; the avatar stopped receiving pointer events, the browser fired
       * `pointerleave`, the delayed close fired, the menu closed, pointer events
       * returned and `pointerenter` reopened it — cycling roughly every 300ms.
       * Checking "open at 400ms" walked straight past all of it.
       *
       * So: sample repeatedly without moving the pointer, and assert both the
       * symptom (never closed) and the cause (the page never goes inert).
       */
      const stability = [];
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 200));
        stability.push(
          await browser.evaluate(`
            (() => {
              const button = document.querySelector('header button[aria-label="账户菜单"]');
              const r = button.getBoundingClientRect();
              const under = document.elementFromPoint(
                Math.round(r.x + r.width / 2),
                Math.round(r.y + r.height / 2),
              );
              return {
                open: Boolean(document.querySelector('[role="menu"]')),
                bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
                triggerStillHitTestable: Boolean(under && (under === button || button.contains(under))),
              };
            })()
          `),
        );
      }

      const closedSamples = stability.filter((sample) => !sample.open).length;
      check(
        "the menu stays open while the pointer rests on the avatar (no flicker)",
        closedSamples === 0,
        `${closedSamples}/${stability.length} samples were closed`,
      );
      check(
        "the page never goes inert while the menu is open",
        stability.every((sample) => sample.bodyPointerEvents !== "none"),
        `body pointer-events values: ${[...new Set(stability.map((s) => s.bodyPointerEvents))].join(", ")}`,
      );
      check(
        "and the avatar is still hit-testable, so hover does not fight the menu",
        stability.every((sample) => sample.triggerStillHitTestable),
        `${stability.filter((s) => !s.triggerStillHitTestable).length} sample(s) failed hit-testing`,
      );

      /*
       * Compare the chevron in both states rather than asserting on one CSS
       * property by name: Tailwind v4's `rotate-180` writes the standalone
       * `rotate` property, so a `transform`-only assertion reported "none" while
       * the chevron was in fact rotated.
       */
      const chevronStyle = () =>
        browser.evaluate(`
          (() => {
            const button = document.querySelector('header button[aria-label="账户菜单"]');
            const svgs = [...button.querySelectorAll('svg')];
            const chevron = svgs[svgs.length - 1];
            if (!chevron) return null;
            const style = getComputedStyle(chevron);
            return style.rotate + " | " + style.transform;
          })()
        `);

      const chevronOpen = await chevronStyle();
      check("the chevron exists next to the avatar", chevronOpen !== null, String(chevronOpen));

      // Move into the menu, across the gap. This is the case the delay exists for.
      const menuPoint = await pointIn('[role="menu"]');
      if (menuPoint) {
        await moveTo(menuPoint.x, menuPoint.y);
        await new Promise((r) => setTimeout(r, 450));
        check("the menu survives the pointer crossing into it", (await menuOpen()) === true);
        await browser.screenshot(path.join(SHOTS, "account-hover-menu.png"));
      }

      // Leaving both closes it — but not instantly, or the trip above would fail.
      await moveTo(Math.round(700), Math.round(600));
      await new Promise((r) => setTimeout(r, 120));
      check(
        "leaving does not close it instantly (the 250ms delay)",
        (await menuOpen()) === true,
      );
      await new Promise((r) => setTimeout(r, 500));
      check("and it does close once the delay elapses", (await menuOpen()) === false);

      const chevronClosed = await chevronStyle();
      check(
        "the chevron rotates between the closed and open states",
        chevronOpen !== chevronClosed,
        `open "${chevronOpen}" vs closed "${chevronClosed}"`,
      );

      // Clicking the avatar while hover-opened must not toggle it shut: no new
      // pointerenter fires while the pointer has not moved, so it would stay shut.
      await moveTo(avatar.x, avatar.y);
      await new Promise((r) => setTimeout(r, 350));
      await browser.send("Input.dispatchMouseEvent", {
        type: "mousePressed", x: avatar.x, y: avatar.y, button: "left", clickCount: 1,
      });
      await browser.send("Input.dispatchMouseEvent", {
        type: "mouseReleased", x: avatar.x, y: avatar.y, button: "left", clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 250));
      check(
        "clicking the avatar does not close a hover-opened menu",
        (await menuOpen()) === true,
      );

      /*
       * Keyboard path, tested as a keyboard user performs it: focus the trigger,
       * open with Enter, close with Escape. Escape is delivered to whatever holds
       * focus, so pressing it while the menu was opened by *hover* (which does not
       * move focus into the menu) proves nothing about the keyboard flow.
       */
      const pressKey = async (key, code, windowsVirtualKeyCode) => {
        await browser.send("Input.dispatchKeyEvent", {
          type: "keyDown", key, code, windowsVirtualKeyCode,
        });
        await browser.send("Input.dispatchKeyEvent", {
          type: "keyUp", key, code, windowsVirtualKeyCode,
        });
      };

      await moveTo(700, 600);
      await new Promise((r) => setTimeout(r, 600));
      await browser.evaluate(
        `document.querySelector('header button[aria-label="账户菜单"]').focus()`,
      );
      await pressKey("Enter", "Enter", 13);
      await new Promise((r) => setTimeout(r, 400));
      check("Enter on the focused avatar opens the menu", (await menuOpen()) === true);
      check(
        "and focus moved into the menu (so Escape can reach it)",
        await browser.evaluate(`Boolean(document.activeElement?.closest?.('[role="menu"]'))`),
      );

      await pressKey("Escape", "Escape", 27);
      await new Promise((r) => setTimeout(r, 300));
      check("Escape closes the menu", (await menuOpen()) === false);

      // Choosing an item both closes it and navigates.
      await moveTo(avatar.x, avatar.y);
      await new Promise((r) => setTimeout(r, 350));
      const wishlistItem = await browser.evaluate(`
        (() => {
          const item = [...document.querySelectorAll('[role="menuitem"]')]
            .find((el) => el.textContent.includes('心愿单'));
          if (!item) return null;
          const r = item.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()
      `);
      if (wishlistItem) {
        await moveTo(wishlistItem.x, wishlistItem.y);
        await browser.send("Input.dispatchMouseEvent", {
          type: "mousePressed", x: wishlistItem.x, y: wishlistItem.y, button: "left", clickCount: 1,
        });
        await browser.send("Input.dispatchMouseEvent", {
          type: "mouseReleased", x: wishlistItem.x, y: wishlistItem.y, button: "left", clickCount: 1,
        });
        await new Promise((r) => setTimeout(r, 1600));
        const afterSelect = await browser.evaluate(
          `({ path: location.pathname, menu: Boolean(document.querySelector('[role="menu"]')) })`,
        );
        check(
          "choosing 心愿单 navigates there",
          afterSelect.path === "/wishlist",
          String(afterSelect.path),
        );
        check(
          "and the menu does not linger open after the choice",
          afterSelect.menu === false,
          `menu=${afterSelect.menu}`,
        );
      }
    }

    check("the hover card raised no runtime error", hover.errors.length === 0, hover.errors.join(" | "));

    /*
     * The language and theme pickers use the same hook, so they get the same
     * treatment — including the two failure modes that are invisible to a "does it
     * open" check: a menu that closes and reopens on its own, and a page that goes
     * inert while a menu is open.
     *
     * They live in `/settings` now, not the header: language and appearance are
     * preferences, and a header offering three separate preference controls made the
     * user hunt for which one held what.
     */
    for (const [label, selector] of [
      ["language picker", 'main button[aria-label="语言"], button[aria-label="语言"]'],
      ["theme picker", 'main button[aria-label="切换主题"], button[aria-label="切换主题"]'],
    ]) {
      console.log(`\n— hovering the ${label}`);

      const tab = await browser.visit(`${BASE}/settings`, { cookies: cookie, settle: 2500 });
      const target = await pointIn(selector);
      check(`the ${label} trigger is on the page`, Boolean(target), String(target));

      if (target) {
        await moveTo(target.x, target.y);
        await new Promise((r) => setTimeout(r, 400));
        check(`hovering the ${label} opens its menu`, (await menuOpen()) === true);
        await browser.screenshot(
          path.join(SHOTS, label === "language picker" ? "hover-locale-menu.png" : "hover-theme-menu.png"),
        );

        const samples = [];
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 200));
          samples.push(
            await browser.evaluate(`
              ({
                open: Boolean(document.querySelector('[role="menu"]')),
                bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
              })
            `),
          );
        }
        check(
          `the ${label} menu stays open without flickering`,
          samples.every((sample) => sample.open),
          `${samples.filter((s) => !s.open).length}/${samples.length} samples were closed`,
        );
        check(
          `the page never goes inert while the ${label} menu is open`,
          samples.every((sample) => sample.bodyPointerEvents !== "none"),
          `${[...new Set(samples.map((s) => s.bodyPointerEvents))].join(", ")}`,
        );

        // And moving away closes it, so the hover handlers are not one-way.
        await moveTo(700, 600);
        await new Promise((r) => setTimeout(r, 600));
        check(`moving away closes the ${label} menu`, (await menuOpen()) === false);
      }

      await browser.closeTab(tab.tabId);
    }
    await browser.closeTab(hover.tabId);

    // ------------------------------------------- price slider and the reset button
    /**
     * Dragging the price slider and then pressing 重置 must put the slider back too.
     *
     * The reported bug: the reset cleared the results (180 listings again) while the
     * slider and its label stayed at the old drag — a local "in-flight" value in the
     * filter panel that nothing ever invalidated when the filters changed from
     * outside the slider.
     *
     * It needs a **drag**: loading `/search?priceMax=900` sets the committed props
     * directly, so the local override never exists and the bug cannot happen. Only
     * pointer input on the thumb creates the state that went stale, which is why
     * this lives in the browser suite.
     */
    console.log("\n— the price slider and 重置");

    const filters = await browser.visit(`${BASE}/search`, { cookies: cookie, settle: 3000 });

    const readPriceState = () =>
      browser.evaluate(`
        (() => {
          const thumbs = [...document.querySelectorAll('[role="slider"]')];
          return {
            values: thumbs.map((thumb) => Number(thumb.getAttribute('aria-valuenow'))),
            text: document.body.innerText.match(/共找到\\s*[\\d,]+\\s*套房源/)?.[0] ?? null,
          };
        })()
      `);

    const before = await readPriceState();
    check(
      "the search page starts with the full price range",
      before.values.length === 2 && before.values[1] > before.values[0],
      JSON.stringify(before),
    );
    const boundsMax = before.values[1];

    // Drag the upper thumb to about 45% of the track.
    const drag = await browser.evaluate(`
      (() => {
        const thumbs = [...document.querySelectorAll('[role="slider"]')];
        const thumb = thumbs[1];
        const thumbRect = thumb.getBoundingClientRect();

        /*
         * Find the *track*, not the thumb.
         *
         * Radix puts data-orientation on the thumb as well as on the root, so
         * closest('[data-orientation]') returns the 12px thumb and a "45% across"
         * target lands 5px away — the drag then does nothing and looks like an app
         * bug. Walk up to the first ancestor wide enough to be the track.
         */
        let track = thumb.parentElement;
        while (track && track.getBoundingClientRect().width < 100) track = track.parentElement;
        const trackRect = track.getBoundingClientRect();

        return {
          from: {
            x: Math.round(thumbRect.x + thumbRect.width / 2),
            y: Math.round(thumbRect.y + thumbRect.height / 2),
          },
          to: {
            x: Math.round(trackRect.x + trackRect.width * 0.45),
            y: Math.round(thumbRect.y + thumbRect.height / 2),
          },
          trackWidth: Math.round(trackRect.width),
        };
      })()
    `);
    check(
      "the track is wider than the thumb (the drag target is meaningful)",
      drag.trackWidth > 100,
      `track ${drag.trackWidth}px wide`,
    );

    await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: drag.from.x, y: drag.from.y });
    await browser.send("Input.dispatchMouseEvent", {
      type: "mousePressed", x: drag.from.x, y: drag.from.y, button: "left", buttons: 1, clickCount: 1,
    });
    for (let step = 1; step <= 6; step++) {
      await browser.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: Math.round(drag.from.x + ((drag.to.x - drag.from.x) * step) / 6),
        y: drag.from.y,
        // `buttons` has to say the left button is still held, or the framework
        // cannot tell a drag from a hover.
        button: "left",
        buttons: 1,
      });
      await new Promise((r) => setTimeout(r, 60));
    }
    await browser.send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x: drag.to.x, y: drag.to.y, button: "left", buttons: 0, clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const dragged = await readPriceState();
    check(
      "dragging the upper thumb moves it",
      dragged.values[1] < boundsMax,
      `before ${boundsMax}, after ${dragged.values[1]}`,
    );
    check(
      "and the filter is committed to the URL",
      /priceMax=\d+/.test(await browser.evaluate("location.search")),
      await browser.evaluate("location.search"),
    );

    // The reported case: press 重置.
    const resetButton = await browser.evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((el) => el.textContent.trim() === '重置');
        if (!button) return null;
        const r = button.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      })()
    `);
    check("the 重置 button is present", Boolean(resetButton), String(resetButton));

    if (resetButton) {
      await browser.send("Input.dispatchMouseEvent", {
        type: "mousePressed", x: resetButton.x, y: resetButton.y, button: "left", clickCount: 1,
      });
      await browser.send("Input.dispatchMouseEvent", {
        type: "mouseReleased", x: resetButton.x, y: resetButton.y, button: "left", clickCount: 1,
      });
      await new Promise((r) => setTimeout(r, 1800));

      const after = await readPriceState();
      check(
        "重置 clears the price from the URL",
        !/priceM(in|ax)=/.test(await browser.evaluate("location.search")),
        await browser.evaluate("location.search"),
      );
      check(
        "重置 puts the slider back to the full range",
        after.values[1] === boundsMax && after.values[0] === before.values[0],
        `expected [${before.values.join(", ")}], got [${after.values.join(", ")}]`,
      );
      check(
        "and the results go back to everything",
        after.text === before.text,
        `${before.text} -> ${after.text}`,
      );
    }

    check("the filter interaction raised no runtime error", filters.errors.length === 0, filters.errors.join(" | "));
    await browser.closeTab(filters.tabId);

    // -------------------------------------- the host card links to the host
    /**
     * Clicking the host on a listing must reach that host's public profile.
     *
     * The link itself is one line, but "does it land somewhere useful" is not: the
     * profile page decides for itself what a visitor may see, so the assertion
     * covers the destination rendering the host's name rather than a dead end.
     */
    console.log("\n— the host card links to the host's profile");

    if (listingId) {
      const hostTab = await browser.visit(`${BASE}/listings/${listingId}`, {
        cookies: cookie,
        settle: 3000,
      });

      const hostLink = await browser.evaluate(`
        (() => {
          const link = [...document.querySelectorAll('a[href^="/u/"]')][0];
          if (!link) return null;
          const r = link.getBoundingClientRect();
          return {
            href: link.getAttribute('href'),
            text: link.innerText.replace(/\\n/g, ' | ').slice(0, 60),
            x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + Math.min(r.height / 2, 30)),
          };
        })()
      `);
      check("the listing page has a link to the host", Boolean(hostLink), String(hostLink));

      if (hostLink) {
        // Click the avatar itself (the top-left of the card), not the text.
        await browser.send("Input.dispatchMouseEvent", {
          type: "mousePressed", x: hostLink.x, y: hostLink.y, button: "left", clickCount: 1,
        });
        await browser.send("Input.dispatchMouseEvent", {
          type: "mouseReleased", x: hostLink.x, y: hostLink.y, button: "left", clickCount: 1,
        });

        // `nextPath`, not `path`: the module-level `node:path` import is used below
        // for the screenshot path, and a local named `path` shadows it.
        const deadline = Date.now() + 8000;
        let nextPath = await browser.evaluate("location.pathname");
        while (!nextPath.startsWith("/u/") && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 150));
          nextPath = await browser.evaluate("location.pathname");
        }

        check(
          "clicking the host opens their profile",
          nextPath === hostLink.href,
          `expected ${hostLink.href}, got ${nextPath}`,
        );

        const hostName = hostLink.text.split("·").pop()?.trim() ?? "";
        const profileText = await browser.evaluate("document.body.innerText");
        check(
          "and the profile shows the host rather than a dead end",
          hostName.length > 0 && profileText.includes(hostName),
          `looked for "${hostName}" in ${profileText.length} chars`,
        );
        check(
          "the profile page raised no runtime error",
          hostTab.errors.length === 0,
          hostTab.errors.join(" | "),
        );

        /*
         * The travel-profile card must never be an empty box.
         *
         * It was reported as exactly that from a screenshot: a thin blank rounded
         * rectangle, because the card held four chip rows that each render nothing
         * when the owner has declared nothing. A blank card is worse than no card —
         * it reads as a broken page — so this asserts it always has *something*:
         * declared chips, a footprint derived from the owner's public posts, or an
         * explicit line saying there is nothing to show.
         */
        const travelCard = await browser.evaluate(`
          (() => {
            const section = [...document.querySelectorAll('section.rounded-2xl')]
              .find((el) => /标签|足迹|还没有|has not shared|not filled/.test(el.innerText));
            if (!section) return null;
            const text = section.innerText.replace(/\\s+/g, ' ').trim();
            return { text, height: Math.round(section.getBoundingClientRect().height) };
          })()
        `);
        check(
          "the travel-profile card is never an empty box",
          travelCard !== null && travelCard.text.length > 0,
          JSON.stringify(travelCard),
        );

        await browser.screenshot(path.join(SHOTS, "host-profile.png"));

        /*
         * Reviewers are people too: their avatars and names must open the same kind
         * of profile. Asserted by count and by clicking the *last* profile link on
         * the page, which is a reviewer's rather than the host's.
         */
        const back = await browser.visit(`${BASE}/listings/${listingId}`, {
          cookies: cookie,
          settle: 2500,
        });
        const profileLinks = await browser.evaluate(`
          [...document.querySelectorAll('a[href^="/u/"]')].map((a) => a.getAttribute('href'))
        `);
        check(
          "the listing page links to more than just the host",
          profileLinks.length >= 2,
          `${profileLinks.length} profile link(s)`,
        );

        const reviewer = await browser.evaluate(`
          (() => {
            const links = [...document.querySelectorAll('a[href^="/u/"]')];
            const link = links[links.length - 1];
            if (!link) return null;
            /*
             * The review list is far below the fold, and a rect measured off-screen
             * gives coordinates that belong to no visible element — the click then
             * lands nowhere and looks like a broken link. Centre it first.
             */
            link.scrollIntoView({ block: 'center' });
            const r = link.getBoundingClientRect();
            return {
              href: link.getAttribute('href'),
              x: Math.round(r.x + r.width / 2),
              y: Math.round(r.y + r.height / 2),
            };
          })()
        `);
        if (reviewer) {
          await browser.send("Input.dispatchMouseEvent", {
            type: "mousePressed", x: reviewer.x, y: reviewer.y, button: "left", clickCount: 1,
          });
          await browser.send("Input.dispatchMouseEvent", {
            type: "mouseReleased", x: reviewer.x, y: reviewer.y, button: "left", clickCount: 1,
          });
          const reviewDeadline = Date.now() + 8000;
          let reviewPath = await browser.evaluate("location.pathname");
          while (!reviewPath.startsWith("/u/") && Date.now() < reviewDeadline) {
            await new Promise((r) => setTimeout(r, 150));
            reviewPath = await browser.evaluate("location.pathname");
          }
          check(
            "clicking a reviewer opens their profile",
            reviewPath === reviewer.href,
            `expected ${reviewer.href}, got ${reviewPath}`,
          );
        }
        await browser.closeTab(back.tabId);
      }

      await browser.closeTab(hostTab.tabId);
    } else {
      console.log("  SKIP  no listing id available");
    }

    // ------------------------------------------- the profile/settings split
    /**
     * The personal space and the account settings are two surfaces now, and the ☰
     * on the profile opens the same account fields in a drawer.
     *
     * Asserted from the user's side — which fields exist where — rather than by
     * checking that a route returns 200: the point of the split is *what is on
     * which page*, and a route rendering the wrong half would still be 200.
     */
    console.log("\n— 个人空间与账号设置是两个界面");

    const fieldProbe = `
      (() => ({
        hasPassword: Boolean(document.querySelector('input#currentPassword')),
        hasNickname: Boolean(document.querySelector('input#name, input[name="name"]')),
        headings: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()).filter(Boolean),
        hasSettingsButton: [...document.querySelectorAll('button')]
          .some((b) => b.getAttribute('aria-label') === '设置'),
        /** Save/revert buttons rendered in the section action rows. */
        saveBarButtons: [...document.querySelectorAll('button')]
          .filter((b) => /^(保存|保存资料|撤销修改)$/.test(b.textContent.trim())).length,
        // One toggle per notification type. Counted by role, not by tag: this
        // project's Checkbox renders a Radix button with role=checkbox, so looking
        // for an input element found zero while the card was rendering perfectly.
        notificationToggles:
          document.querySelectorAll('[role="checkbox"], input[type="checkbox"]').length,
        // And each must be named, or a screen reader reads five anonymous boxes.
        namedNotificationToggles: [...document.querySelectorAll('[role="checkbox"]')]
          .filter((el) => Boolean(el.getAttribute('aria-label'))).length,
      }))()
    `;

    const settingsTab = await browser.visit(`${BASE}/settings`, { cookies: cookie, settle: 2500 });
    const settingsFields = await browser.evaluate(fieldProbe);
    check("/settings 提供账号字段", settingsFields.hasPassword === true, JSON.stringify(settingsFields));
    check(
      "/settings 不含个人空间的昵称字段",
      settingsFields.hasNickname === false,
      JSON.stringify(settingsFields),
    );
    check(
      "/settings 的两块是账号安全与通知偏好",
      settingsFields.headings.includes("账号安全") && settingsFields.headings.includes("通知偏好"),
      settingsFields.headings.join(" / "),
    );
    check(
      "/settings 含语言与外观（从头部移入）",
      settingsFields.headings.includes("语言与外观"),
      settingsFields.headings.join(" / "),
    );
    check(
      "/settings 不再包含个性化（它属于个人主页）",
      !settingsFields.headings.includes("个性化主页"),
      settingsFields.headings.join(" / "),
    );
    check(
      "/settings 有通知偏好（每种通知一个开关）",
      settingsFields.notificationToggles >= 5,
      `${settingsFields.notificationToggles} toggle(s)`,
    );
    check(
      "每个通知开关都有可读名称",
      settingsFields.namedNotificationToggles >= 5,
      `${settingsFields.namedNotificationToggles} named of ${settingsFields.notificationToggles}`,
    );
    check(
      "/settings 说明邮件通知尚未接入，而不是给一个假开关",
      (await browser.evaluate("document.body.innerText")).includes("邮件提醒"),
    );
    await browser.closeTab(settingsTab.tabId);

    const profileTab = await browser.visit(`${BASE}/profile`, { cookies: cookie, settle: 2500 });
    const profileFields = await browser.evaluate(fieldProbe);
    check("/profile 不再包含密码字段", profileFields.hasPassword === false, JSON.stringify(profileFields));
    check(
      "/profile 保留个人空间的昵称字段",
      profileFields.hasNickname === true,
      JSON.stringify(profileFields),
    );
    check("/profile 有 ☰ 设置入口", profileFields.hasSettingsButton === true, JSON.stringify(profileFields));
    check(
      "/profile 把个性化放回来了",
      profileFields.headings.includes("个性化主页"),
      profileFields.headings.join(" / "),
    );
    /*
     * The save bar must not be there when there is nothing to save.
     *
     * It used to render unconditionally — a strip of permanently disabled buttons —
     * which a user reported as "a white bar with 撤销修改 / 保存资料 that does
     * nothing". Asserting the *clean* state is the only way to catch that: the bar
     * being present when dirty was never the problem.
     */
    check(
      "干净状态下没有那条保存栏",
      profileFields.saveBarButtons === 0,
      `${profileFields.saveBarButtons} 个保存/撤销按钮`,
    );

    // And it must appear once something actually changes.
    await browser.evaluate(`
      (() => {
        const input = document.querySelector('input#name, input[name="name"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, input.value + 'x');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await new Promise((r) => setTimeout(r, 500));
    const dirtyProfile = await browser.evaluate(`
      (() => ({
        saveBarButtons: [...document.querySelectorAll('button')].filter((b) => /保存|撤销修改/.test(b.textContent)).length,
      }))()
    `);
    check(
      "改动后才出现保存栏",
      dirtyProfile.saveBarButtons > 0,
      `${dirtyProfile.saveBarButtons} 个按钮`,
    );

    // Put the nickname back so the rest of the run sees a clean account.
    await browser.evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')].find((b) => /撤销修改/.test(b.textContent));
        button?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));

    // The drawer must carry the account fields, or the two entries disagree.
    // Selected by accessible name, not by visible text: the trigger is icon-only now,
    // so its label lives on `aria-label` and `textContent` is empty.
    await browser.evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((b) => b.getAttribute('aria-label') === '设置');
        button?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 800));
    const drawerFields = await browser.evaluate(`
      (() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return { open: false };
        return {
          open: true,
          hasPassword: Boolean(dialog.querySelector('input#currentPassword')),
          hasNickname: Boolean(dialog.querySelector('input#name, input[name="name"]')),
        };
      })()
    `);
    check("☰ 打开抽屉", drawerFields.open === true, JSON.stringify(drawerFields));
    check(
      "抽屉里是账号字段（与 /settings 一致）",
      drawerFields.open === true && drawerFields.hasPassword === true && drawerFields.hasNickname === false,
      JSON.stringify(drawerFields),
    );
    await browser.closeTab(profileTab.tabId);

    // --------------------------------------------------- the trip planner map
    /**
     * The planner is the one page whose value is entirely in the rendering: markers
     * have to land on their cities, all of them have to be on screen, and clicking
     * one has to actually change what is drawn.
     *
     * The pin count is the assertion that matters. The first version fitted the map
     * to zoom 2 and then clamped it to the listing map's floor of 3, which drew six
     * of the ten cities and looked perfectly normal.
     */
    console.log("\n— 行程规划地图");

    const planTab = await browser.visit(`${BASE}/plan`, { cookies: cookie, settle: 4000 });

    const readMap = () =>
      browser.evaluate(`
        (() => {
          const mosaic = document.querySelector('[data-plan-map]');
          if (!mosaic) return { missing: true };
          const rect = mosaic.getBoundingClientRect();
          const cityPins = [...mosaic.querySelectorAll('button[aria-label]')]
            .filter((b) => /套房源|listings/.test(b.getAttribute('aria-label') ?? ''));
          // Scoped to the map: the sidebar next to it links to the same listings.
          const pins = [...mosaic.querySelectorAll('a[href^="/listings/"]')];
          return {
            cityPins: cityPins.length,
            labels: cityPins.map((p) => p.getAttribute('aria-label')),
            listingPins: pins.length,
            zoom: (document.body.innerText.match(/z(\\d+)/) ?? [])[1] ?? null,
            mosaicWidth: Math.round(rect.width),
            mosaicRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            tileSize: (() => {
              const img = mosaic.querySelector('img[src*="arcgisonline"]');
              if (!img) return null;
              const box = img.getBoundingClientRect();
              return Math.round(box.width) + 'x' + Math.round(box.height);
            })(),
            coversRight: Math.max(...[...mosaic.querySelectorAll('img[src*="arcgisonline"]')].map((i) => i.getBoundingClientRect().right)) >= rect.right - 1,
            coversLeft: Math.min(...[...mosaic.querySelectorAll('img[src*="arcgisonline"]')].map((i) => i.getBoundingClientRect().left)) <= rect.left + 1,
            coversBottom: Math.max(...[...mosaic.querySelectorAll('img[src*="arcgisonline"]')].map((i) => i.getBoundingClientRect().bottom)) >= rect.bottom - 1,
            coversTop: Math.min(...[...mosaic.querySelectorAll('img[src*="arcgisonline"]')].map((i) => i.getBoundingClientRect().top)) <= rect.top + 1,
            heading: document.querySelector('aside h2')?.textContent ?? null,
            pinsInsideMosaic: [...cityPins, ...pins].every((pin) => {
              const box = pin.getBoundingClientRect();
              return box.left >= rect.left - 2 && box.right <= rect.right + 2 &&
                     box.top >= rect.top - 60 && box.bottom <= rect.bottom + 2;
            }),
          };
        })()
      `);

    const world = await readMap();
    check(
      "地图上出现了全部 10 座城市",
      world.cityPins === 10,
      `${world.cityPins} 个城市标签：${(world.labels ?? []).join(", ")}`,
    );

    /*
     * The tiles must actually *paint*.
     *
     * Every DOM-level check here passed while the map was a blank white panel: 9 of 9
     * tiles loaded, `opacity: 1`, HTTP 200 — and each one was 0x0 pixels, because
     * Tailwind's preflight `img { max-width: 100% }` resolved against an
     * absolutely-positioned parent with no width. Presence and opacity are therefore
     * not evidence; the pixels are.
     */
    check(
      "瓦片有真实尺寸（不是被 preflight 压成 0 宽）",
      world.tileSize === "256x256",
      String(world.tileSize),
    );
    check(
      "瓦片铺满整个地图容器（四边不留空白）",
      world.coversRight && world.coversLeft && world.coversTop && world.coversBottom,
      `right=${world.coversRight} left=${world.coversLeft} top=${world.coversTop} bottom=${world.coversBottom}`,
    );

    // And the region is not a flat fill — measured from the screenshot. The helper
    // writes the file rather than returning it, hence the read back.
    const mapShotPath = path.join(SHOTS, "plan-map.png");
    await browser.screenshot(mapShotPath);
    const mapPixels = decodePng(readFileSync(mapShotPath));
    if (world.mosaicRect) {
      const delta = neighbourDelta(mapPixels, {
        x: world.mosaicRect.x,
        y: world.mosaicRect.y,
        width: world.mosaicRect.w,
        height: world.mosaicRect.h,
      });
      check(
        "地图区域内是真实底图（不是纯色空白）",
        delta > 1.5,
        `neighbour delta ${delta.toFixed(2)}`,
      );
    } else {
      console.log("  SKIP  could not measure the map pixels");
    }

    check("城市标签带房源数，可读", (world.labels ?? [])[0]?.includes("套房源"), String(world.labels?.[0]));
    check("初始视图没有房源点（先看城市）", world.listingPins === 0, String(world.listingPins));
    check("城市标签都在地图范围内", world.pinsInsideMosaic === true);
    check(
      // The window is sized to the page's wide column (~795px measured), so the card
      // never clips its own contents. The tile canvas behind it is larger and is
      // clipped by design — see the coverage checks above.
      "地图窗口尺寸符合栏目宽度（768px，不被卡片裁掉）",
      world.mosaicWidth === 768,
      `${world.mosaicWidth}px`,
    );

    // Click a city: the view must zoom and reveal that city's listings only.
    const clickedCity = await browser.evaluate(`
      (() => {
        const pin = [...document.querySelectorAll('button[aria-label]')]
          .find((b) => /套房源|listings/.test(b.getAttribute('aria-label') ?? ''));
        if (!pin) return null;
        const label = pin.getAttribute('aria-label');
        pin.click();
        return label;
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));

    const zoomed = await readMap();
    check("点击城市后进入该城市视图", zoomed.listingPins > 0, `${zoomed.listingPins} 个房源点`);
    check(
      "并且放大了",
      Number(zoomed.zoom) > Number(world.zoom),
      `${world.zoom} -> ${zoomed.zoom}`,
    );
    check(
      "侧栏标题就是被点的城市",
      Boolean(clickedCity) && zoomed.heading === clickedCity.split("：")[0],
      `clicked ${clickedCity} / heading ${zoomed.heading}`,
    );
    check("房源点都在地图范围内", zoomed.pinsInsideMosaic === true);
    check(
      "城市视图只显示该城市的房源",
      zoomed.listingPins <= 18,
      `${zoomed.listingPins} pins`,
    );

    // The AI entry must carry the selection, not just open a drawer.
    const askButton = await browser.evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')].find((b) => /AI/.test(b.textContent));
        return button ? button.textContent.trim() : null;
      })()
    `);
    check("有 AI 咨询入口", Boolean(askButton), String(askButton));

    /*
     * ------------------------------------------------ the itinerary (phase 4)
     *
     * Building a plan by clicking, which is the half of the feature that is not the
     * assistant. The three things that can silently break:
     *   - the add button writes, but the panel does not update (two sources of truth),
     *   - the day stepper is decorative and everything lands on day 1,
     *   - removal leaves the row behind.
     *
     * Everything added here is removed again before the section ends, so the demo
     * account is left with the plan it started with.
     */
    console.log("\n— 行程（第 4 期）");

    const readItinerary = () =>
      browser.evaluate(`
        (() => {
          const panel = document.querySelector('[data-trip-itinerary]');
          if (!panel) return { missing: true };
          const text = panel.innerText;
          const days = [...text.matchAll(/第 (\\d+) 天/g)].map((m) => Number(m[1]));
          return {
            text,
            empty: /行程还是空的/.test(text),
            dayLabels: [...new Set(days)].sort((a, b) => a - b),
            items: [...panel.querySelectorAll('a[href^="/listings/"]')].map((a) => a.textContent.trim()),
            removeButtons: panel.querySelectorAll('button[aria-label^="移出"]').length,
          };
        })()
      `);

    const planned0 = await readItinerary();
    check("行程面板存在", planned0.missing !== true, JSON.stringify(planned0));
    check("初始为空并说明了怎么开始", planned0.empty === true, planned0.text?.slice(0, 80));

    const addButtons = await browser.evaluate(`
      (() => {
        const buttons = [...document.querySelectorAll('button[aria-label^="加入第"]')];
        return { count: buttons.length, label: buttons[0]?.getAttribute('aria-label') ?? null };
      })()
    `);
    check("每个房源都有加入行程的按钮", addButtons.count > 0, JSON.stringify(addButtons));
    check("按钮标明会加到哪一天", /第 1 天/.test(String(addButtons.label)), String(addButtons.label));

    // Add the first listing of the selected city.
    const addedTitle = await browser.evaluate(`
      (() => {
        const link = document.querySelector('aside a[href^="/listings/"]');
        const title = link?.querySelector('span')?.textContent?.trim() ?? null;
        document.querySelector('button[aria-label^="加入第"]')?.click();
        return title;
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const planned1 = await readItinerary();
    check("加入后行程里出现了该房源", planned1.items.some((t) => t.includes(addedTitle ?? "—")), JSON.stringify(planned1.items));
    check("面板立刻更新（不是等刷新）", planned1.empty === false, planned1.text?.slice(0, 60));
    check("移出按钮随条目出现", planned1.removeButtons === 1, String(planned1.removeButtons));

    // The day stepper must actually change which day things land on. Note that clicking
    // the *same* listing's button on another day moves it rather than adding a second
    // item — that is the store-level semantic, and it should hold through the UI too.
    await browser.evaluate(`
      (() => {
        const plus = [...document.querySelectorAll('[data-trip-itinerary] button')]
          .find((b) => /第 2 天/.test(b.getAttribute('aria-label') ?? ''));
        plus?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 400));
    await browser.evaluate(`
      (() => document.querySelector('button[aria-label^="加入第 2 天"]')?.click())()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const movedInUi = await readItinerary();
    check(
      "同一天再次加入会移过去，而不是变成两条",
      movedInUi.items.length === 1 && movedInUi.dayLabels.includes(2),
      `items=${movedInUi.items.length} days=${JSON.stringify(movedInUi.dayLabels)}`,
    );

    // Now a genuinely different listing, which must add rather than move.
    await browser.evaluate(`
      (() => {
        const buttons = [...document.querySelectorAll('button[aria-label^="加入第 2 天"]')];
        buttons[1]?.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 1200));

    const planned2 = await readItinerary();
    check("另一个房源加入后是第二条", planned2.items.length === 2, JSON.stringify(planned2.items));
    check("两条都在第 2 天", planned2.dayLabels.filter((day) => day === 2).length >= 1, JSON.stringify(planned2.dayLabels));
    check(
      "房源行标出已在行程中及所在天",
      /已在行程中/.test(await browser.evaluate(`document.querySelector('aside').innerText`)),
    );

    // Clean up: remove everything this section added.
    await browser.evaluate(`
      (() => {
        for (const button of [...document.querySelectorAll('[data-trip-itinerary] button[aria-label^="移出"]')]) {
          button.click();
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 1500));
    const planned3 = await readItinerary();
    check("移出后行程回到空状态", planned3.empty === true, planned3.text?.slice(0, 60));

    await browser.screenshot(path.join(SHOTS, "plan-itinerary.png"));

    await browser.screenshot(path.join(SHOTS, "plan-city-view.png"));
    await browser.closeTab(planTab.tabId);

    // ------------------------------------------------------ forum reply badge
    /**
     * A reply written by the signed-in user must be labelled 我的回复, not 我的帖子.
     *
     * The bug was real and user-reported: the reply list reused the *post's* badge
     * key. The API cannot catch it — both replies carry `isMine: true` regardless
     * of the label — so the claim is only observable in rendered markup, which is
     * why it lives here.
     */
    if (postHref && createdReplyId) {
      console.log("\n— the reply badge says 我的回复, not 我的帖子");

      const replyTab = await browser.visit(`${BASE}${postHref}`, { cookies: cookie, settle: 3000 });
      const text = await browser.evaluate("document.body.innerText");
      const countOf = (needle) => text.split(needle).length - 1;

      check(
        "the seeded post is not mine, so 我的帖子 appears zero times",
        countOf("我的帖子") === 0,
        `found ${countOf("我的帖子")}`,
      );
      check(
        "my own reply is labelled 我的回复",
        countOf("我的回复") >= 1,
        `found ${countOf("我的回复")}`,
      );
      check(
        "the page raised no runtime error",
        replyTab.errors.length === 0,
        replyTab.errors.join(" | "),
      );

      await browser.screenshot(path.join(SHOTS, "forum-reply-badge.png"));
      await browser.closeTab(replyTab.tabId);
    } else {
      console.log("\n  SKIP  could not set up a reply for the badge check");
    }

    // Undo the reply so the seeded thread is left as found.
    if (createdReplyId) {
      await api(`/api/forum/replies/${createdReplyId}`, { cookie, method: "DELETE" });
    }

    // ------------------------------------------------- agent composer
    /**
     * The composer must stay editable while the assistant is streaming.
     *
     * This is a behaviour, not a layout, so it needs the real thing: a real send,
     * a real stream in flight, and a real keystroke. It also covers the trap that
     * made "just remove `disabled`" insufficient — Enter during a reply has to
     * leave the typed text alone, because the provider silently ignores the send
     * and the debugged version cleared the box on top of that.
     */
    console.log("\n— the agent composer while a reply is streaming");

    const chat = await browser.visit(`${BASE}/search?location=Barcelona`, {
      cookies: cookie,
      settle: 2500,
    });

    await browser.evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((el) => (el.getAttribute('aria-label') ?? '') === 'AI 助手'
                     || /AI 助手/.test(el.textContent ?? ''));
        if (button) button.click();
        return Boolean(button);
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    /** Type into the composer the way React sees it (native setter + input event). */
    const typeInto = (text) =>
      browser.evaluate(`
        (() => {
          const el = document.querySelector('[role="dialog"] textarea');
          if (!el) return 'no-textarea';
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value',
          ).set;
          setter.call(el, ${JSON.stringify(text)});
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return el.value;
        })()
      `);

    const composerState = () =>
      browser.evaluate(`
        (() => {
          const el = document.querySelector('[role="dialog"] textarea');
          if (!el) return null;
          const buttons = [...document.querySelectorAll('[role="dialog"] button')];
          return {
            value: el.value,
            disabled: el.disabled,
            readOnly: el.readOnly,
            hasStop: buttons.some((b) => /停止生成|Stop generating/.test(b.getAttribute('aria-label') ?? '')),
            hasSend: buttons.some((b) => /发送|Send/.test(b.getAttribute('aria-label') ?? '')),
          };
        })()
      `);

    const DRAFT = "帮我在巴塞罗那找一间能住两人的公寓";
    const typed = await typeInto(DRAFT);
    check("the composer accepts typed text", typed === DRAFT, String(typed));

    // Send it: the send button is the textarea's next sibling in the composer row.
    await browser.evaluate(`
      (() => {
        const el = document.querySelector('[role="dialog"] textarea');
        const button = el?.parentElement?.querySelector('button:last-of-type');
        if (button) button.click();
        return Boolean(button);
      })()
    `);

    // Wait for the reply to actually be in flight (the send button becomes Stop).
    let streaming = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const state = await composerState();
      if (state?.hasStop) {
        streaming = state;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (!streaming) {
      // The model provider is external; an unreachable provider must not look
      // like a broken composer (same rule the weather suite follows).
      console.log("  SKIP  could not observe a stream in flight (provider unreachable?)");
    } else {
      check("a reply is streaming (stop button shown)", streaming.hasStop === true);

      // The message that actually went out, so a mangled draft cannot pass as
      // "typed fine, sent fine".
      const conversation = await browser.evaluate(
        `document.querySelector('[role="dialog"]').innerText`,
      );
      check(
        "the sent message is exactly what was typed",
        conversation.includes(DRAFT),
        conversation.slice(0, 120).replace(/\n/g, " / "),
      );

      check(
        "the composer is NOT disabled while streaming",
        streaming.disabled === false,
        `disabled=${streaming.disabled}`,
      );

      // Draft the next question mid-reply.
      const midTyped = await typeInto("顺便看看有没有带阳台的");
      check(
        "text can be typed while the reply streams",
        midTyped === "顺便看看有没有带阳台的",
        String(midTyped),
      );

      // Enter must not swallow it: the provider refuses a concurrent send, so the
      // box must keep the draft instead of clearing it.
      await browser.evaluate(`
        (() => {
          const el = document.querySelector('[role="dialog"] textarea');
          el.focus();
          el.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', bubbles: true, cancelable: true,
          }));
          return el.value;
        })()
      `);
      await new Promise((resolve) => setTimeout(resolve, 400));

      const afterEnter = await composerState();
      check(
        "Enter during a reply keeps the draft instead of silently dropping it",
        afterEnter?.value === "顺便看看有没有带阳台的",
        `value=${JSON.stringify(afterEnter?.value)} stillStreaming=${afterEnter?.hasStop}`,
      );
      check(
        "and the UI says why Enter did nothing",
        (await browser.evaluate(`document.querySelector('[role="dialog"]').innerText`)).includes(
          "正在回复中",
        ),
      );

      await browser.screenshot(path.join(SHOTS, "agent-composing.png"));

      // Leave no stream running behind us.
      await browser.evaluate(`
        (() => {
          const button = [...document.querySelectorAll('[role="dialog"] button')]
            .find((b) => /停止生成|Stop generating/.test(b.getAttribute('aria-label') ?? ''));
          if (button) button.click();
          return Boolean(button);
        })()
      `);
    }

    check("the agent composer raised no runtime error", chat.errors.length === 0, chat.errors.join(" | "));
    await browser.closeTab(chat.tabId);

    // Rendered from the signed-out perspective too: the public profile and the
    // forum must not fall over for a visitor with no session.
    console.log("\n— and for a signed-out visitor");
    for (const [href, label] of [
      ["/forum", "讨论区"],
      ...(userId ? [[`/u/${userId}`, "公开主页"]] : []),
    ]) {
      const { tabId, errors } = await browser.visit(`${BASE}${href}`, {});
      check(`${label} (未登录) ${href}`, errors.length === 0, errors.map((e) => e.split("\n")[0]).join(" | "));
      await browser.closeTab(tabId);
    }

    // ------------------------------------------------------------- upload
    console.log("\n— uploading a local file through the real file input");

    const { tabId } = await browser.visit(`${BASE}/profile`, { cookies: cookie, settle: 3000 });
    await browser.screenshot(path.join(SHOTS, "profile-upload.png"));

    const inputs = await browser.evaluate(
      `document.querySelectorAll('input[type=file]').length`,
    );
    check("the profile page renders file inputs", inputs >= 2, `found ${inputs}`);

    // A real JPEG from the repo, so the browser sends real bytes.
    const fixture = path.join(process.cwd(), "public", "listings");
    const { readdirSync } = await import("node:fs");
    const photo = readdirSync(fixture)
      .filter((name) => name.endsWith(".jpg"))
      .map((name) => path.join(fixture, name))[0];

    await browser.setFileInput('input[type="file"]', photo);
    // The component uploads on change; wait for the round-trip.
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const previewSrc = await browser.evaluate(
      `document.querySelector('input[type=file]').closest('div').parentElement.querySelector('img')?.getAttribute('src') ?? ''`,
    );
    check(
      "the picked file was uploaded and the preview switched to it",
      /^\/api\/media\/(avatar|cover)-[0-9a-f]{16}\.(jpg|png|webp|gif)$/.test(previewSrc) ||
        /^blob:/.test(previewSrc),
      previewSrc || "(no preview src)",
    );

    /*
     * The unsaved state is now carried by the section's dot (an `aria-label`), not by
     * visible "未保存" text: the always-visible bar that used to provide that text was
     * removed, because a strip of disabled buttons read as broken. Checking `innerText`
     * therefore stopped being a valid way to ask the question — the state is still
     * announced, just to assistive technology rather than to the eye.
     */
    const unsaved = await browser.evaluate(
      `[...document.querySelectorAll('[role="img"][aria-label]')]
         .some((el) => /未保存|Unsaved|Sin guardar|未儲存/.test(el.getAttribute('aria-label') ?? ''))
       || document.querySelectorAll('button').length > 0
          && [...document.querySelectorAll('button')].some((b) => /^保存/.test(b.textContent.trim()))`,
    );
    check("the form notices the change as an unsaved edit", unsaved === true, String(unsaved));

    const errors = browser.errors;
    check("the upload interaction raised no runtime error", errors.length === 0, errors.join(" | "));

    // ------------------------------------------------- visibility dialog
    console.log("\n— the privacy dialog opens and offers all four modes");

    await browser.evaluate(`
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((el) => el.textContent.trim() === '主页可见性');
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const dialogText = await browser.evaluate(
      `document.querySelector('[role=dialog]')?.innerText ?? ''`,
    );
    check("the dialog rendered", dialogText.length > 0, dialogText.slice(0, 60) || "(no dialog)");
    for (const mode of ["所有用户可查看", "仅好友可查看", "指定用户可查看", "仅自己可查看"]) {
      check(`it offers “${mode}”`, dialogText.includes(mode));
    }
    check(
      "and explains that blocks win over everything",
      dialogText.includes("黑名单优先"),
      dialogText.slice(0, 120),
    );
    await browser.screenshot(path.join(SHOTS, "profile-privacy-dialog.png"));

    const dialogErrors = browser.errors;
    check("the dialog raised no runtime error", dialogErrors.length === 0, dialogErrors.join(" | "));
    await browser.closeTab(tabId);

    // ---------------------------------------------------- new pages, visually
    for (const [href, name] of [
      ["/forum", "forum.png"],
      [postHref, "forum-post.png"],
      ["/friends", "friends.png"],
      ...(userId ? [[`/u/${userId}`, "public-profile.png"]] : []),
    ]) {
      if (!href) continue;
      const shot = await browser.visit(`${BASE}${href}`, { cookies: cookie, settle: 3000 });
      await browser.screenshot(path.join(SHOTS, name));
      check(`${name} captured without a runtime error`, shot.errors.length === 0, shot.errors.join(" | "));
      await browser.closeTab(shot.tabId);
    }
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
