#!/usr/bin/env node
/**
 * Embedded PostgreSQL manager.
 *
 * Runs a REAL PostgreSQL cluster from the binaries shipped by the
 * `@embedded-postgres/*` npm packages, so the project needs no system-wide
 * PostgreSQL install and no administrator rights.
 *
 * Notes learned the hard way:
 *  - The Windows package ships ONLY initdb / pg_ctl / postgres. There is no
 *    psql.exe, so all SQL goes through the `pg` driver.
 *  - The cluster is started via `pg_ctl`, which detaches the postmaster, so
 *    PostgreSQL outlives this script.
 *
 * Usage:
 *   node scripts/db.mjs start | stop | status | reset | sql "<query>" | ping
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

// ------------------------------------------------------------------ config

const HOST = process.env.PG_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PG_PORT ?? 55432);
const USER = process.env.PG_USER ?? "postgres";
const PASSWORD = process.env.PG_PASSWORD ?? "postgres";
const DATABASE = process.env.PG_DATABASE ?? "travel_agent";
/** Must match `dev` in package.json; `doctor` checks it. */
const WEB_PORT = Number(process.env.WEB_PORT ?? 3001);

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, "data", "pgdata");
const logFile = path.join(root, "data", "postgres.log");
const pwFile = path.join(root, "data", ".pgpass.tmp");

export const DATABASE_URL = `postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}?schema=public`;

/**
 * Server tuning.
 * `shared_buffers` / `max_connections` are deliberately small: a large shared
 * memory segment can fail to reserve on Windows ("could not reserve shared
 * memory region ... error code 487"), which kills every new backend. A modest
 * segment is more than enough for local development.
 */
const SERVER_OPTIONS = [
  `-p ${PORT}`,
  `-c listen_addresses=${HOST}`,
  "-c shared_buffers=32MB",
  "-c max_connections=30",
  "-c dynamic_shared_memory_type=windows",
].join(" ");

/** No pg_ctl invocation may block forever. */
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;
/** How long `pg_ctl -w start` may wait for the server to accept connections. */
const PG_CTL_START_TIMEOUT_MS = 75_000;
/** How long we then wait for *our own* real connection to succeed. */
const READY_TIMEOUT_MS = 30_000;

// ------------------------------------------------------------------ helpers

const log = (msg) => console.log(`[db] ${msg}`);
const fail = (msg) => {
  console.error(`[db] ERROR: ${msg}`);
  process.exit(1);
};

/** Locate the native postgres binaries inside node_modules. */
function resolveBinDir() {
  const osName = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform];
  if (!osName) fail(`unsupported platform: ${process.platform}`);

  const scopeDir = path.join(root, "node_modules", "@embedded-postgres");
  if (!existsSync(scopeDir)) fail("`@embedded-postgres/*` not found. Run: npm install");

  const pkgDirs = readdirSync(scopeDir).filter((d) => d.startsWith(osName));
  if (pkgDirs.length === 0) fail(`no embedded-postgres binaries for ${process.platform}-${process.arch}`);

  // Prefer an exact arch match, otherwise take the first available.
  const preferred = pkgDirs.find((d) => d.endsWith(`-${process.arch}`)) ?? pkgDirs[0];
  const binDir = path.join(scopeDir, preferred, "native", "bin");
  if (!existsSync(binDir)) fail(`binary directory missing: ${binDir}`);
  return binDir;
}

function exe(name) {
  const binDir = resolveBinDir();
  const file = process.platform === "win32" ? `${name}.exe` : name;
  const full = path.join(binDir, file);
  if (!existsSync(full)) fail(`binary not found: ${full}`);
  return full;
}

/**
 * Spawn a postgres tool. stdio is piped so callers can read the result.
 *
 * Always given a timeout: an unbounded spawnSync here is what made
 * `start.cmd` hang forever on a wedged cluster, leaving the user staring at
 * "starting PostgreSQL ..." with a browser that says ERR_CONNECTION_REFUSED and
 * no clue why.
 */
function run(bin, args, timeoutMs = DEFAULT_TOOL_TIMEOUT_MS) {
  const result = spawnSync(exe(bin), args, {
    encoding: "utf8",
    timeout: timeoutMs,
    // The postmaster needs its own bin directory on PATH to find its DLLs.
    env: { ...process.env, PATH: `${path.dirname(exe(bin))};${process.env.PATH ?? ""}` },
  });
  // spawnSync reports a timeout by killing the child and setting error.code.
  const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
  return { ...result, timedOut };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isInitialised = () => existsSync(path.join(dataDir, "PG_VERSION"));

/** `pg_ctl status` is a *hint*, not the truth — see isReachable(). */
function pgCtlSaysRunning() {
  const r = run("pg_ctl", ["-D", dataDir, "status"], 20_000);
  return !r.timedOut && r.status === 0;
}

/**
 * The truth: can we actually open a connection and run a query?
 *
 * `pg_ctl status` only checks that the PID in postmaster.pid is alive, so it
 * happily reports "server is running" for a postmaster that can no longer fork
 * backends (the Windows job-object failure, logged as 0xC0000142). Every
 * decision below is therefore based on a real round-trip, never on pg_ctl.
 */
async function probe(database = "postgres", connectionTimeoutMillis = 5_000) {
  const client = new pg.Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database,
    connectionTimeoutMillis,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return { ok: true, client };
  } catch (error) {
    try {
      await client.end();
    } catch {
      // already dead
    }
    return { ok: false, error };
  }
}

/** Poll until a real connection succeeds, or give up after `totalMs`. */
async function waitUntilReachable(totalMs) {
  const deadline = Date.now() + totalMs;
  let lastError = "no attempt made";

  for (;;) {
    const attempt = await probe("postgres", 4_000);
    if (attempt.ok) {
      await attempt.client.end();
      return { ok: true };
    }
    lastError = attempt.error instanceof Error ? attempt.error.message : String(attempt.error);
    if (Date.now() >= deadline) return { ok: false, error: lastError };
    await sleep(600);
  }
}

/** Open a pg client. `database` defaults to `postgres` (always exists). */
async function connect(database = "postgres") {
  const client = new pg.Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  return client;
}

/** Read a file, tolerating races (the pid file can vanish mid-read). */
function readFileSyncSafe(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** Signal 0 performs the permission/existence check without actually signalling. */
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else.
    return error?.code === "EPERM";
  }
}

/** Is something serving HTTP there? Used by `doctor` for the web server. */
async function probeHttp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ------------------------------------------------------------------ commands

function init() {
  if (isInitialised()) {
    log(`cluster already initialised at ${dataDir}`);
    return;
  }
  mkdirSync(path.dirname(dataDir), { recursive: true });
  writeFileSync(pwFile, PASSWORD, "utf8");

  log("running initdb (creating a fresh PostgreSQL cluster)...");
  // Generous bound: initdb writes a whole cluster and can be slow on a cold
  // disk, so a 60s default would risk a false failure on first run.
  const r = run(
    "initdb",
    [
      "-D", dataDir,
      "-U", USER,
      "--pwfile", pwFile,
      "--auth-host=scram-sha-256",
      "--auth-local=trust",
      "-E", "UTF8",
      "--locale=C",
    ],
    180_000,
  );
  rmSync(pwFile, { force: true });

  if (r.timedOut) fail("initdb timed out after 180s");

  if (r.status !== 0) {
    if (r.stdout) console.error(r.stdout);
    if (r.stderr) console.error(r.stderr);
    fail("initdb failed");
  }
  log("cluster initialised");
}

async function start() {
  if (!isInitialised()) init();

  // Already serving? pg_ctl's opinion alone is not enough — confirm with a real
  // connection before claiming success.
  if (pgCtlSaysRunning()) {
    const ready = await waitUntilReachable(8_000);
    if (ready.ok) {
      log(`already running on port ${PORT}`);
      await ensureDatabase();
      log(`DATABASE_URL=${DATABASE_URL}`);
      return;
    }
    fail(
      `PostgreSQL is listening on ${HOST}:${PORT}, but it refuses connections.\n` +
        `      Last error: ${ready.error}\n` +
        `      This is the Windows "postmaster alive but cannot fork backends" state\n` +
        `      (logged as 0xC0000142 / STATUS_DLL_INIT_FAILED). The cluster must be\n` +
        `      restarted from a long-lived parent:\n` +
        `        npm run db:stop\n` +
        `        npm run db:serve      (foreground supervisor; leave it running)`,
    );
  }

  mkdirSync(path.dirname(logFile), { recursive: true });

  log(`starting PostgreSQL on ${HOST}:${PORT} ...`);
  const r = run(
    "pg_ctl",
    ["-D", dataDir, "-l", logFile, "-o", SERVER_OPTIONS, "-w", "-t", "60", "start"],
    PG_CTL_START_TIMEOUT_MS,
  );

  if (r.timedOut) {
    fail(
      `pg_ctl start did not finish within ${PG_CTL_START_TIMEOUT_MS / 1000}s — it was killed.\n` +
        `      Inspect ${logFile}\n` +
        `      A stale cluster is the usual cause: npm run db:stop, then npm run db:serve`,
    );
  }

  if (r.status !== 0) {
    if (r.stdout) console.error(r.stdout);
    if (r.stderr) console.error(r.stderr);
    fail(`pg_ctl start failed — inspect ${logFile}`);
  }

  // pg_ctl -w already waited, but verify with a real query so we never report
  // success for a cluster our own client cannot use.
  const ready = await waitUntilReachable(READY_TIMEOUT_MS);
  if (!ready.ok) {
    fail(`PostgreSQL started but is not accepting connections: ${ready.error}`);
  }

  log("PostgreSQL is up");
  await ensureDatabase();
  log(`DATABASE_URL=${DATABASE_URL}`);
}

async function ensureDatabase() {
  const client = await connect("postgres");
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DATABASE]);
    if (rowCount === 0) {
      log(`creating database "${DATABASE}" ...`);
      // Identifiers cannot be parameterised; DATABASE is local config only.
      await client.query(`CREATE DATABASE "${DATABASE}"`);
    }
  } finally {
    await client.end();
  }
}

function stop() {
  if (!isInitialised()) return log("no cluster to stop");
  if (!pgCtlSaysRunning()) return log("already stopped");
  log("stopping PostgreSQL ...");
  const r = run("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"], 60_000);
  if (r.timedOut) fail("pg_ctl stop timed out — kill the postgres processes manually");
  if (r.status !== 0) fail("pg_ctl stop failed");
  log("stopped");
}

async function status() {
  if (!isInitialised()) {
    log("not initialised (run: npm run db:start)");
    process.exit(1);
  }
  const reachable = await waitUntilReachable(5_000);
  if (!reachable.ok) {
    log(`NOT accepting connections on ${HOST}:${PORT} (${reachable.error})`);
    process.exit(1);
  }
  const client = await connect();
  try {
    const { rows } = await client.query("select version() as v, current_database() as db");
    log(`running on ${HOST}:${PORT}`);
    log(`server : ${rows[0].v.split(" on ")[0]}`);
    log(`db     : ${rows[0].db}`);
    log(`url    : ${DATABASE_URL}`);
  } finally {
    await client.end();
  }
}

/**
 * One-shot diagnosis, so "it does not work" can be answered with facts instead
 * of guesses. Every check is read-only.
 */
async function doctor() {
  const ok = (label, detail = "") => log(`OK    ${label}${detail ? ` — ${detail}` : ""}`);
  const bad = (label, detail = "") => log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  let problems = 0;
  const problem = (label, detail) => {
    problems++;
    bad(label, detail);
  };

  console.log("");
  log(`node        ${process.version} on ${process.platform}-${process.arch}`);
  log(`project     ${root}`);

  // 1. binaries
  try {
    ok("embedded postgres binaries", resolveBinDir());
  } catch (error) {
    problem("embedded postgres binaries", error instanceof Error ? error.message : String(error));
  }

  // 2. cluster directory
  if (isInitialised()) ok("cluster initialised", dataDir);
  else problem("cluster initialised", "run: npm run db:start");

  // 3. postmaster.pid sanity
  const pidFile = path.join(dataDir, "postmaster.pid");
  if (existsSync(pidFile)) {
    const pid = readFileSyncSafe(pidFile).split("\n")[0]?.trim();
    const alive = pid && isProcessAlive(Number(pid));
    if (alive) ok("postmaster.pid", `PID ${pid} is alive`);
    else problem("postmaster.pid", `stale — PID ${pid} is not running (npm run db:stop clears it)`);
  } else if (isInitialised()) {
    ok("postmaster.pid", "absent (cluster stopped)");
  }

  // 4. pg_ctl's opinion, for contrast with the truth
  log(`note  pg_ctl status says: ${pgCtlSaysRunning() ? "running" : "not running"}`);

  // 5. the only check that matters
  const reachable = await waitUntilReachable(6_000);
  if (reachable.ok) ok("database accepts connections", `${HOST}:${PORT}`);
  else problem("database accepts connections", `${reachable.error}
        If the port is listening but this fails, the postmaster can no longer
        fork backends (Windows 0xC0000142). Fix: npm run db:stop && npm run db:serve`);

  // 6. can we reach the app database itself?
  if (reachable.ok) {
    const attempt = await probe(DATABASE, 5_000);
    if (attempt.ok) {
      const { rows } = await attempt.client.query(
        "select (select count(*) from \"Listing\")::int as listings, (select count(*) from \"User\")::int as users",
      );
      await attempt.client.end();
      ok(`database "${DATABASE}" has tables`, `${rows[0].listings} listings / ${rows[0].users} users`);
      if (rows[0].listings === 0) problem("seeded data", "no listings — run: npm run db:seed");
    } else {
      problem(
        `database "${DATABASE}"`,
        `${attempt.error instanceof Error ? attempt.error.message : attempt.error} — run: npx prisma migrate dev && npm run db:seed`,
      );
    }
  }

  // 7. web server
  const web = await probeHttp(`http://127.0.0.1:${WEB_PORT}/api/meta`);
  if (web.ok) ok("web server", `HTTP ${web.status} on port ${WEB_PORT}`);
  else problem("web server", `nothing answering on port ${WEB_PORT} (run: npm run dev)`);

  console.log("");
  if (problems === 0) log("no problems found — http://localhost:3001 should work");
  else log(`${problems} problem(s) found (see FAIL lines above)`);

  process.exit(problems === 0 ? 0 : 1);
}

async function ping() {
  const client = await connect(DATABASE);
  try {
    const { rows } = await client.query("select 1 as ok");
    log(`connection to "${DATABASE}" OK (ok=${rows[0].ok})`);
  } finally {
    await client.end();
  }
}

async function sql() {
  const query = process.argv[3];
  if (!query) fail('usage: node scripts/db.mjs sql "<query>"');
  const client = await connect(DATABASE);
  try {
    const result = await client.query(query);
    console.table(result.rows);
  } finally {
    await client.end();
  }
}

function reset() {
  log("this deletes ALL local data (cluster + data directory)");
  stop();
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
    log("data directory removed");
  }
}

/**
 * Start the cluster and STAY in the foreground.
 *
 * On Windows the postmaster can only keep spawning backends while the job
 * object of the process that launched it is still alive. Once `db:start`
 * returns, that job is torn down and every new client connection dies with
 * `0xC0000142 (STATUS_DLL_INIT_FAILED)` — the postmaster looks healthy
 * (`pg_ctl status` says running, the port is listening) but no backend can
 * start. Keeping a long-lived parent alive avoids that.
 */
async function serve() {
  await start();
  log("PostgreSQL is serving. Press Ctrl+C to stop this supervisor.");
  // Never resolves: this supervisor must outlive the cluster's usefulness.
  await new Promise(() => {});
}

// ------------------------------------------------------------------ main

const command = process.argv[2] ?? "start";
const commands = { init, start, stop, status, reset, serve, sql, ping, doctor };

if (!commands[command]) {
  fail(`unknown command "${command}". Use: ${Object.keys(commands).join(" | ")}`);
}

try {
  await commands[command]();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
