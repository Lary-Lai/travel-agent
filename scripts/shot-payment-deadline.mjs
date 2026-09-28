/**
 * Screenshot the two checkout states, in a real browser.
 *
 *     node scripts/shot-payment-deadline.mjs [baseUrl]
 *
 * The expiry behaviour is the kind of thing that passes every API assertion and
 * is still wrong on screen — a disabled button, a stale timer, a "refresh" that
 * does nothing. So this drives headless Chrome over the DevTools protocol and
 * writes PNGs to `data/shots/` for the vision check, instead of asserting on
 * HTML the way an earlier version of this suite did (the dictionary is
 * serialised into the page, so substring probes prove nothing).
 *
 * Dependency-free on purpose: Node 24 ships a global WebSocket, and Chrome is
 * already installed, so no browser-automation package is needed.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3001";
const PORT = 9333;
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
/**
 * Throwaway browser state belongs in the system temp dir, not in `data/`.
 * Chrome unpacks its extensions there, and a profile inside the repo makes
 * `eslint .` lint megabytes of third-party bundle JS — 914 problems, none of
 * them ours.
 */
const USER_DATA = path.join(tmpdir(), "ta-chrome-profile");
const SHOTS = path.join(process.cwd(), "data", "shots");

const { default: pg } = await import("pg");
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const day = (offset) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return new Date(date.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
};

// ------------------------------------------------------------------- CDP glue

let socket;
let nextId = 1;
const pending = new Map();

/** Uncaught exceptions / console errors for the page currently being visited. */
const pageErrors = [];
/** Pages that rendered with a runtime error, reported at the end. */
const failures = [];
/** How many pages this run actually visited. */
let shotCount = 0;

function send(method, params = {}, sessionId) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function connect() {
  // Chrome needs a moment before the debugging endpoint answers.
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
      return version.webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome did not open its debugging port");
}

async function openTab() {
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
    method: "PUT",
  }).then((r) => r.json());
  return { id: target.id, wsUrl: target.webSocketDebuggerUrl };
}

/**
 * Navigate, wait for the load event plus a settle beat, then capture a PNG.
 *
 * Also collects uncaught exceptions and console errors for the page. A React
 * component that throws on render still returns HTTP 200 with server-rendered
 * HTML, so a screenshot alone can quietly capture a broken page — the error
 * list is what makes "it rendered" a claim rather than a hope.
 */
async function shoot(url, file, cookies) {
  const tab = await openTab();
  const tabSocket = new WebSocket(tab.wsUrl);
  socket = tabSocket;
  nextId = 1;
  pending.clear();
  pageErrors.length = 0;

  await new Promise((resolve, reject) => {
    tabSocket.addEventListener("open", resolve, { once: true });
    tabSocket.addEventListener("error", reject, { once: true });
  });

  const loaded = new Promise((resolve) => {
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Page.loadEventFired") {
        tabSocket.removeEventListener("message", listener);
        resolve();
      }
    };
    tabSocket.addEventListener("message", listener);
  });

  tabSocket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      pageErrors.push(details?.exception?.description ?? details?.text ?? "unknown exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      pageErrors.push(
        (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" "),
      );
    }
  });

  tabSocket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const pair of cookies.split("; ")) {
    const [name, ...rest] = pair.split("=");
    await send("Network.setCookie", {
      name,
      value: rest.join("="),
      domain: "localhost",
      path: "/",
    });
  }

  await send("Page.navigate", { url });
  await loaded;
  await sleep(2500); // fonts, images, and the first countdown tick

  const { data } = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(file, Buffer.from(data, "base64"));

  const errors = [...pageErrors];
  shotCount++;
  console.log(
    `  saved  ${path.relative(process.cwd(), file)}${errors.length > 0 ? `   ⚠ ${errors.length} page error(s)` : ""}`,
  );
  for (const error of errors) console.log(`         ${error.split("\n")[0].slice(0, 160)}`);
  if (errors.length > 0) failures.push({ url, errors });

  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
  tabSocket.close();
  return file;
}

// ------------------------------------------------------------------- fixtures

const api = (path_, { cookie, method = "GET", body } = {}) =>
  fetch(`${BASE}${path_}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => null),
  }));

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await db.connect();

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "demo@travel-agent.dev", password: "Demo1234" }),
  });
  const session = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const listingId = await fetch(`${BASE}/api/listings?pageSize=1`)
    .then((r) => r.json())
    .then((j) => j.data?.items?.[0]?.id);

  const createHold = (cookie, checkInOffset, span = 2, listing = listingId) =>
    api("/api/bookings", {
      cookie,
      method: "POST",
      body: {
        listingId: listing,
        checkIn: day(checkInOffset),
        checkOut: day(checkInOffset + span),
        guests: 2,
      },
    });

  /** First offset that is actually free, so a leftover hold cannot 409 the run. */
  async function holdAt(cookie, offsets, listing = listingId) {
    for (const offset of offsets) {
      const response = await createHold(cookie, offset, 2, listing);
      if (response.status === 201) return { booking: response.body.data.booking, offset };
    }
    throw new Error(`no free dates among ${offsets.join(", ")}`);
  }

  // "My trips" is ordered by earliest check-in, so the expired hold has to sit on
  // the *nearest* free dates for the badge to be visible where a guest would look
  // for it. The live hold's position does not matter for the checkout screenshot.
  const near = await holdAt(session, [3, 4, 5, 6, 7, 8, 9]);
  const far = await holdAt(session, [900 + (Date.now() % 90)]);

  const deadId = near.booking.id;
  const liveId = far.booking.id;
  console.log(`  live hold ${liveId} (day +${far.offset})`);
  console.log(`  expired hold ${deadId} (day +${near.offset})\n`);

  await db.query(
    `update "Booking" set "paymentDueAt" = "paymentDueAt" - interval '31 minutes' where id = $1`,
    [deadId],
  );

  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA}`,
      "--window-size=1280,1100",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore", detached: false },
  );

  try {
    socket = new WebSocket(await connect());
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    const zh = `${session}; ta_locale=zh-CN`;
    const en = `${session}; ta_locale=en`;

    await shoot(`${BASE}/payment/${liveId}`, path.join(SHOTS, "deadline-live-zh.png"), zh);
    await shoot(`${BASE}/payment/${deadId}`, path.join(SHOTS, "deadline-expired-zh.png"), zh);
    await shoot(`${BASE}/payment/${deadId}`, path.join(SHOTS, "deadline-expired-en.png"), en);
    await shoot(`${BASE}/trips`, path.join(SHOTS, "deadline-trips-zh.png"), zh);

    // The other screens that read a locale-formatted date. They are here because
    // the date formatting was migrated component by component, and only a real
    // render proves each one still gets the value it expects.
    const listingHref = await fetch(`${BASE}/api/listings?pageSize=1`)
      .then((r) => r.json())
      .then((j) => `/listings/${j.data.items[0].id}`);

    for (const [href, name] of [
      [listingHref, "deadline-listing-en.png"],
      ["/profile", "deadline-profile-en.png"],
      // Dates in the query so the search bar's date chips and the results header
      // render their formatted range.
      [
        `/search?location=Tokyo&checkIn=${day(30)}&checkOut=${day(34)}`,
        "deadline-search-en.png",
      ],
    ]) {      await shoot(`${BASE}${href}`, path.join(SHOTS, name), en);
    }

    console.log(`\n${"=".repeat(58)}`);
    if (failures.length === 0) {
      console.log(`All ${shotCount} pages rendered without a runtime error.`);
    } else {
      console.log(`${failures.length} page(s) raised errors:`);
      for (const failure of failures) {
        console.log(`  ${failure.url}`);
        for (const error of failure.errors) console.log(`    ${error.split("\n")[0]}`);
      }
    }
    console.log("=".repeat(58));
    process.exitCode = failures.length === 0 ? 0 : 1;
  } finally {
    chrome.kill();
    // Release both holds so a screenshot run does not quietly fill the demo
    // account's trip list with abandoned orders. The expired one is already
    // CANCELLED by the sweep; cancelling it again is harmless.
    for (const id of [liveId, deadId]) {
      if (id) await api(`/api/bookings/${id}`, { cookie: session, method: "DELETE" });
    }
    await db.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
