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
