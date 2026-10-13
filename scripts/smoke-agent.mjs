#!/usr/bin/env node
/**
 * End-to-end Agent test over HTTP.
 *
 * Drives the real /api/agent endpoint with a live model and asserts on the
 * streamed UI protocol: which tools the model chose to call, whether the tool
 * results carried real database rows, and whether a wishlist write actually
 * persisted. Also covers travel-plan upload (text PDF, scanned PDF, image).
 *
 * Usage: node scripts/smoke-agent.mjs   (requires `npm run dev` and a valid AI key)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// 3001, matching every other suite. It used to default to 3000, which on this machine
// belongs to an unrelated project — so running this suite directly either tested the wrong
// server or failed with a confusing ECONNREFUSED.
const BASE = process.argv[2] ?? "http://localhost:3001";
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
  // ------------------------------------- 5. travel-plan upload (PDF / image)
  console.log("\n— 5. 旅行计划解析（文字版 PDF / 扫描版 PDF / 图片）");

  // Fixtures are generated on demand so a fresh clone can run this suite.
  const TEXT_PDF = "scripts/sample-travel-plan.pdf";
  const SCAN_PDF = "scripts/sample-scanned-plan.pdf";
  const SCAN_JPG = "scripts/sample-scanned-plan.jpg";

  if (!existsSync(TEXT_PDF)) execFileSync("node", ["scripts/make-test-pdf.mjs"], { stdio: "ignore" });
  if (!existsSync(SCAN_PDF)) {
    execFileSync("node", ["scripts/make-scanned-pdf.mjs"], { stdio: "ignore" });
  }

  const uploadFile = async (filePath, mimeType, fileName) => {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(filePath)], { type: mimeType }), fileName);
    const response = await fetch(`${BASE}/api/agent/upload`, { method: "POST", body: form });
    return { status: response.status, body: await response.json() };
  };

  const assertPlan = (label, payload) => {
    const plan = payload?.data?.plan;
    check(`${label}: destination detected`, /东京|Tokyo/i.test(plan?.destination ?? ""), plan?.destination);
    check(`${label}: days detected`, plan?.days === 5, String(plan?.days));
    check(`${label}: guests detected`, plan?.guests === 4, String(plan?.guests));
    check(`${label}: nightly budget detected`, plan?.budgetPerNight === 800, String(plan?.budgetPerNight));
    check(`${label}: places extracted`, (plan?.places ?? []).length >= 3, `got ${(plan?.places ?? []).length}`);
  };

  // --- text-layer PDF: should NOT need OCR
  const textPdf = await uploadFile(TEXT_PDF, "application/pdf", "plan.pdf");
  check("text-layer PDF uploads -> 200", textPdf.status === 200, `got ${textPdf.status}`);
  check("text-layer PDF uses the text layer", textPdf.body?.data?.method === "pdf-text",
    textPdf.body?.data?.method);
  check("text-layer PDF reports its char count", textPdf.body?.data?.textLayerChars > 50,
    String(textPdf.body?.data?.textLayerChars));
  assertPlan("text PDF", textPdf.body);

  // --- scanned PDF: no text layer, must fall back to OCR
  const scanPdf = await uploadFile(SCAN_PDF, "application/pdf", "scan.pdf");
  check("scanned PDF uploads -> 200", scanPdf.status === 200, `got ${scanPdf.status}`);
  check("scanned PDF has no text layer", scanPdf.body?.data?.textLayerChars === 0,
    String(scanPdf.body?.data?.textLayerChars));
  check("scanned PDF falls back to OCR", scanPdf.body?.data?.method === "ocr",
    scanPdf.body?.data?.method);
  check("scanned PDF produced usable text", (scanPdf.body?.data?.textLength ?? 0) > 60,
    String(scanPdf.body?.data?.textLength));
  assertPlan("scanned PDF", scanPdf.body);

  // --- plain image: the "photo of a plan" case
  if (existsSync(SCAN_JPG)) {
    const jpg = await uploadFile(SCAN_JPG, "image/jpeg", "plan.jpg");
    check("image upload (JPG) -> 200", jpg.status === 200, `got ${jpg.status}`);
    check("image upload uses OCR", jpg.body?.data?.method === "ocr", jpg.body?.data?.method);
    assertPlan("image", jpg.body);
  } else {
    check("image fixture present", false, "run: node scripts/make-scanned-pdf.mjs");
  }

  // --- unsupported type is rejected clearly
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("just some text")], { type: "text/plain" }), "notes.txt");
  const rejected = await fetch(`${BASE}/api/agent/upload`, { method: "POST", body: form });
  check("unsupported file type -> 400", rejected.status === 400, `got ${rejected.status}`);

  // ------------------------------------------------------ 6. graceful failure
  console.log("\n— 6. 未登录使用收藏类工具");
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
