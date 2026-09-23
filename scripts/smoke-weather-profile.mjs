#!/usr/bin/env node
/**
 * Weather + profile feature tests.
 *
 * Covers the weather API (which calls Open-Meteo, so this suite needs network
 * access), the profile edit / password change endpoints, and — most importantly
 * — that a registered account survives `prisma db seed`.
 *
 * Usage: node scripts/smoke-weather-profile.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://localhost:3001";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: response.status, cookie, body: await response.json() };
};

const api = (path, { cookie, method = "GET", body } = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// ------------------------------------------------------------------- weather
console.log("\n— weather");

const one = await api("/api/weather?city=Tokyo");
check("GET /api/weather?city=Tokyo -> 200", one.status === 200, `got ${one.status}`);
const w = one.body?.data?.weather;
check("returns current temperature", typeof w?.current?.temperature === "number", String(w?.current?.temperature));
check("returns a Chinese description", typeof w?.current?.description === "string" && w.current.description.length > 0, w?.current?.description);
check("returns an icon name", typeof w?.current?.icon === "string" && w.current.icon.length > 0, w?.current?.icon);
check("returns humidity + wind", typeof w?.current?.humidity === "number" && typeof w?.current?.windSpeed === "number");
check("returns a 5-day forecast", (w?.forecast ?? []).length === 5, `got ${(w?.forecast ?? []).length}`);
check(
  "forecast days have hi/lo and an icon",
  (w?.forecast ?? []).every((d) => typeof d.maxTemperature === "number" && typeof d.minTemperature === "number" && d.icon),
);
check("hi >= lo on every day", (w?.forecast ?? []).every((d) => d.maxTemperature >= d.minTemperature));
check("returns an advice line", typeof w?.advice === "string" && w.advice.length > 0, w?.advice);
check("attribution names the provider", w?.provider === "Open-Meteo", w?.provider);
check("city label is localised", w?.cityLabel === "东京", w?.cityLabel);

// Chinese city name should resolve too
const cn = await api(`/api/weather?city=${encodeURIComponent("巴黎")}`);
check("accepts a Chinese city name", cn.body?.data?.weather?.city === "Paris", cn.body?.data?.weather?.city);

// cache: a second call should be served from cache
const again = await api("/api/weather?city=Tokyo");
check("second call is served from cache", again.body?.data?.weather?.cached === true,
  String(again.body?.data?.weather?.cached));

const all = await api("/api/weather?all=1");
check("GET /api/weather?all=1 covers every city", (all.body?.data?.cities ?? []).length === 6,
  `got ${(all.body?.data?.cities ?? []).length}`);

const missing = await api("/api/weather");
check("missing city param -> 400", missing.status === 400, `got ${missing.status}`);

const unknown = await api("/api/weather?city=Atlantis");
check("unknown city -> 404", unknown.status === 404, `got ${unknown.status}`);

// weather shows on the listing detail page
const listings = await api("/api/listings?location=tokyo&pageSize=1");
const listingId = listings.body?.data?.items?.[0]?.id;
const page = await fetch(`${BASE}/listings/${listingId}`);
// React SSR separates adjacent text nodes with an HTML comment, so strip
// comments before matching (e.g. "19<!-- -->°").
const html = (await page.text()).replace(/<!--.*?-->/g, "");
check("listing page renders the weather section", html.includes("当地天气"), "missing 当地天气");
check("listing page shows a temperature", /-?\d+°/.test(html));
check("listing page names the provider", html.includes("Open-Meteo"));

// ------------------------------------------------------------------- profile
console.log("\n— profile");

const anonPatch = await api("/api/users/me", { method: "PATCH", body: { name: "x" } });
check("profile update without a session -> 401", anonPatch.status === 401, `got ${anonPatch.status}`);

// Use a throwaway account so we never mutate the demo user.
const email = `profile-${Date.now()}@example.com`;
const registered = await api("/api/auth/register", {
  method: "POST",
  body: { name: "资料测试", email, password: "OriginalPass123" },
});
check("register a throwaway account -> 201", registered.status === 201, `got ${registered.status}`);
const cookie = (await login(email, "OriginalPass123")).cookie;
check("new account can log in right away", Boolean(cookie));

const updated = await api("/api/users/me", {
  cookie,
  method: "PATCH",
  body: { name: "新昵称", avatar: "https://i.pravatar.cc/160?img=13" },
});
check("PATCH profile -> 200", updated.status === 200, `got ${updated.status}`);
check("name persisted", updated.body?.data?.user?.name === "新昵称", updated.body?.data?.user?.name);
check("avatar persisted", updated.body?.data?.user?.avatar === "https://i.pravatar.cc/160?img=13");

const sessionAfter = await api("/api/auth/session", { cookie });
check("session reflects the new name", sessionAfter.body?.data?.user?.name === "新昵称");

const badAvatar = await api("/api/users/me", { cookie, method: "PATCH", body: { name: "x", avatar: "not-a-url" } });
check("non-URL avatar -> 400", badAvatar.status === 400, `got ${badAvatar.status}`);

const emptyName = await api("/api/users/me", { cookie, method: "PATCH", body: { name: "   " } });
check("blank name -> 400", emptyName.status === 400, `got ${emptyName.status}`);

const cleared = await api("/api/users/me", { cookie, method: "PATCH", body: { name: "新昵称", avatar: "" } });
check("empty avatar clears it", cleared.body?.data?.user?.avatar === null, String(cleared.body?.data?.user?.avatar));

// ---- password
const wrongCurrent = await api("/api/users/me/password", {
  cookie,
  method: "POST",
  body: { currentPassword: "WrongPass123", newPassword: "NewPass12345", confirmPassword: "NewPass12345" },
});
check("wrong current password -> 400", wrongCurrent.status === 400, `got ${wrongCurrent.status}`);

const mismatch = await api("/api/users/me/password", {
  cookie,
  method: "POST",
  body: { currentPassword: "OriginalPass123", newPassword: "NewPass12345", confirmPassword: "Different123" },
});
check("mismatched confirmation -> 400", mismatch.status === 400, `got ${mismatch.status}`);

const tooShort = await api("/api/users/me/password", {
  cookie,
  method: "POST",
  body: { currentPassword: "OriginalPass123", newPassword: "short", confirmPassword: "short" },
});
check("too-short new password -> 400", tooShort.status === 400, `got ${tooShort.status}`);

const changed = await api("/api/users/me/password", {
  cookie,
  method: "POST",
  body: { currentPassword: "OriginalPass123", newPassword: "NewPass12345", confirmPassword: "NewPass12345" },
});
check("change password -> 200", changed.status === 200, `got ${changed.status}`);

const oldLogin = await login(email, "OriginalPass123");
check("old password no longer works -> 401", oldLogin.status === 401, `got ${oldLogin.status}`);
const newLogin = await login(email, "NewPass12345");
check("new password works -> 200", newLogin.status === 200, `got ${newLogin.status}`);

// ---- account survives a re-seed
console.log("\n— account persistence (the re-seed fix)");
const { execFileSync } = await import("node:child_process");
const { loadEnvFile } = await import("node:process");
try {
  loadEnvFile(".env");
} catch {
  // env already provided
}

// Run the seed to prove accounts survive it. On Windows `spawnSync` refuses to
// execute `.cmd` shims, so invoke Prisma's JS entry point with node directly
// rather than going through a shell. Its seed command shells out to `tsx`, so
// node_modules/.bin must be on PATH (npx would normally do that for us).
const { delimiter, resolve } = await import("node:path");
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
  stdio: "ignore",
  env: {
    ...process.env,
    PATH: `${resolve("node_modules/.bin")}${delimiter}${process.env.PATH ?? ""}`,
  },
});

const afterReseed = await login(email, "NewPass12345");
check("ACCOUNT SURVIVES `db:seed`", afterReseed.status === 200, `got ${afterReseed.status}`);
check(
  "profile edits survive too",
  afterReseed.body?.data?.user?.name === "新昵称",
  afterReseed.body?.data?.user?.name,
);

// ---- cleanup: remove the throwaway accounts this script created
const pg = (await import("pg")).default;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const removed = await client.query(
  `DELETE FROM "User" WHERE email LIKE 'profile-%@example.com' OR email LIKE 'realuser@example.com'`,
);
await client.end();
console.log(`  (cleaned up ${removed.rowCount} throwaway account(s))`);

console.log(`\n${"=".repeat(60)}`);
console.log(`PASSED: ${pass}   FAILED: ${fail}`);
console.log("=".repeat(60));
process.exit(fail > 0 ? 1 : 0);
