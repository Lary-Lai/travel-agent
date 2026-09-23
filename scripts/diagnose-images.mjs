/**
 * Diagnose listing-image loading.
 *
 * The search page showed several listing cards falling back to the SafeImage
 * placeholder, i.e. /_next/image returned an error for them. This separates the
 * possible causes:
 *
 *   1. the upstream URL is gone / blocked (Unsplash answers 4xx/5xx)
 *   2. the upstream is reachable but too slow (Next aborts, then returns 504)
 *   3. our own optimizer is broken (upstream 200 but optimizer fails)
 *
 * It reads the real listing data through the public API, so it tests exactly the
 * URLs the browser is asked to load. Run it against a live dev server:
 *
 *     node scripts/diagnose-images.mjs [baseUrl] [sampleSize]
 */
const BASE = process.argv[2] ?? "http://localhost:3001";
const SAMPLE = Number(process.argv[3] ?? 8);

/** Next's image optimizer gives the upstream this long before answering 504. */
const NEXT_UPSTREAM_TIMEOUT_MS = 7000;

async function timed(run) {
  const started = Date.now();
  try {
    return { ms: Date.now() - started, ...(await run()) };
  } catch (error) {
    return { ms: Date.now() - started, error: error.name === "TimeoutError" ? "timeout" : error.message };
  }
}

const listings = await fetch(`${BASE}/api/listings?pageSize=${SAMPLE}`)
  .then((r) => r.json())
  .then((j) => j.data.items);

console.log(`\nSampling ${listings.length} listing images\n`);
console.log(
  "  " +
    "listing".padEnd(24) +
    "upstream".padStart(22) +
    "via /_next/image".padStart(22) +
    "  verdict",
);
console.log("  " + "-".repeat(92));

const rows = [];
for (const listing of listings) {
  const url = listing.image;
  if (!url) continue;

  const upstream = await timed(async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  });

  const optimized = await timed(async () => {
    const response = await fetch(
      `${BASE}/_next/image?url=${encodeURIComponent(url)}&w=828&q=75`,
      { signal: AbortSignal.timeout(120_000) },
    );
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  });

  let verdict = "ok";
  if (optimized.status === 200) verdict = "ok";
  else if (upstream.status >= 400) verdict = "upstream gone";
  else if (upstream.ms > NEXT_UPSTREAM_TIMEOUT_MS) verdict = "too slow for Next";
  else verdict = "OPTIMIZER BUG?";

  rows.push({ upstream, optimized, verdict, title: listing.title.slice(0, 22) });
}

const fmt = (r) =>
  r.error
    ? `ERR ${r.ms}ms`.padStart(22)
    : `${r.status} ${(r.bytes / 1024).toFixed(0)}KB ${(r.ms / 1000).toFixed(1)}s`.padStart(22);

for (const row of rows) {
  console.log("  " + row.title.padEnd(24) + fmt(row.upstream) + fmt(row.optimized) + "  " + row.verdict);
}

const total = rows.length;
const count = (fn) => rows.filter(fn).length;
const upstreamOk = count((r) => r.upstream.status === 200);
const optimizedOk = count((r) => r.optimized.status === 200);
const slow = count((r) => r.upstream.status === 200 && r.upstream.ms > NEXT_UPSTREAM_TIMEOUT_MS);
const optimizerBug = count((r) => r.verdict === "OPTIMIZER BUG?");

console.log("\n— summary");
console.log(`  upstream returns 200:            ${upstreamOk} / ${total}`);
console.log(`  served by our optimizer:         ${optimizedOk} / ${total}`);
console.log(`  upstream slower than 7s:         ${slow} / ${total}   <- Next aborts these -> 504`);
console.log(`  optimizer failures on a good upstream: ${optimizerBug} / ${total}`);

if (optimizerBug === 0 && optimizedOk < total) {
  console.log("\n  => The optimizer is fine. The failures are the upstream network path");
  console.log("     to images.unsplash.com, not our code.");
}
