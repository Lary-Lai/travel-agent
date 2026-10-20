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

/**
 * `runner` is either node or tsx; the suites are a mix.
 *
 * `tsx` is invoked as `node node_modules/tsx/dist/cli.mjs …` rather than as the
 * `npx tsx` shim. Going through `npx` needs `shell: true` on Windows (it is a
 * `.cmd`), and Node then warns on every run: passing an args array with a shell
 * concatenates them instead of escaping them (DEP0190). Calling the entry point
 * directly avoids the shell, the warning, and a process layer.
 */
const TSX = ["node", "node_modules/tsx/dist/cli.mjs"];

const SUITES = [
  { name: "check-encoding", cmd: ["node", "scripts/check-encoding.mjs"], kind: "exit" },
  { name: "verify-db", cmd: [...TSX, "scripts/verify-db.ts"], kind: "db" },
  { name: "smoke-api", cmd: ["node", "scripts/smoke-api.mjs", BASE] },
  { name: "verify-tools", cmd: [...TSX, "scripts/verify-tools.ts"] },
  { name: "verify-ai", cmd: ["node", "scripts/verify-ai.mjs"], kind: "report" },
  { name: "test-vision", cmd: ["node", "scripts/test-vision.mjs"], kind: "report" },
  { name: "smoke-agent", cmd: ["node", "scripts/smoke-agent.mjs", BASE] },
  { name: "smoke-weather-profile", cmd: ["node", "scripts/smoke-weather-profile.mjs"] },
  { name: "smoke-profile-fields", cmd: ["node", "scripts/smoke-profile-fields.mjs"] },
  { name: "smoke-email-change", cmd: ["node", "scripts/smoke-email-change.mjs"] },
  { name: "smoke-new-features", cmd: ["node", "scripts/smoke-new-features.mjs"] },
  { name: "smoke-archive-booking", cmd: ["node", "scripts/smoke-archive-booking.mjs"] },
  { name: "smoke-payment-deadline", cmd: ["node", "scripts/smoke-payment-deadline.mjs"] },
  { name: "smoke-uploads", cmd: ["node", "scripts/smoke-uploads.mjs"] },
  { name: "smoke-social", cmd: ["node", "scripts/smoke-social.mjs"] },
  { name: "smoke-notifications", cmd: ["node", "scripts/smoke-notifications.mjs"] },
  { name: "smoke-plan", cmd: ["node", "scripts/smoke-plan.mjs"] },
  { name: "smoke-forum", cmd: ["node", "scripts/smoke-forum.mjs"] },
  { name: "verify-guests", cmd: [...TSX, "scripts/verify-guests.ts"] },
  { name: "verify-tiles", cmd: [...TSX, "scripts/verify-tiles.ts"] },
  { name: "verify-dates", cmd: [...TSX, "scripts/verify-dates.ts"] },
  { name: "verify-markdown", cmd: [...TSX, "scripts/verify-markdown.ts"] },
  { name: "verify-i18n", cmd: [...TSX, "scripts/verify-i18n.ts"] },
  { name: "verify-listing-i18n", cmd: [...TSX, "scripts/verify-listing-i18n.ts"] },
  { name: "check-pages", cmd: ["node", "scripts/check-pages.mjs"] },
  { name: "check-home-design", cmd: ["node", "scripts/check-home-design.mjs"] },
  { name: "check-search-animation", cmd: ["node", "scripts/check-search-animation.mjs"] },
  { name: "check-icons", cmd: ["node", "scripts/check-icons.mjs"] },
];

const results = [];

for (const suite of SUITES) {
  process.stdout.write(`  running ${suite.name} …\r`);
  const [command, ...args] = suite.cmd;
  const run = spawnSync(command, args, {
    encoding: "utf8",
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
  /**
   * How a suite is judged.
   *
   * The important case is the last one. A suite that never prints its summary has
   * **not passed** — it crashed, was killed, ran out of output buffer, or lost the
   * database. Treating "no summary" as informational (which this runner used to do)
   * means a suite can vanish from the report and the total still says 0 failed:
   * measured, `check-pages` disappeared from a run and the batch reported a clean
   * 1025 because 113 assertions had simply not run. Only the suites explicitly marked
   * `kind: "report"` are informational.
   *
   * `verify-db` prints its own verdict, and `check-encoding` signals through its exit
   * code, so those two keep their own branches.
   */
  let verdict;
  if (suite.kind === "report") {
    verdict = "informational";
  } else if (suite.kind === "db") {
    verdict = /ALL CHECKS PASSED/.test(output) ? "db-ok" : "db-failed";
  } else if (suite.kind === "exit") {
    verdict = run.status === 0 ? "exit-ok" : "exit-failed";
  } else if (summary) {
    verdict = "counted";
  } else {
    verdict = "crashed";
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
    /**
     * Why it produced no verdict, in the terms a person needs: a spawn failure, a
     * signal, or the exit code.
     */
    crashReason: summary
      ? null
      : (run.error?.message ??
        (run.signal ? `killed by ${run.signal}` : `exit code ${run.status}`)),
    crashed: verdict === "crashed" || verdict === "db-failed",
    tail: output.trim().split(/\r?\n/).slice(-6).join("\n"),
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
  } else if (result.verdict === "exit-ok") {
    console.log(`${result.name.padEnd(26)} ${result.reportLine}  ok`);
  } else if (result.verdict === "exit-failed") {
    totalFailed += 1;
    console.log(`${result.name.padEnd(26)} ${result.reportLine}  FAILED`);
  } else if (result.verdict === "crashed") {
    // Counted as a failure, and the reason is printed: a suite that produced no
    // summary is the one case where "what happened?" is otherwise unanswerable.
    totalFailed += 1;
    console.log(`${result.name.padEnd(26)} NO SUMMARY — ${result.crashReason ?? "unknown"}  FAILED`);
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

/*
 * Report — but do not delete — throwaway accounts left behind.
 *
 * Several suites register `@example.com` accounts and never remove them
 * (attributed by running a group-by on the email prefix: forum-smoke, archive,
 * history, reviewer). Cleaning up inside the runner would be a surprising side
 * effect for something whose job is to *measure*, so this only says what is
 * there and what to run. Silent accumulation is how it got to 56 accounts once.
 */
try {
  const { default: pg } = await import("pg");
  const db = new pg.Client({
    host: "127.0.0.1",
    port: 55432,
    user: "postgres",
    password: "postgres",
    database: "travel_agent",
  });
  await db.connect();
  const { rows } = await db.query(
    `select count(*)::int as n from "User" where email like '%@example.com'`,
  );
  await db.end();
  if (rows[0].n > 0) {
    console.log(
      `note: ${rows[0].n} throwaway account(s) left behind by the suites — ` +
        `run \`node scripts/clean-test-data.mjs --apply\` to remove them`,
    );
  }
} catch {
  // The database may be down; that is not this runner's problem to report.
}

console.log("=".repeat(66));

process.exit(totalFailed === 0 ? 0 : 1);
