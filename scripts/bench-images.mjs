/**
 * Measure how long listing images take to load, before vs after bundling.
 *
 * The old behaviour fetched every photo from `images.unsplash.com` through
 * Next's optimizer, which gives the upstream ~7s and then answers 504 — so cards
 * frequently fell back to a placeholder while the page looked stuck. Photos are
 * now served from `public/listings/`, so the optimizer only reads a local file.
 *
 *     node scripts/bench-images.mjs [baseUrl] [count]
 */
const BASE = process.argv[2] ?? "http://localhost:3001";
const COUNT = Number(process.argv[3] ?? 12);

const listings = await fetch(`${BASE}/api/listings?pageSize=${COUNT}`)
  .then((r) => r.json())
  .then((j) => j.data.items)
  .catch(() => []);

if (listings.length === 0) {
  console.error("No listings returned — is the dev server running?");
  process.exit(1);
}

const local = listings.filter((l) => l.image.startsWith("/listings/")).length;
console.log(`\n${listings.length} listings, ${local} using bundled photos\n`);

async function timeImage(src, width) {
  const url = `${BASE}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const bytes = (await response.arrayBuffer()).byteLength;
    return { status: response.status, ms: Date.now() - started, bytes };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, bytes: 0, error: error.message };
  }
}

// Two widths so the first pass includes cold-cache resizing and the second shows
// the steady state a real visitor gets.
for (const width of [640, 1080]) {
  const results = [];
  for (const listing of listings) {
    results.push(await timeImage(listing.image, width));
  }

  const ok = results.filter((r) => r.status === 200);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const worst = times[times.length - 1] ?? 0;
  const totalBytes = ok.reduce((sum, r) => sum + r.bytes, 0);
  const failures = results.length - ok.length;

  console.log(`w=${width}`);
  console.log(`  200 OK        ${ok.length} / ${results.length}`);
  console.log(`  failures      ${failures}`);
  console.log(`  median        ${p50} ms`);
  console.log(`  slowest       ${worst} ms`);
  console.log(`  payload       ${(totalBytes / 1024).toFixed(0)} KB total`);
  if (failures > 0) {
    console.log(`  statuses      ${[...new Set(results.map((r) => r.status))].join(", ")}`);
  }
  console.log("");
}

// And the destination-card images the home page uses.
const stats = await fetch(`${BASE}/api/meta`).then((r) => r.json());
const cities = stats.data?.cities ?? [];
const cityResults = [];
for (const city of cities) {
  if (city.image) cityResults.push(await timeImage(city.image, 640));
}
const cityOk = cityResults.filter((r) => r.status === 200).length;
console.log(`destination cards: ${cityOk} / ${cityResults.length} loaded`);
if (cityResults.length > 0) {
  const times = cityResults.filter((r) => r.status === 200).map((r) => r.ms).sort((a, b) => a - b);
  console.log(`  median ${times[Math.floor(times.length / 2)] ?? 0} ms   slowest ${times[times.length - 1] ?? 0} ms`);
}
