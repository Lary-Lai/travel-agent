/**
 * Changing the sign-in address, and saving one profile section at a time.
 *
 *     node scripts/smoke-email-change.mjs [baseUrl]
 *
 * Uses its own throwaway `@example.com` account rather than the demo one: the
 * assertions include "the old address no longer works", which would be a terrible
 * thing to do to the account every other suite signs in with.
 *
 * The partial-update assertions at the end cover the behaviour the per-section
 * save buttons depend on: a request that only carries the personalisation lists
 * must not touch the nickname or the banner.
 */
import pg from "pg";

const BASE = process.argv[2] ?? "http://localhost:3001";

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

async function request(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  const setCookie = (response.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return { status: response.status, body: json, cookie: setCookie };
}

const stamp = Date.now();
const originalEmail = `email-smoke-${stamp}@example.com`;
const newEmail = `email-smoke-${stamp}-new@example.com`;
const password = "Demo1234";
const name = "邮箱测试用户";

const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});
await db.connect();

async function main() {
  console.log("— registering a throwaway account");
  const register = await request("/api/auth/register", {
    method: "POST",
    body: { name, email: originalEmail, password },
  });
  check("registering the test account succeeds", register.status === 201 || register.status === 200, `got ${register.status}`);
  const cookie = register.cookie;
  check("registration returns a session cookie", cookie.includes("ta_session"), cookie);

  console.log("\n— the email endpoint guards the account");
  const noAuth = await request("/api/users/me/email", {
    method: "POST",
    body: { email: newEmail, currentPassword: password },
  });
  check("changing the email requires a session", noAuth.status === 401, `got ${noAuth.status}`);

  const wrongPassword = await request("/api/users/me/email", {
    method: "POST",
    body: { email: newEmail, currentPassword: "not-the-password" },
    cookie,
  });
  check(
    "a wrong current password is rejected",
    wrongPassword.status === 400,
    `got ${wrongPassword.status}`,
  );
  check(
    "and the account still holds the old address",
    (await request("/api/auth/session", { cookie })).body?.data?.user?.email === originalEmail,
  );

  const invalid = await request("/api/users/me/email", {
    method: "POST",
    body: { email: "not-an-email", currentPassword: password },
    cookie,
  });
  check("an invalid address is rejected", invalid.status === 400, `got ${invalid.status}`);

  const same = await request("/api/users/me/email", {
    method: "POST",
    body: { email: originalEmail, currentPassword: password },
    cookie,
  });
  check("re-submitting the same address is rejected", same.status === 400, `got ${same.status}`);

  const taken = await request("/api/users/me/email", {
    method: "POST",
    body: { email: "demo@travel-agent.dev", currentPassword: password },
    cookie,
  });
  check("an address already in use is rejected with 409", taken.status === 409, `got ${taken.status}`);

  console.log("\n— the happy path");
  const changed = await request("/api/users/me/email", {
    method: "POST",
    body: { email: newEmail.toUpperCase(), currentPassword: password },
    cookie,
  });
  check("changing the email succeeds", changed.status === 200, `got ${changed.status}`);
  check(
    "the address is normalised to lower case",
    changed.body?.data?.user?.email === newEmail,
    String(changed.body?.data?.user?.email),
  );

  const session = await request("/api/auth/session", { cookie });
  check(
    "the session reports the new address, so the header and profile agree",
    session.body?.data?.user?.email === newEmail,
    String(session.body?.data?.user?.email),
  );

  const staleLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: originalEmail, password },
  });
  check("the old address can no longer sign in", staleLogin.status === 401, `got ${staleLogin.status}`);

  const freshLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: newEmail, password },
  });
  check("the new address can sign in", freshLogin.status === 200, `got ${freshLogin.status}`);

  const wrongLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: newEmail, password: "wrong-password" },
  });
  check("with the same password as before (it was not changed)", wrongLogin.status === 401, `got ${wrongLogin.status}`);

  console.log("\n— saving one profile section at a time");
  const before = (await request("/api/auth/session", { cookie })).body?.data?.user;
  check("the account starts with its registered name", before?.name === name, String(before?.name));

  const listsOnly = await request("/api/users/me", {
    method: "PATCH",
    // No `name`: this is what the personalisation section sends.
    body: { hobbies: ["观星"], tags: ["慢旅行"] },
    cookie,
  });
  check("a personalisation-only update succeeds", listsOnly.status === 200, `got ${listsOnly.status}`);
  check(
    "and it leaves the nickname alone",
    listsOnly.body?.data?.user?.name === name,
    String(listsOnly.body?.data?.user?.name),
  );
  check(
    "while applying the lists it did send",
    JSON.stringify(listsOnly.body?.data?.user?.hobbies) === JSON.stringify(["观星"]),
    JSON.stringify(listsOnly.body?.data?.user?.hobbies),
  );

  const nameOnly = await request("/api/users/me", {
    method: "PATCH",
    // No lists: this is what the public-details section sends.
    body: { name: `${name}（已改名）` },
    cookie,
  });
  check("a public-details-only update succeeds", nameOnly.status === 200, `got ${nameOnly.status}`);
  check(
    "and it leaves the lists alone",
    JSON.stringify(nameOnly.body?.data?.user?.tags) === JSON.stringify(["慢旅行"]),
    JSON.stringify(nameOnly.body?.data?.user?.tags),
  );

  const emptyName = await request("/api/users/me", {
    method: "PATCH",
    body: { name: "   " },
    cookie,
  });
  check("an explicitly empty nickname is still rejected", emptyName.status === 400, `got ${emptyName.status}`);

  // Clean up: the suite's whole point is that it does not touch the demo account.
  const removed = await db.query(`delete from "User" where email = $1`, [newEmail]);
  check("the throwaway account is removed afterwards", removed.rowCount === 1, `deleted ${removed.rowCount}`);

  console.log(`\n${"=".repeat(58)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log("=".repeat(58));
}

try {
  await main();
} catch (error) {
  console.error(error);
  failed++;
} finally {
  await db.end();
}

process.exit(failed === 0 ? 0 : 1);
