/**
 * Download the seed listing photos into `public/listings/`.
 *
 * Why: the app previously pointed every listing image at
 * `images.unsplash.com`. From some networks that host is unusable — measured
 * here, a single 148KB photo took **114 seconds**, and roughly a third of
 * requests failed outright after ~10s. Next's image optimizer gives the upstream
 * about 7 seconds and then answers 504, so cards fell back to the placeholder
 * and pages appeared to "never finish loading".
 *
 * There are only 45 distinct photos in the seed (they are reused across
 * listings), so fetching them once and serving them from disk is cheap — and it
 * makes the demo work offline and on a slow link. `next/image` still resizes
 * them per breakpoint, but from local files, so there is no upstream fetch at
 * request time.
 *
 * Resumable and safe to re-run: existing files are skipped unless --force.
 *
 *     node scripts/fetch-listing-images.mjs [--force] [--only photo-id]
 */
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "listings");
const MANIFEST = path.join(OUT_DIR, "manifest.json");

/** Must match `PHOTO_IDS` in prisma/seed.ts. */
const SEED = await readFile(path.join(ROOT, "prisma", "seed.ts"), "utf8");
const block = SEED.match(/const PHOTO_IDS = \[([\s\S]*?)\];/);
if (!block) throw new Error("Could not find PHOTO_IDS in prisma/seed.ts — has the seed changed shape?");
const PHOTO_IDS = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

if (PHOTO_IDS.length === 0) throw new Error("PHOTO_IDS parsed as empty");

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null;

/** Slightly smaller than the old w=1200 so a slow link is likelier to finish. */
const WIDTH = 1080;
const QUALITY = 72;
const CONCURRENCY = 3;
const ATTEMPTS = 4;

const urlFor = (id) =>
  `https://images.unsplash.com/${id}?w=${WIDTH}&q=${QUALITY}&auto=format&fit=crop`;

await mkdir(OUT_DIR, { recursive: true });

const targets = PHOTO_IDS.filter((id) => !only || id === only);
console.log(`\n${targets.length} photo(s) to fetch -> public/listings/\n`);

let done = 0;
let skipped = 0;
const failed = [];

async function fetchOne(id) {
  const file = path.join(OUT_DIR, `${id}.jpg`);

  if (!force) {
    try {
      const info = await stat(file);
      if (info.size > 1024) {
        skipped++;
        return { id, ok: true, skipped: true, bytes: info.size };
      }
    } catch {
      // not present — fall through and download
    }
  }

  let lastError = "unknown";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(urlFor(id), {
        signal: AbortSignal.timeout(180_000),
        headers: { accept: "image/jpeg,image/*" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength < 1024) throw new Error(`suspiciously small (${buffer.byteLength}B)`);

      await writeFile(file, buffer);
      done++;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  ok    ${id}  ${(buffer.byteLength / 1024).toFixed(0)}KB  ${seconds}s`);
      return { id, ok: true, bytes: buffer.byteLength };
    } catch (error) {
      lastError = error.name === "TimeoutError" ? "timeout" : error.message;
      if (attempt < ATTEMPTS) {
        // Back off; the host is flaky rather than down, so a retry often works.
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  failed.push({ id, error: lastError });
  console.log(`  FAIL  ${id}  ${lastError}`);
  return { id, ok: false, error: lastError };
}

// Bounded concurrency, driven by a shared cursor.
let cursor = 0;
async function worker() {
  while (cursor < targets.length) {
    const index = cursor++;
    await fetchOne(targets[index]);
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

// The manifest is what the seed reads, so it must reflect what is really on disk
// (including files fetched by earlier runs).
const available = [];
for (const id of PHOTO_IDS) {
  try {
    const info = await stat(path.join(OUT_DIR, `${id}.jpg`));
    if (info.size > 1024) available.push({ id, bytes: info.size });
  } catch {
    // missing
  }
}

await writeFile(
  MANIFEST,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      width: WIDTH,
      quality: QUALITY,
      expected: PHOTO_IDS.length,
      available: available.length,
      photos: available,
    },
    null,
    2,
  )}\n`,
);

const totalBytes = available.reduce((sum, p) => sum + p.bytes, 0);
console.log(`\n${"=".repeat(58)}`);
console.log(`downloaded: ${done}   already present: ${skipped}   failed: ${failed.length}`);
console.log(`on disk:    ${available.length} / ${PHOTO_IDS.length}   (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`manifest:   public/listings/manifest.json`);
console.log("=".repeat(58));

if (failed.length > 0) {
  console.log("\nFailed ids (re-run this script to retry just these):");
  for (const item of failed) console.log(`  ${item.id}  ${item.error}`);
}

// Not a hard failure: a partial set still beats remote URLs, and the seed falls
// back to the remote URL for anything missing.
process.exit(0);
