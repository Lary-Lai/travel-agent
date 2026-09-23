#!/usr/bin/env node
/**
 * End-to-end Agent test over HTTP.
 *
 * Drives the real /api/agent endpoint with a live model and asserts on the
 * streamed UI protocol: which tools the model chose to call, whether the tool
 * results carried real database rows, and whether a wishlist write actually
 * persisted.
 *
 * Usage: node scripts/smoke-agent.mjs   (requires `npm run dev` and a valid AI key)
 */

const BASE = process.argv[2] ?? "http://localhost:3000";
const DEMO = { email: "demo@travel-agent.dev", password: "Demo1234" };

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

let cookie = "";

async function login() {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEMO),
  });
  if (!response.ok) throw new Error(`login failed: HTTP ${response.status}`);
  cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/**
 * Send one user turn and collect the streamed parts.
 * Returns the ordered tool calls with their outputs, plus the final text.
 */
async function runTurn(text, sessionId) {
  const response = await fetch(`${BASE}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({
      sessionId,
      messages: [{ id: `u-${Date.now()}`, role: "user", parts: [{ type: "text", text }] }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  const raw = await response.text();
  const toolCalls = [];
  const toolOutputs = new Map();
  let answer = "";
  let streamError = null;

  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;
    let part;
    try {
      part = JSON.parse(payload);
    } catch {
      continue;
    }

    if (part.type === "error") streamError = part.errorText;
    if (part.type === "text-delta" && typeof part.delta === "string") answer += part.delta;
    if (part.type === "tool-input-available") {
      toolCalls.push({ name: part.toolName, input: part.input });
    }
    if (part.type === "tool-output-available") {
      toolOutputs.set(part.toolCallId ?? toolCalls.length - 1, part.output);
    }
  }

  return { toolCalls, outputs: [...toolOutputs.values()], answer, streamError, raw };
}

/** Collect listings out of whatever shape a tool returned. */
function listingsFrom(outputs) {
  const found = [];
  for (const output of outputs) {
    if (!output || typeof output !== "object") continue;
    if (Array.isArray(output.listings)) found.push(...output.listings);
    if (Array.isArray(output.recommendations)) found.push(...output.recommendations);
    if (Array.isArray(output.compared)) found.push(...output.compared);
  }
  return found;
}

async function main() {
  console.log(`\nAgent end-to-end test against ${BASE}\n`);
  await login();
  console.log("(signed in as the demo user)\n");

  // ------------------------------------------------- 1. natural-language search
  console.log("— 1. 自然语言搜索");
  const search = await runTurn(
    "国庆想去东京玩 5 天，4 个人，每晚预算 800 元左右，希望离地铁近一点。",
    `e2e-search-${Date.now()}`,
  );

  check("stream completed without error", !search.streamError, search.streamError ?? "");
  const searchNames = search.toolCalls.map((c) => c.name);
  check(
    "model called searchListings",
    searchNames.includes("searchListings"),
    `called: ${searchNames.join(",") || "none"}`,
  );

  const searchListings = listingsFrom(search.outputs);
  check("tool returned real listings", searchListings.length > 0, `got ${searchListings.length}`);
  check(
    "listings respect guests>=4 and the ~800 budget band",
    searchListings.every((l) => Number(l.maxGuests) >= 4 && Number(l.pricePerNight) <= 1040),
  );
  check(
    "listings are real Tokyo rows",
    searchListings.length > 0 && searchListings.every((l) => l.city === "Tokyo"),
  );
  check("final answer is non-empty Chinese prose", search.answer.trim().length > 20);
  check(
    "answer quotes a real price from the data",
    searchListings.some((l) => search.answer.includes(String(l.pricePerNight))),
    search.answer.slice(0, 120),
  );

  // ------------------------------------------------------------ 2. recommendation
  console.log("\n— 2. AI 推荐（帮我选三个）");
  const recommend = await runTurn(
    "我和三个朋友去东京，预算每晚 800 元，希望交通方便，帮我选三个。",
    `e2e-recommend-${Date.now()}`,
  );

  check("stream completed without error", !recommend.streamError, recommend.streamError ?? "");
  check(
    "model called recommendListings",
    recommend.toolCalls.some((c) => c.name === "recommendListings"),
    recommend.toolCalls.map((c) => c.name).join(","),
  );
  const recOutput = recommend.outputs.find((o) => Array.isArray(o?.recommendations));
  check("recommendations returned", (recOutput?.recommendations ?? []).length === 3,
    `got ${(recOutput?.recommendations ?? []).length}`);
  check(
    "each recommendation has a reason",
    (recOutput?.recommendations ?? []).every((r) => typeof r.reason === "string" && r.reason.length > 0),
  );

  // ------------------------------------------------- 3. multi-step search+compare
  console.log("\n— 3. 多步工具循环（搜索 → 比较）");
  const compare = await runTurn(
    "先搜索东京适合 4 个人、每晚 800 元左右、离地铁近的房源，然后比较其中前三个哪个更适合四个人。",
    `e2e-compare-${Date.now()}`,
  );

  check("stream completed without error", !compare.streamError, compare.streamError ?? "");
  const compareNames = compare.toolCalls.map((c) => c.name);
  check(
    "model chained multiple tools in one turn",
    compareNames.length >= 2,
    `called: ${compareNames.join(",")}`,
  );
  check(
    "both search and compare were used",
    compareNames.includes("searchListings") && compareNames.includes("compareListings"),
    compareNames.join(","),
  );
  const compareOutput = compare.outputs.find((o) => Array.isArray(o?.compared));
  check("comparison covered 3 listings", (compareOutput?.compared ?? []).length === 3,
    `got ${(compareOutput?.compared ?? []).length}`);
  check("comparison produced objective winners", Boolean(compareOutput?.objectiveWinners?.cheapest?.id));

  // ------------------------------------------------ 4. wishlist write via agent
  console.log("\n— 4. Agent 操作心愿单（真实写库）");
  const wishlistName = `Agent 写入测试-${Date.now() % 100000}`;
  const write = await runTurn(
    `请先帮我创建名为「${wishlistName}」的心愿单，然后搜索东京适合 4 人、每晚 800 元左右的房源，并把第一个加入这个心愿单。`,
    `e2e-wishlist-${Date.now()}`,
  );

  check("stream completed without error", !write.streamError, write.streamError ?? "");
  const writeNames = write.toolCalls.map((c) => c.name);
  check("model called createWishlist", writeNames.includes("createWishlist"), writeNames.join(","));
  check("model called addToWishlist", writeNames.includes("addToWishlist"), writeNames.join(","));

  const addOutput = write.outputs.find((o) => o && o.ok === true && "wishlistName" in o);
  check("addToWishlist reported success", Boolean(addOutput), JSON.stringify(addOutput ?? {}).slice(0, 160));

  // Verify in the database through the API (not just the tool's own claim).
  const wishlistsResponse = await fetch(`${BASE}/api/wishlists`, { headers: { Cookie: cookie } });
  const wishlistsPayload = await wishlistsResponse.json();
  const created = (wishlistsPayload.data?.wishlists ?? []).find((w) => w.name === wishlistName);
  check("wishlist really exists in the database", Boolean(created), `looking for ${wishlistName}`);
  check("wishlist actually contains 1 listing", created?.itemCount === 1, `itemCount=${created?.itemCount}`);
  check(
    "the saved listing is a real Tokyo listing",
    created?.items?.[0]?.listing?.city === "Tokyo",
    created?.items?.[0]?.listing?.city,
  );
  check(
    "agent answer tells the user it was saved",
    /心愿单/.test(write.answer),
    write.answer.slice(0, 120),
  );

  // ------------------------------------------------------ 5. graceful failure
  console.log("\n— 5. 未登录使用收藏类工具");
  const savedCookie = cookie;
  cookie = "";
  const anon = await runTurn("把东京的房源加入我的心愿单", `e2e-anon-${Date.now()}`);
  cookie = savedCookie;

  check("anonymous request does not crash", !anon.streamError, anon.streamError ?? "");
  const anonAdd = anon.outputs.find((o) => o && o.ok === false);
  check(
    "wishlist tool refused and explained why",
    Boolean(anonAdd) && /登录/.test(String(anonAdd.error)),
    JSON.stringify(anonAdd ?? {}).slice(0, 160),
  );

  // cleanup
  if (created) {
    await fetch(`${BASE}/api/wishlists/${created.id}`, { method: "DELETE", headers: { Cookie: cookie } });
  }

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
  console.error("\nsmoke-agent crashed:", error);
  process.exit(1);
});
