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
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Browser, loginCookie } from "./lib/chrome.mjs";
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
          return { cx, cy, covered: !(top === link || link.contains(top)) };
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
      await new Promise((resolve) => setTimeout(resolve, 1800));
      return { found: true, covered: false, path: await browser.evaluate("location.pathname") };
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

    const unsaved = await browser.evaluate(
      `document.body.innerText.includes('未保存') || document.body.innerText.includes('Unsaved')`,
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
