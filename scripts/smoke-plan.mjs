/**
 * Itinerary API: the plan belongs to one account, and only that account.
 *
 *     node scripts/smoke-plan.mjs [baseUrl]
 *
 * The agent tools are verified separately (`verify-tools.ts`) and they call the service
 * directly — so they prove the *logic*, not the HTTP layer. This suite covers what only
 * the route can get wrong: authentication, request validation, and the ownership rule
 * that a signed-in user must not be able to read, move or delete another user's plan
 * items by guessing ids.
 *
 * Two throwaway `@example.com` accounts, removed at the end.
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

function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(path, { method = "GET", body } = {}) {
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
      if (setCookie) cookie = setCookie;
      return { status: response.status, body: json };
    },
  };
}

const stamp = Date.now();
const password = "Demo1234";

const alice = client();
const bob = client();
const anonymous = client();

const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});
await db.connect();

async function main() {
  console.log("— two throwaway accounts and two real listings");
  const aliceEmail = `plan-alice-${stamp}@example.com`;
  const bobEmail = `plan-bob-${stamp}@example.com`;

  await alice.request("/api/auth/register", {
    method: "POST",
    body: { name: "行程测试甲", email: aliceEmail, password },
  });
  await bob.request("/api/auth/register", {
    method: "POST",
    body: { name: "行程测试乙", email: bobEmail, password },
  });

  const { rows: listings } = await db.query(
    "SELECT id, title FROM \"Listing\" ORDER BY id LIMIT 2",
  );
  check("the catalogue has listings to plan with", listings.length === 2, `${listings.length}`);
  const [first, second] = listings;

  // ------------------------------------------------------------- authentication
  console.log("\n— 未登录不能读取或修改行程");
  const anonGet = await anonymous.request("/api/plan");
  check("GET /api/plan is rejected without a session", anonGet.status === 401, String(anonGet.status));
  const anonPost = await anonymous.request("/api/plan", {
    method: "POST",
    body: { listingId: first.id, day: 1 },
  });
  check("POST /api/plan is rejected without a session", anonPost.status === 401, String(anonPost.status));

  // ---------------------------------------------------------------- happy path
  console.log("\n— 加入、移动、移出");
  const startsEmpty = await alice.request("/api/plan");
  check("a new account starts with an empty plan", startsEmpty.body?.data?.items?.length === 0, JSON.stringify(startsEmpty.body?.data));

  const added = await alice.request("/api/plan", {
    method: "POST",
    body: { listingId: first.id, day: 2, note: "下午到" },
  });
  check("adding returns 200", added.status === 200, String(added.status));
  check("the response carries the new item", added.body?.data?.item?.day === 2, JSON.stringify(added.body?.data?.item));
  check(
    "and the whole updated plan",
    added.body?.data?.items?.length === 1,
    JSON.stringify(added.body?.data?.items?.length),
  );
  check(
    "the item is returned with the listing the UI needs",
    Boolean(added.body?.data?.item?.listing?.title) &&
      typeof added.body?.data?.item?.listing?.pricePerNight === "number",
    JSON.stringify(added.body?.data?.item?.listing),
  );

  const moved = await alice.request("/api/plan", {
    method: "POST",
    body: { listingId: first.id, day: 3 },
  });
  check("re-adding the same listing moves it rather than duplicating", moved.body?.data?.items?.length === 1, JSON.stringify(moved.body?.data?.items?.length));
  check("the item now sits on day 3", moved.body?.data?.items?.[0]?.day === 3, JSON.stringify(moved.body?.data?.items?.[0]?.day));

  await alice.request("/api/plan", { method: "POST", body: { listingId: second.id, day: 3 } });
  const twoItems = await alice.request("/api/plan");
  const ordered = twoItems.body?.data?.items ?? [];
  check("both listings are stored", ordered.length === 2, String(ordered.length));
  check(
    "the plan is returned in reading order (day, then insertion)",
    ordered.every((item, index) => index === 0 || item.day >= ordered[index - 1].day),
    JSON.stringify(ordered.map((item) => item.day)),
  );

  // ---------------------------------------------------------------- validation
  console.log("\n— 参数校验");
  const dayZero = await alice.request("/api/plan", {
    method: "POST",
    body: { listingId: first.id, day: 0 },
  });
  check("day 0 is rejected", dayZero.status === 400, String(dayZero.status));

  const dayTooBig = await alice.request("/api/plan", {
    method: "POST",
    body: { listingId: first.id, day: 999 },
  });
  check("day 999 is rejected", dayTooBig.status === 400, String(dayTooBig.status));

  const unknownListing = await alice.request("/api/plan", {
    method: "POST",
    body: { listingId: "does-not-exist", day: 1 },
  });
  check("an unknown listing is rejected", unknownListing.status === 404, String(unknownListing.status));

  const noListing = await alice.request("/api/plan", { method: "POST", body: { day: 1 } });
  check("a missing listingId is rejected", noListing.status === 404 || noListing.status === 400, String(noListing.status));

  const noTarget = await alice.request("/api/plan", { method: "DELETE" });
  check("DELETE without a target is rejected", noTarget.status === 400, String(noTarget.status));

  // ----------------------------------------------------------------- ownership
  console.log("\n— 越权：另一个账号不能读写别人的行程");
  const bobSees = await bob.request("/api/plan");
  check("the other account's plan is empty", bobSees.body?.data?.items?.length === 0, JSON.stringify(bobSees.body?.data?.items?.length));

  const aliceItemId = (await alice.request("/api/plan")).body?.data?.items?.[0]?.id;
  const bobDeletes = await bob.request(`/api/plan?itemId=${aliceItemId}`, { method: "DELETE" });
  check("deleting someone else's item reports nothing removed", bobDeletes.body?.data?.removed === 0, JSON.stringify(bobDeletes.body?.data));

  const aliceStillThere = (await alice.request("/api/plan")).body?.data?.items?.length;
  check("and the owner's plan is untouched", aliceStillThere === 2, String(aliceStillThere));

  const bobMovesAlice = await bob.request("/api/plan", {
    method: "POST",
    body: { listingId: first.id, day: 5 },
  });
  check(
    "the other account adding the same listing creates its own item, not a move",
    bobMovesAlice.body?.data?.items?.length === 1 &&
      bobMovesAlice.body?.data?.items?.[0]?.day === 5,
    JSON.stringify(bobMovesAlice.body?.data?.items),
  );

  const aliceDaysAfterBob = (await alice.request("/api/plan")).body?.data?.items?.map((item) => item.day);
  check(
    "the owner's days are unchanged",
    aliceDaysAfterBob.every((day) => day === 3),
    JSON.stringify(aliceDaysAfterBob),
  );

  // ------------------------------------------------------------------- removal
  console.log("\n— 移出");
  const removed = await alice.request(`/api/plan?itemId=${aliceItemId}`, { method: "DELETE" });
  check("the owner can remove their own item", removed.body?.data?.removed === 1, JSON.stringify(removed.body?.data));
  check("the response carries the remaining plan", removed.body?.data?.items?.length === 1, JSON.stringify(removed.body?.data?.items?.length));

  const removeAgain = await alice.request(`/api/plan?itemId=${aliceItemId}`, { method: "DELETE" });
  check("removing it twice is not an error", removeAgain.status === 200 && removeAgain.body?.data?.removed === 0, JSON.stringify(removeAgain.body?.data));

  const byListing = await alice.request(`/api/plan?listingId=${second.id}`, { method: "DELETE" });
  check("an item can also be named by listing id (the assistant's way)", byListing.body?.data?.removed === 1, JSON.stringify(byListing.body?.data));

  const finalPlan = await alice.request("/api/plan");
  check("the plan is empty again", finalPlan.body?.data?.items?.length === 0, JSON.stringify(finalPlan.body?.data));

  console.log("\n— cleanup");
  const cleanup = await db.query("DELETE FROM \"User\" WHERE email = ANY($1)", [[aliceEmail, bobEmail]]);
  check("throwaway accounts removed", cleanup.rowCount === 2, String(cleanup.rowCount));
  const leftover = await db.query("SELECT count(*)::int AS n FROM \"PlanItem\" WHERE \"userId\" NOT IN (SELECT id FROM \"User\")");
  check("no orphaned plan items", leftover.rows[0].n === 0, String(leftover.rows[0].n));
}

try {
  await main();
} catch (error) {
  failed++;
  console.log(`  FAIL  suite crashed — ${error.message}`);
} finally {
  await db.end();
}

console.log("\n" + "=".repeat(64));
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("=".repeat(64));
process.exit(failed > 0 ? 1 : 0);
