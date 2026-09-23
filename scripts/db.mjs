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
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

// ------------------------------------------------------------------ config

const HOST = process.env.PG_HOST ?? "127.0.0.1";
const PORT = Number(process.env.PG_PORT ?? 55432);
const USER = process.env.PG_USER ?? "postgres";
const PASSWORD = process.env.PG_PASSWORD ?? "postgres";
const DATABASE = process.env.PG_DATABASE ?? "travel_agent";

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

/** Spawn a postgres tool. stdio is piped so callers can read the result. */
function run(bin, args) {
  return spawnSync(exe(bin), args, {
    encoding: "utf8",
    // The postmaster needs its own bin directory on PATH to find its DLLs.
    env: { ...process.env, PATH: `${path.dirname(exe(bin))};${process.env.PATH ?? ""}` },
  });
}

const isInitialised = () => existsSync(path.join(dataDir, "PG_VERSION"));
const isRunning = () => run("pg_ctl", ["-D", dataDir, "status"]).status === 0;

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

// ------------------------------------------------------------------ commands

function init() {
  if (isInitialised()) {
    log(`cluster already initialised at ${dataDir}`);
    return;
  }
  mkdirSync(path.dirname(dataDir), { recursive: true });
  writeFileSync(pwFile, PASSWORD, "utf8");

  log("running initdb (creating a fresh PostgreSQL cluster)...");
  const r = run("initdb", [
    "-D", dataDir,
    "-U", USER,
    "--pwfile", pwFile,
    "--auth-host=scram-sha-256",
    "--auth-local=trust",
    "-E", "UTF8",
    "--locale=C",
  ]);
  rmSync(pwFile, { force: true });

  if (r.status !== 0) {
    if (r.stdout) console.error(r.stdout);
    if (r.stderr) console.error(r.stderr);
    fail("initdb failed");
  }
  log("cluster initialised");
}

async function start() {
  if (!isInitialised()) init();
  if (isRunning()) {
    log(`already running on port ${PORT}`);
    await ensureDatabase();
    return;
  }
  mkdirSync(path.dirname(logFile), { recursive: true });

  log(`starting PostgreSQL on ${HOST}:${PORT} ...`);
  const r = run("pg_ctl", ["-D", dataDir, "-l", logFile, "-o", SERVER_OPTIONS, "-w", "-t", "60", "start"]);
  if (r.status !== 0) {
    if (r.stdout) console.error(r.stdout);
    if (r.stderr) console.error(r.stderr);
    fail(`pg_ctl start failed — inspect ${logFile}`);
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
  if (!isRunning()) return log("already stopped");
  log("stopping PostgreSQL ...");
  const r = run("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]);
  if (r.status !== 0) fail("pg_ctl stop failed");
  log("stopped");
}

async function status() {
  if (!isInitialised()) {
    log("not initialised (run: npm run db:start)");
    process.exit(1);
  }
  if (!isRunning()) {
    log("stopped");
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

// ------------------------------------------------------------------ main

const command = process.argv[2] ?? "start";
const commands = { init, start, stop, status, reset, sql, ping };

if (!commands[command]) {
  fail(`unknown command "${command}". Use: ${Object.keys(commands).join(" | ")}`);
}

try {
  await commands[command]();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
