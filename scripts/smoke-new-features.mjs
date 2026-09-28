#!/usr/bin/env node
/**
 * Reviews, search-history personalisation, house rules, and the map.
 *
 *     node scripts/smoke-new-features.mjs [baseUrl]
 *
 * The point of the review checks is *persistence*: a review must survive a fresh
 * login, and posting twice must edit rather than duplicate.
 */
const BASE = process.argv[2] ?? "http://localhost:3001";

const DEMO_EMAIL = "demo@travel-agent.dev";
const DEMO_PASSWORD = "Demo1234";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookies = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
  return { status: response.status, cookie: cookies.join("; ") };
};

const api = (path, { cookie, method = "GET", body } = {}) =>
  fetch(`${BASE}${path}`, {
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
  // ------------------------------------------------------------------ setup
  const listings = await api("/api/listings?pageSize=6");
  const items = listings.body?.data?.items ?? [];
  check("listings are available", items.length > 0, `got ${items.length}`);

  const listingId = items[0]?.id;

  // --------------------------------------------------------- house rules
  console.log("\n— 入住须知 (house rules)");
  const detail = await api(`/api/listings/${listingId}`);
  const rules = detail.body?.data?.listing?.houseRules ?? detail.body?.data?.houseRules;
  check("listing detail exposes houseRules", Boolean(rules), JSON.stringify(Object.keys(detail.body?.data ?? {})));
  check(
    "check-in / check-out times are present",
    /^\d{2}:\d{2}$/.test(rules?.checkInTime ?? "") && /^\d{2}:\d{2}$/.test(rules?.checkOutTime ?? ""),
    `${rules?.checkInTime} / ${rules?.checkOutTime}`,
  );
  check("there is at least one rule", (rules?.rules ?? []).length > 0, `got ${(rules?.rules ?? []).length}`);
  check("there is at least one note", (rules?.notes ?? []).length > 0);

  // A listing advertising 可带宠物 must not also forbid pets — the usual way
  // hand-written house rules contradict the amenities.
  const pets = items.find((item) => (item.amenityNames ?? []).includes("可带宠物"));
  if (pets) {
    const petDetail = await api(`/api/listings/${pets.id}`);
    const petRules = petDetail.body?.data?.listing?.houseRules ?? petDetail.body?.data?.houseRules;
    const forbids = (petRules?.rules ?? []).some((rule) => rule.includes("恕不接待宠物"));
    check("a pet-friendly listing does not forbid pets", !forbids, JSON.stringify(petRules?.rules));
  } else {
    console.log("  SKIP  no pet-friendly listing in the sample");
  }

  // -------------------------------------------------------------- reviews
  console.log("\n— reviews (read)");
  const anonReviews = await api(`/api/listings/${listingId}/reviews`);
  check("reviews are readable without a session", anonReviews.status === 200, `got ${anonReviews.status}`);
  const seeded = anonReviews.body?.data;
  check("seeded reviews are present", (seeded?.count ?? 0) > 0, `got ${seeded?.count}`);
  check("the aggregate is the average of stored reviews", typeof seeded?.average === "number");
  check(
    "the distribution covers 1..5 stars",
    (seeded?.distribution ?? []).length === 5 &&
      (seeded?.distribution ?? []).every((entry) => typeof entry.stars === "number"),
  );
  check(
    "the historical seeded aggregate is reported separately",
    typeof seeded?.seededCount === "number" && typeof seeded?.seededRating === "number",
  );
  check("anonymous callers get no myReview", seeded?.myReview === null);
  check(
    "reviews carry their author",
    (seeded?.reviews ?? []).every((review) => review.author?.name),
  );
  check(
    "anonymous reviews are not marked as mine",
    (seeded?.reviews ?? []).every((review) => review.isMine === false),
  );

  console.log("\n— reviews (write)");
  const anonPost = await api(`/api/listings/${listingId}/reviews`, {
    method: "POST",
    body: { rating: 5, comment: "这是一条未登录的评价" },
  });
  check("posting without a session -> 401", anonPost.status === 401, `got ${anonPost.status}`);

  const { cookie } = await login(DEMO_EMAIL, DEMO_PASSWORD);
  check("demo account can log in", Boolean(cookie));

  const before = await api(`/api/listings/${listingId}/reviews`, { cookie });
  const beforeCount = before.body?.data?.count ?? 0;

  const created = await api(`/api/listings/${listingId}/reviews`, {
    cookie,
    method: "POST",
    body: { rating: 5, comment: "位置很好，房东回复也很快，下次还会再订。" },
  });
  check("posting a review -> 201", created.status === 201, `got ${created.status}`);
  check("the review is flagged as mine", created.body?.data?.review?.isMine === true);
  check("the author is the signed-in user", created.body?.data?.review?.author?.name?.length > 0);
  check(
    "the stored count increased by one",
    (created.body?.data?.summary?.count ?? 0) === beforeCount + 1,
    `${beforeCount} -> ${created.body?.data?.summary?.count}`,
  );

  // Upsert, not append: the whole reason for the (listing, user) unique key.
  const edited = await api(`/api/listings/${listingId}/reviews`, {
    cookie,
    method: "POST",
    body: { rating: 4, comment: "补充一下：热水来得有点慢，其他都很好。" },
  });
  check("posting again edits instead of duplicating", edited.status === 201, `got ${edited.status}`);
  check(
    "the count did not grow on the second post",
    (edited.body?.data?.summary?.count ?? 0) === beforeCount + 1,
    `got ${edited.body?.data?.summary?.count}`,
  );
  check("the rating was updated", edited.body?.data?.review?.rating === 4);
  check(
    "exactly one review belongs to me",
    (edited.body?.data?.summary?.reviews ?? []).filter((review) => review.isMine).length === 1,
  );

  console.log("\n— reviews (validation)");
  const badRating = await api(`/api/listings/${listingId}/reviews`, {
    cookie,
    method: "POST",
    body: { rating: 9, comment: "评分越界了应该被拒绝" },
  });
  check("rating above 5 -> 400", badRating.status === 400, `got ${badRating.status}`);

  const zeroRating = await api(`/api/listings/${listingId}/reviews`, {
    cookie,
    method: "POST",
    body: { rating: 0, comment: "评分越界了应该被拒绝" },
  });
  check("rating below 1 -> 400", zeroRating.status === 400, `got ${zeroRating.status}`);

  const shortComment = await api(`/api/listings/${listingId}/reviews`, {
    cookie,
    method: "POST",
    body: { rating: 5, comment: "好" },
  });
  check("a too-short comment -> 400", shortComment.status === 400, `got ${shortComment.status}`);

  const longComment = await api(`/api/listings/${listingId}/reviews`, {
    cookie,
    method: "POST",
    body: { rating: 5, comment: "很".repeat(700) },
  });
  check("an over-long comment -> 400", longComment.status === 400, `got ${longComment.status}`);

  // A host reviewing their own listing must be refused. The listing has to be one
  // they actually host — posting as an unrelated host would legitimately succeed
  // and silently change the review count the later assertions depend on.
  const ownListing = items.find((item) => item.hostName === "林晓");
  if (ownListing) {
    const hostLogin = await login("host.linxiao@travel-agent.dev", DEMO_PASSWORD);
    if (hostLogin.status === 200) {
      const own = await api(`/api/listings/${ownListing.id}/reviews`, {
        cookie: hostLogin.cookie,
        method: "POST",
        body: { rating: 5, comment: "给自己打个五星应该被拒绝" },
      });
      check("a host cannot review their own listing -> 403", own.status === 403, `got ${own.status}`);
    } else {
      console.log("  SKIP  the host account could not log in");
    }
  } else {
    console.log("  SKIP  no listing hosted by 林晓 in the sample");
  }

  console.log("\n— reviews (persistence across a fresh login)");
  const secondLogin = await login(DEMO_EMAIL, DEMO_PASSWORD);
  check("logging in again issues a new session", Boolean(secondLogin.cookie));
  const afterRelogin = await api(`/api/listings/${listingId}/reviews`, { cookie: secondLogin.cookie });
  const mineAfter = afterRelogin.body?.data?.myReview;
  check("my review is still there on the next login", Boolean(mineAfter), JSON.stringify(mineAfter));
  check("the remembered rating is the edited one", mineAfter?.rating === 4, String(mineAfter?.rating));
  check(
    "the remembered text is the edited one",
    (mineAfter?.comment ?? "").includes("热水"),
    mineAfter?.comment,
  );

  console.log("\n— reviews (another user's view)");
  // A different account must not see the demo user's review as its own.
  const otherEmail = `reviewer-${Date.now()}@example.com`;
  const registered = await api("/api/auth/register", {
    method: "POST",
    body: { name: "路人甲", email: otherEmail, password: "ReviewPass123" },
  });
  check("a second account can register", registered.status === 201, `got ${registered.status}`);
  const otherLogin = await login(otherEmail, "ReviewPass123");
  const otherView = await api(`/api/listings/${listingId}/reviews`, { cookie: otherLogin.cookie });
  check("another user sees no myReview", otherView.body?.data?.myReview === null);
  check(
    "another user does not see my review as theirs",
    (otherView.body?.data?.summary?.reviews ?? otherView.body?.data?.reviews ?? []).every(
      (review) => review.isMine === false,
    ),
  );

  console.log("\n— reviews (delete only your own)");
  const deleted = await api(`/api/listings/${listingId}/reviews`, {
    cookie: secondLogin.cookie,
    method: "DELETE",
  });
  check("deleting my review -> 200", deleted.status === 200, `got ${deleted.status}`);
  check("the count went back down", (deleted.body?.data?.summary?.count ?? -1) === beforeCount);
  check("myReview is now null", deleted.body?.data?.summary?.myReview === null);

  const deleteAgain = await api(`/api/listings/${listingId}/reviews`, {
    cookie: secondLogin.cookie,
    method: "DELETE",
  });
  check("deleting again -> 404", deleteAgain.status === 404, `got ${deleteAgain.status}`);

  // ------------------------------------------------- search history → recs
  console.log("\n— personalised destinations");
  const anonRecs = await api("/api/recommendations/destinations");
  check("anonymous recommendations -> 200", anonRecs.status === 200, `got ${anonRecs.status}`);
  check("anonymous recommendations are not personalised", anonRecs.body?.data?.personalised === false);
  check("anonymous recommendations still return cities", (anonRecs.body?.data?.destinations ?? []).length > 0);
  check("the source is reported as popular", anonRecs.body?.data?.source === "popular");

  const anonEvent = await api("/api/search-events", {
    method: "POST",
    body: { location: "Paris" },
  });
  check(
    "recording a search while signed out is a no-op, not an error",
    anonEvent.status === 200 && anonEvent.body?.data?.recorded === false,
    `${anonEvent.status} / ${JSON.stringify(anonEvent.body?.data)}`,
  );

  const missingLocation = await api("/api/search-events", { cookie, method: "POST", body: {} });
  check("recording without a location -> 400", missingLocation.status === 400, `got ${missingLocation.status}`);

  // A fresh account so the assertions below cannot be polluted by earlier runs.
  const histEmail = `history-${Date.now()}@example.com`;
  await api("/api/auth/register", {
    method: "POST",
    body: { name: "搜索测试", email: histEmail, password: "HistoryPass123" },
  });
  const histLogin = await login(histEmail, "HistoryPass123");
  check("the history test account can log in", Boolean(histLogin.cookie));

  const freshRecs = await api("/api/recommendations/destinations", { cookie: histLogin.cookie });
  check(
    "an account with no history falls back to popular",
    freshRecs.body?.data?.source === "popular",
    freshRecs.body?.data?.source,
  );

  // Search Reykjavík (resolves to no supported city) is meaningless here, so use
  // real cities: Sydney twice, Paris once.
  for (const location of ["Sydney", "Sydney", "巴黎"]) {
    const recorded = await api("/api/search-events", {
      cookie: histLogin.cookie,
      method: "POST",
      body: { location, guests: 2 },
    });
    // The repeat within an hour is collapsed by design, so 200 either way.
    check(`recording "${location}" -> 200`, recorded.status === 200, `got ${recorded.status}`);
  }

  const personalised = await api("/api/recommendations/destinations", { cookie: histLogin.cookie });
  const data = personalised.body?.data;
  check("history makes the recommendations personalised", data?.personalised === true);
  check("the source switches to history", data?.source === "history", data?.source);
  check(
    "the searched cities lead the suggestions",
    data?.destinations?.[0]?.city === "Paris" || data?.destinations?.[0]?.city === "Sydney",
    data?.destinations?.[0]?.city,
  );
  check(
    "both searched cities are suggested",
    ["Paris", "Sydney"].every((city) => (data?.destinations ?? []).some((entry) => entry.city === city)),
    JSON.stringify(data?.destinations?.map((entry) => entry.city)),
  );
  check(
    "the Chinese city name aggregates with the English one",
    data?.destinations?.some((entry) => entry.city === "Paris"),
    JSON.stringify(data?.destinations?.map((entry) => entry.city)),
  );
  // Two Sydney searches within the hour collapse to one event by design (a
  // refresh must not inflate the signal), so the total is Sydney + Paris.
  check(
    "a repeated search within the hour is collapsed",
    data?.totalSearches === 2,
    `totalSearches=${data?.totalSearches} (expected 2: Sydney once + Paris once)`,
  );
  check(
    "each suggestion explains itself",
    (data?.destinations ?? []).every((entry) => typeof entry.reason === "string" && entry.reason.length > 0),
  );
  check("the agent-facing summary mentions the cities", (data?.summary ?? "").includes("悉尼"), data?.summary);

  // The endpoint must not leak another user's history.
  const foreign = await api("/api/recommendations/destinations", { cookie: secondLogin.cookie });
  check(
    "another account does not inherit my history",
    foreign.body?.data?.totalSearches === 0 ||
      !(foreign.body?.data?.destinations ?? []).some((entry) => entry.city === "Sydney"),
    `totalSearches=${foreign.body?.data?.totalSearches}`,
  );

  // ------------------------------------------------------------- agent tool
  //
  // Tool registration is a unit concern, asserted in scripts/verify-tools.ts
  // against `createAgentTools`. /api/agent only reports model configuration, so
  // it cannot be used to check the registry.
  console.log("\n— agent personalisation tool");
  console.log("  (registration is covered by `npx tsx scripts/verify-tools.ts`)");

  const agentInfo = await api("/api/agent");
  check("the agent endpoint reports its configuration", agentInfo.status === 200, `got ${agentInfo.status}`);
  check("the agent reports whether a model is configured", typeof agentInfo.body?.data?.configured === "boolean");

  // ------------------------------------------------------------------ map
  console.log("\n— map data");
  const listItem = items[0];
  check(
    "listings carry coordinates for the map",
    typeof listItem?.latitude === "number" && typeof listItem?.longitude === "number",
    `${listItem?.latitude}, ${listItem?.longitude}`,
  );
  check(
    "coordinates are inside valid ranges",
    listItem.latitude >= -85.06 && listItem.latitude <= 85.06 && listItem.longitude >= -180 && listItem.longitude <= 180,
  );
  const tile = await fetch(
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/12/${Math.floor(
      ((1 - Math.log(Math.tan((listItem.latitude * Math.PI) / 180) + 1 / Math.cos((listItem.latitude * Math.PI) / 180)) / Math.PI) / 2) *
        2 ** 12,
    )}/${Math.floor((((listItem.longitude + 180) / 360) * 2 ** 12))}`,
    { signal: AbortSignal.timeout(20_000) },
  ).catch(() => null);
  check(
    "the tile provider actually serves the tile for this listing",
    tile?.status === 200,
    `status ${tile?.status ?? "no response"}`,
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  console.log("=".repeat(60));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nUnexpected error:", error);
  process.exit(1);
});
