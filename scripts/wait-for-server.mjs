#!/usr/bin/env node
/**
 * Wait until an HTTP endpoint actually answers.
 *
 * `start.cmd` uses this so it can tell the user "the app is ready at
 * http://localhost:3001" *after* verifying it, instead of printing a URL and
 * letting the browser show ERR_CONNECTION_REFUSED. Next.js needs a few seconds
 * to compile the first route, and on a cold machine more than a few.
 *
 *     node scripts/wait-for-server.mjs [url] [timeoutSeconds]
 *
 * Exit 0 = reachable, exit 1 = never came up (with the last error printed).
 */
const url = process.argv[2] ?? "http://127.0.0.1:3001/api/meta";
const timeoutSeconds = Number(process.argv[3] ?? 90);

const deadline = Date.now() + timeoutSeconds * 1000;
let lastError = "no attempt made";
let attempts = 0;
let printedDots = 0;

process.stdout.write("  waiting");

for (;;) {
  attempts++;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      if (printedDots > 0) process.stdout.write("\n");
      console.log(`  server responded after ${attempts} attempt(s) — HTTP ${response.status}`);
      process.exit(0);
    }
    lastError = `HTTP ${response.status}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  if (Date.now() >= deadline) {
    if (printedDots > 0) process.stdout.write("\n");
    console.error(`  server did NOT respond within ${timeoutSeconds}s`);
    console.error(`  last error: ${lastError}`);
    process.exit(1);
  }

  // A dot per second, so a slow cold start looks like progress, not a hang.
  process.stdout.write(".");
  printedDots++;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
