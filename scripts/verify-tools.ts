/**
 * Agent tool verification.
 *
 * Proves the chain the project is really about:
 *   tool -> Service -> Prisma -> PostgreSQL -> real data
 *
 * It calls each tool's `execute` directly (no LLM involved), so it verifies the
 * tools independently of model availability. Write tools are checked against
 * the database afterwards to confirm the row really changed.
 *
 * Run with: npx tsx scripts/verify-tools.ts
 */
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // .env already provided via the environment
}

import type { AgentContext } from "../agent/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal options bag the AI SDK would normally pass to `execute`. */
const EXEC_OPTIONS = { toolCallId: "verify", messages: [] };

async function main() {
  const { prisma } = await import("../lib/db");
  const { createAgentTools, AGENT_TOOL_LABELS } = await import("../agent/tools");
  const { getSession } = await import("../agent/session");

  const demo = await prisma.user.findUniqueOrThrow({
    where: { email: "demo@travel-agent.dev" },
    select: { id: true },
  });

  const sessionId = `verify-tools-${Date.now()}`;
  const context: AgentContext = { userId: demo.id, session: getSession(sessionId) };
  const tools = createAgentTools(context, sessionId);

  /** Call a tool's execute with a loosely typed helper. */
  const run = async (name: keyof typeof tools, input: unknown): Promise<Record<string, unknown>> => {
    // `execute` can also return an AsyncIterable, so widen through `unknown`.
    const execute = (
      tools[name] as unknown as { execute?: (i: unknown, o: unknown) => Promise<unknown> }
    ).execute;
    if (!execute) throw new Error(`tool ${String(name)} has no execute`);
    return (await execute(input, EXEC_OPTIONS)) as Record<string, unknown>;
  };

  // ------------------------------------------------------------ searchListings
  console.log("\n— searchListings (natural-language scenario)");

  const search = await run("searchListings", {
    location: "东京",
    guests: 4,
    budgetPerNight: 800,
    amenities: ["地铁附近"],
    limit: 6,
  });

  check("searchListings returns ok", search.ok === true, JSON.stringify(search).slice(0, 160));

  const criteria = search.criteria as Record<string, unknown> | undefined;
  check(
    "approx budget became a ±30% band (560–1040)",
    (criteria?.budgetBand as { min: number; max: number } | null)?.min === 560 &&
      (criteria?.budgetBand as { min: number; max: number } | null)?.max === 1040,
    JSON.stringify(criteria?.budgetBand),
  );

  const listings = (search.listings ?? []) as Array<Record<string, unknown>>;
  check("found at least one Tokyo listing", listings.length > 0, `got ${listings.length}`);
  check(
    "every result fits 4 guests and the budget band",
    listings.every(
      (l) => Number(l.maxGuests) >= 4 && Number(l.pricePerNight) >= 560 && Number(l.pricePerNight) <= 1040,
    ),
  );
  check(
    "every Chinese-city query result is in Tokyo",
    listings.every((l) => l.city === "Tokyo"),
    listings.map((l) => l.city).join(","),
  );
  check(
    "every result is near the subway (amenity filter honoured)",
    listings.every((l) => l.nearSubway === true),
  );

  // Confirm the ids are real database rows, not synthesized values.
  const ids = listings.map((l) => String(l.id));
  const rowCount = await prisma.listing.count({ where: { id: { in: ids } } });
  check("returned ids exist in PostgreSQL", rowCount === ids.length, `${rowCount}/${ids.length}`);

  // Session memory should now hold the presented order.
  check(
    "session memory recorded presented order",
    context.session.lastListingIds.length === ids.length &&
      context.session.lastListingIds[0] === ids[0],
  );

  // --------------------------------------------------------- getListingDetail
  console.log("\n— getListingDetail");

  const detail = await run("getListingDetail", { position: 1 });
  check("getListingDetail by position works", detail.ok === true);
  const detailListing = detail.listing as Record<string, unknown> | undefined;
  check("detail includes description", typeof detailListing?.description === "string" &&
    String(detailListing.description).length > 20);
  check("detail includes host info", Boolean(detailListing?.host));
  check("detail includes full amenity list", Array.isArray(detailListing?.allAmenities) &&
    (detailListing.allAmenities as unknown[]).length > 0);
  check("detail id matches the first search result", detailListing?.id === ids[0]);

  const missing = await run("getListingDetail", { listingId: "does-not-exist" });
  check("unknown listing returns ok:false (not a crash)", missing.ok === false,
    String(missing.error));

  const outOfRange = await run("getListingDetail", { position: 99 });
  check("out-of-range position returns a friendly error", outOfRange.ok === false);

  // ------------------------------------------------------- recommendListings
  console.log("\n— recommendListings");

  const recommend = await run("recommendListings", {
    location: "东京",
    guests: 4,
    budgetPerNight: 800,
    preferences: ["交通方便", "离地铁近"],
    count: 3,
  });

  check("recommendListings returns ok", recommend.ok === true, JSON.stringify(recommend).slice(0, 160));
  const recommendations = (recommend.recommendations ?? []) as Array<Record<string, unknown>>;
  check("recommends exactly 3", recommendations.length === 3, `got ${recommendations.length}`);
  check(
    "each recommendation carries a reason",
    recommendations.every((r) => typeof r.reason === "string" && String(r.reason).length > 0),
  );
  check(
    "recommendations are ranked 1..n",
    recommendations.every((r, index) => r.rank === index + 1),
  );
  check(
    "recommended ids are real listings",
    (await prisma.listing.count({ where: { id: { in: recommendations.map((r) => String(r.id)) } } })) ===
      recommendations.length,
  );
  check(
    "session memory now points at the recommendations",
    context.session.lastListingIds[0] === String(recommendations[0].id),
  );

  // --------------------------------------------------------- compareListings
  console.log("\n— compareListings");

  const compare = await run("compareListings", {
    positions: [1, 2, 3],
    guests: 4,
    nights: 5,
  });

  check("compareListings returns ok", compare.ok === true, JSON.stringify(compare).slice(0, 200));
  const compared = (compare.compared ?? []) as Array<Record<string, unknown>>;
  check("compares 3 listings", compared.length === 3, `got ${compared.length}`);
  check(
    "each row has price, rating, capacity and amenities",
    compared.every(
      (c) =>
        typeof c.pricePerNight === "number" &&
        typeof c.rating === "number" &&
        typeof c.maxGuests === "number" &&
        Array.isArray(c.keyAmenities),
    ),
  );
  check(
    "totalForStay == pricePerNight * nights",
    compared.every((c) => c.totalForStay === Number(c.pricePerNight) * 5),
  );
  check("fitsGroup computed for 4 guests", compared.every((c) => typeof c.fitsGroup === "boolean"));

  const winners = compare.objectiveWinners as Record<string, { id?: string }> | undefined;
  check("objective winners computed", Boolean(winners?.cheapest?.id && winners?.bestRated?.id));
  const cheapestInRows = compared.reduce((best, c) =>
    Number(c.pricePerNight) < Number(best.pricePerNight) ? c : best,
  );
  check(
    "cheapest winner is actually the cheapest",
    winners?.cheapest?.id === cheapestInRows.id,
  );

  const tooFew = await run("compareListings", { positions: [1] });
  check("comparing a single listing is rejected", tooFew.ok === false);

  // -------------------------------------------------------- wishlist reading
  console.log("\n— getUserWishlists");

  const wishlists = await run("getUserWishlists", {});
  check("getUserWishlists returns ok", wishlists.ok === true);
  check("demo user has seeded wishlists", Number(wishlists.count) >= 2, `got ${wishlists.count}`);

  // ------------------------------------------------------- wishlist writing
  console.log("\n— addToWishlist / removeFromWishlist (real DB writes)");

  const targetName = `AI 验证-${Date.now() % 100000}`;

  const created = await run("createWishlist", { name: targetName });
  check("createWishlist returns ok", created.ok === true, String(created.error));
  const createdId = (created.wishlist as { id?: string } | undefined)?.id;
  check("created wishlist exists in PostgreSQL",
    Boolean(createdId) && (await prisma.wishlist.count({ where: { id: createdId } })) === 1);

  // The headline demo: reference "the first recommendation" by position.
  const added = await run("addToWishlist", { position: 1, wishlistName: targetName });
  check("addToWishlist by position returns ok", added.ok === true, String(added.error));
  check("reported the target wishlist name", added.wishlistName === targetName);

  const firstRecommendedId = String(recommendations[0].id);
  const itemInDb = await prisma.wishlistItem.count({
    where: { wishlistId: createdId, listingId: firstRecommendedId },
  });
  check("WishlistItem row really written to PostgreSQL", itemInDb === 1, `rows=${itemInDb}`);

  const duplicate = await run("addToWishlist", { listingId: firstRecommendedId, wishlistName: targetName });
  check("duplicate add returns ok:false with a friendly message", duplicate.ok === false,
    String(duplicate.error));

  const removed = await run("removeFromWishlist", {
    listingId: firstRecommendedId,
    wishlistId: createdId,
  });
  check("removeFromWishlist returns ok", removed.ok === true, String(removed.error));
  const afterRemove = await prisma.wishlistItem.count({
    where: { wishlistId: createdId, listingId: firstRecommendedId },
  });
  check("WishlistItem row really deleted from PostgreSQL", afterRemove === 0, `rows=${afterRemove}`);

  // Pick a listing the user has NOT saved anywhere, so "not a member" is
  // genuinely true. (The recommended listing may legitimately also live in a
  // seeded wishlist, in which case removal would correctly succeed.)
  const savedRows = await prisma.wishlistItem.findMany({
    where: { wishlist: { userId: demo.id } },
    select: { listingId: true },
  });
  const savedIds = savedRows.map((row) => row.listingId);
  const unsavedListing = await prisma.listing.findFirst({
    where: { id: { notIn: savedIds.length > 0 ? savedIds : ["__none__"] } },
    select: { id: true },
  });

  const removeMissing = await run("removeFromWishlist", {
    listingId: unsavedListing?.id ?? "does-not-exist",
  });
  check(
    "removing a listing that is in no wishlist returns ok:false",
    removeMissing.ok === false,
    String(removeMissing.error),
  );

  // ------------------------------------------------- unauthenticated context
  console.log("\n— unauthenticated behaviour");

  const anonSessionId = `verify-anon-${Date.now()}`;
  const anonTools = createAgentTools(
    { userId: null, session: getSession(anonSessionId) },
    anonSessionId,
  );
  const anonRun = async (name: keyof typeof anonTools, input: unknown) =>
    (await (
      anonTools[name] as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }
    ).execute(input, EXEC_OPTIONS)) as Record<string, unknown>;

  const anonWishlists = await anonRun("getUserWishlists", {});
  check("wishlist tools refuse anonymous callers", anonWishlists.ok === false,
    String(anonWishlists.error));
  check("refusal message tells the user to log in",
    /登录/.test(String(anonWishlists.error)));

  const anonSearch = await anonRun("searchListings", { location: "东京" });
  check("searchListings still works anonymously", anonSearch.ok === true);

  const anonAdd = await anonRun("addToWishlist", { position: 1 });
  check("addToWishlist refuses anonymous callers", anonAdd.ok === false);

  // ------------------------------------------------- search-history tool
  console.log("\n— getMySearchHistory (personalisation)");

  check(
    "the tool is registered in the agent's tool set",
    typeof tools.getMySearchHistory === "object" && tools.getMySearchHistory !== null,
  );
  check(
    "every registered tool has a Chinese label for the UI",
    Object.keys(tools).every((name) => typeof AGENT_TOOL_LABELS[name] === "string"),
    Object.keys(tools).filter((name) => !AGENT_TOOL_LABELS[name]).join(", "),
  );

  const anonHistory = await anonRun("getMySearchHistory", {});
  check("it refuses anonymous callers", anonHistory.ok === false, String(anonHistory.error));
  check(
    "the refusal points the model at asking the user instead",
    /未登录|询问/.test(String(anonHistory.hint)),
    String(anonHistory.hint),
  );

  // Record a couple of searches, then confirm the tool reports them.
  const { recordSearch, getSearchInsights } = await import("../server/personalization.service");

  /*
   * Clear the history FIRST, not just at the end.
   *
   * The assertion below is "the most recent search ranks first", and the ranking
   * sums recency-weighted counts. Any earlier event for this account therefore
   * competes: the browser checks visit `/search?location=Barcelona` with a
   * session, the app records that (by design), and after enough runs Barcelona's
   * accumulated weight beat the freshly recorded city — which is how this suite
   * failed for three rounds with the top city reported as "Tokyo", then
   * "Barcelona", neither of which this test records.
   *
   * Cleaning up afterwards was never enough; the test needs to start from a known
   * empty history to be about what it claims to be about.
   */
  await prisma.searchEvent.deleteMany({ where: { userId: demo.id } });

  await recordSearch(demo.id, { location: "Tokyo" });
  // Spaced deliberately. Two inserts in the *same millisecond* get identical
  // recency weights, so the ordering would then be decided by the tie-break
  // rather than by recency. This assertion is about the weighting, so its inputs
  // have to be ordered in time.
  await new Promise((resolve) => setTimeout(resolve, 20));
  await recordSearch(demo.id, { location: "首尔" });

  const history = await run("getMySearchHistory", {});
  check("it succeeds for a signed-in user", history.ok === true, String(history.error));

  const topCities = (history.topCities ?? []) as Array<{ city: string; cityLabel: string }>;
  check("it reports the searched cities", topCities.length > 0, JSON.stringify(topCities));
  check(
    "the Chinese query resolved to a canonical city",
    topCities.some((entry) => entry.city === "Seoul"),
    JSON.stringify(topCities.map((entry) => entry.city)),
  );
  check(
    "the summary is written for the model to quote",
    /搜索/.test(String(history.summary)),
    String(history.summary),
  );

  // The recency weighting must actually be used, not just counted.
  const insights = await getSearchInsights(demo.id);
  check("insights expose a total count", insights.totalSearches >= 2, String(insights.totalSearches));
  check(
    "the most recent search ranks first",
    insights.topCities[0]?.city === "Seoul",
    insights.topCities[0]?.city,
  );

  // Cleaning up keeps the demo account's history from growing across runs.
  await prisma.searchEvent.deleteMany({ where: { userId: demo.id } });

  // ------------------------------------------------------- itinerary planning
  console.log("\n— getMyPlan / addToPlan / removeFromPlan (第 4 期)");

  // Start from a known state: earlier runs may have left items behind.
  await prisma.planItem.deleteMany({ where: { userId: demo.id } });

  const emptyPlan = await run("getMyPlan", {});
  check("an empty plan is reported as such", emptyPlan.ok === true && emptyPlan.itemCount === 0, JSON.stringify(emptyPlan));

  // A listing to plan with, taken from the real catalogue.
  const planningListing = await prisma.listing.findFirstOrThrow({
    where: { city: "Tokyo" },
    select: { id: true, title: true },
  });

  const planAdded = await run("addToPlan", { listingId: planningListing.id, day: 2 });
  check("a listing can be added to a day", planAdded.ok === true, String(planAdded.error));
  check(
    "the result names the day it landed on",
    (planAdded.added as { day?: number } | undefined)?.day === 2,
    JSON.stringify(planAdded.added),
  );

  const afterAdd = await prisma.planItem.findMany({
    where: { userId: demo.id },
    select: { day: true, listingId: true },
  });
  check("the row really exists in PostgreSQL", afterAdd.length === 1, JSON.stringify(afterAdd));

  /*
   * The semantic that matters most: adding the same listing again **moves** it.
   *
   * The model adds, the user says "actually day 3", the model adds again. If that
   * created a second row the plan would quietly contain duplicates the user never asked
   * for, and nothing in the UI would explain where they came from.
   */
  const moved = await run("addToPlan", { listingId: planningListing.id, day: 3 });
  const afterMove = await prisma.planItem.findMany({
    where: { userId: demo.id },
    select: { day: true },
  });
  check("re-adding the same listing does not duplicate it", afterMove.length === 1, `${afterMove.length} rows`);
  check("it moves to the new day instead", afterMove[0]?.day === 3, JSON.stringify(afterMove));
  check(
    "and the tool says the day changed",
    (moved.added as { day?: number } | undefined)?.day === 3,
    JSON.stringify(moved.added),
  );

  // The model is told what the day now looks like, or it cannot comment on it.
  check(
    "the result carries the day's contents and the total",
    Array.isArray(moved.daySummary) && moved.totalItems === 1,
    JSON.stringify({ daySummary: moved.daySummary, totalItems: moved.totalItems }),
  );

  // Reading it back is the other half of "the assistant knows your plan".
  const readBack = await run("getMyPlan", {});
  const days = (readBack.days ?? []) as Array<{ day: number; items: Array<{ listingId: string }> }>;
  check("getMyPlan reports the stored item", readBack.itemCount === 1, String(readBack.itemCount));
  check(
    "grouped under its day, with the listing id the model needs",
    days[0]?.day === 3 && days[0]?.items[0]?.listingId === planningListing.id,
    JSON.stringify(days),
  );

  // Position references, the same convention the wishlist tools use.
  const byPosition = await run("addToPlan", { position: 1, day: 1 });
  check(
    "a listing can be referenced by search position",
    byPosition.ok === true,
    String(byPosition.error),
  );

  // Out-of-range days must be refused rather than silently stored.
  const badDay = await run("addToPlan", { listingId: planningListing.id, day: 0 });
  check("day 0 is rejected", badDay.ok === false, JSON.stringify(badDay));
  const hugeDay = await run("addToPlan", { listingId: planningListing.id, day: 999 });
  check("day 999 is rejected", hugeDay.ok === false, JSON.stringify(hugeDay));
  const ghost = await run("addToPlan", { listingId: "does-not-exist", day: 1 });
  check("an unknown listing is rejected", ghost.ok === false, JSON.stringify(ghost));

  const removedFromPlan = await run("removeFromPlan", { listingId: planningListing.id });
  check("it can be taken off the plan", removedFromPlan.ok === true, String(removedFromPlan.error));
  check("and the removal is reported", removedFromPlan.removed === 1, String(removedFromPlan.removed));

  const removeAgain = await run("removeFromPlan", { listingId: planningListing.id });
  check(
    "removing something that is not there is not an error",
    removeAgain.ok === true && removeAgain.removed === 0,
    JSON.stringify(removeAgain),
  );

  // Signed-out callers must be refused, not silently given an empty plan.
  const anonymousTools = createAgentTools({ userId: null, session: getSession(`${sessionId}-anon`) }, "anon");
  const anonExecute = (
    anonymousTools.addToPlan as unknown as { execute: (i: unknown, o: unknown) => Promise<unknown> }
  ).execute;
  const anonResult = (await anonExecute({ listingId: planningListing.id, day: 1 }, EXEC_OPTIONS)) as {
    ok: boolean;
  };
  check("an anonymous visitor cannot write to a plan", anonResult.ok === false, JSON.stringify(anonResult));

  await prisma.planItem.deleteMany({ where: { userId: demo.id } });

  // ---------------------------------------------------------------- cleanup
  await prisma.wishlist.deleteMany({ where: { name: { startsWith: "AI 验证-" } } });
  const leftover = await prisma.wishlist.count({ where: { name: { startsWith: "AI 验证-" } } });
  check("test wishlists cleaned up", leftover === 0);

  await prisma.$disconnect();

  console.log(`\n${"=".repeat(64)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("=".repeat(64));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("\nverify-tools crashed:", error);
  process.exit(1);
});
