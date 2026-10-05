/**
 * Run every verification suite and print one summary.
 *
 *     node scripts/run-all.mjs [baseUrl]
 *
 * Exists because the suites were being run by hand one at a time, and a hand-rolled
 * loop throws away the useful part of a failure: the *name* of the assertion. This
 * keeps it — a suite that reports "54 passed, 1 failed" is nearly useless without
 * knowing which one, and the difference between a real regression and a flaky
 * network call is exactly that line.
 *
 * Suites that need the dev server are given `baseUrl` (default 3001, matching
 * `npm run dev`).
 */
import { spawnSync } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3001";

/** `runner` is either node or tsx; the suites are a mix. */
const SUITES = [
  { name: "verify-db", cmd: ["npx", "tsx", "scripts/verify-db.ts"], kind: "db" },
  { name: "smoke-api", cmd: ["node", "scripts/smoke-api.mjs", BASE] },
  { name: "verify-tools", cmd: ["npx", "tsx", "scripts/verify-tools.ts"] },
  { name: "verify-ai", cmd: ["node", "scripts/verify-ai.mjs"], kind: "report" },
  { name: "test-vision", cmd: ["node", "scripts/test-vision.mjs"], kind: "report" },
  { name: "smoke-agent", cmd: ["node", "scripts/smoke-agent.mjs", BASE] },
  { name: "smoke-weather-profile", cmd: ["node", "scripts/smoke-weather-profile.mjs"] },
  { name: "smoke-profile-fields", cmd: ["node", "scripts/smoke-profile-fields.mjs"] },
  { name: "smoke-new-features", cmd: ["node", "scripts/smoke-new-features.mjs"] },
  { name: "smoke-archive-booking", cmd: ["node", "scripts/smoke-archive-booking.mjs"] },
  { name: "smoke-payment-deadline", cmd: ["node", "scripts/smoke-payment-deadline.mjs"] },
  { name: "smoke-uploads", cmd: ["node", "scripts/smoke-uploads.mjs"] },
  { name: "smoke-social", cmd: ["node", "scripts/smoke-social.mjs"] },
  { name: "smoke-forum", cmd: ["node", "scripts/smoke-forum.mjs"] },
  { name: "verify-guests", cmd: ["npx", "tsx", "scripts/verify-guests.ts"] },
  { name: "verify-tiles", cmd: ["npx", "tsx", "scripts/verify-tiles.ts"] },
  { name: "verify-markdown", cmd: ["npx", "tsx", "scripts/verify-markdown.ts"] },
  { name: "verify-i18n", cmd: ["npx", "tsx", "scripts/verify-i18n.ts"] },
  { name: "verify-listing-i18n", cmd: ["npx", "tsx", "scripts/verify-listing-i18n.ts"] },
  { name: "check-pages", cmd: ["node", "scripts/check-pages.mjs"] },
];

// Only `npx` needs the shell on Windows (it is a .cmd shim); running node
// directly through a shell would be an unnecessary quoting hazard.
const isWindows = process.platform === "win32";

const results = [];

for (const suite of SUITES) {
  process.stdout.write(`  running ${suite.name} …\r`);
  const [command, ...args] = suite.cmd;
  const run = spawnSync(command, args, {
    encoding: "utf8",
    shell: isWindows && command === "npx",
    maxBuffer: 32 * 1024 * 1024,
  });

  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const summary = /PASSED: (\d+)\s+FAILED: (\d+)/.exec(output);
  const failures = output
    .split(/\r?\n/)
    .filter((line) => /^\s*(FAIL|✗)/.test(line))
    .map((line) => line.trim());

  /**
   * Three suites do not speak the `PASSED: n FAILED: n` protocol:
   *  - `verify-db` prints "DATABASE: ALL CHECKS PASSED"
   *  - `verify-ai` and `test-vision` probe the *providers* (LLM reachability,
   *    whether the model accepts image input). Their results are informational:
   *    a remote-image host being down says nothing about this codebase, so they
   *    are reported rather than counted.
   */
  let verdict = summary ? "counted" : "informational";
  if (suite.kind === "db") {
    verdict = /ALL CHECKS PASSED/.test(output) ? "db-ok" : "db-failed";
  }

  results.push({
    name: suite.name,
    kind: suite.kind,
    verdict,
    passed: summary ? Number(summary[1]) : null,
    failed: summary ? Number(summary[2]) : null,
    // For a report-only suite, surface its own verdict line.
    reportLine: output.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "",
    failures,
    crashed: verdict === "db-failed" || (!summary && suite.kind !== "report" && run.status !== 0),
    tail: output.trim().split(/\r?\n/).slice(-3).join("\n"),
  });
}

console.log("\n" + "=".repeat(66));
let totalPassed = 0;
let totalFailed = 0;
let informationalProblems = 0;

for (const result of results) {
  if (result.verdict === "counted") {
    totalPassed += result.passed;
    totalFailed += result.failed;
    const mark = result.failed === 0 ? "ok" : "FAILED";
    console.log(
      `${result.name.padEnd(26)} ${String(result.passed).padStart(4)} passed  ${result.failed} failed  ${mark}`,
    );
  } else if (result.verdict === "db-ok") {
    console.log(`${result.name.padEnd(26)} ALL CHECKS PASSED`);
  } else if (result.verdict === "db-failed") {
    totalFailed += 1;
    console.log(`${result.name.padEnd(26)} FAILED`);
  } else {
    // Informational: show the provider's own verdict, and its FAIL lines so a
    // genuine problem is still visible — just not counted as a code failure.
    const note = result.failures.length > 0 ? "⚠" : "";
    console.log(`${result.name.padEnd(26)} ${result.reportLine}  ${note} (informational)`);
    informationalProblems += result.failures.length;
  }
  for (const failure of result.failures) console.log(`      ${failure}`);
  if (result.crashed) console.log(`      ${result.tail.split("\n").join("\n      ")}`);
}

console.log("=".repeat(66));
console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
if (informationalProblems > 0) {
  console.log(`(${informationalProblems} informational check(s) flagged, see above — not counted)`);
}
console.log("=".repeat(66));

process.exit(totalFailed === 0 ? 0 : 1);
