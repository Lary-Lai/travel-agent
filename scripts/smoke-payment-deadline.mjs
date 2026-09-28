/**
 * The 30-minute payment deadline.
 *
 *     node scripts/smoke-payment-deadline.mjs [baseUrl]
 *
 * The interesting part is not that a countdown ticks, but that the deadline is
 * *authoritative*: the server refuses a late payment, the dates are actually
 * released, and a live hold still blocks them. Those three are what turn a
 * cosmetic timer into a real rule.
 */
const BASE = process.argv[2] ?? "http://localhost:3001";

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: response.status, cookie };
};

const api = (path, { cookie, method = "GET", body } = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const day = (offset) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return new Date(date.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
};

const { default: pg } = await import("pg");
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});
await db.connect();

/**
 * Push a hold's deadline into the past, since waiting 30 minutes is not a test.
 *
 * Subtracts from the stored value rather than assigning `now()`: that is
 * timezone-agnostic and means exactly "this booking's window has elapsed". An
 * absolute `now()` assignment would depend on how the naive/timestamptz column
 * interprets the session's offset, which is precisely the trap this column was
 * changed to `timestamptz` to avoid.
 */
const ageHold = (bookingId) =>
  db.query(
    `update "Booking" set "paymentDueAt" = "paymentDueAt" - interval '31 minutes' where id = $1`,
    [bookingId],
  );

async function main() {
  const { cookie } = await login("demo@travel-agent.dev", "Demo1234");
  check("demo account can log in", Boolean(cookie));

  const listingId = await fetch(`${BASE}/api/listings?pageSize=1`)
    .then((r) => r.json())
    .then((j) => j.data?.items?.[0]?.id);

  // A per-run date band, so a run that fails leaves nothing that blocks the next
  // one. (A fixed offset did exactly that: the leftover CONFIRMED booking from a
  // failed run made every later run fail with 409.)
  const base = 400 + (Date.now() % 400);
  const checkIn = day(base);
  const checkOut = day(base + 2);
  console.log(`\n  using dates ${checkIn} → ${checkOut}`);

  console.log("\n— a new hold gets a deadline");

  const created = await api("/api/bookings", {
    cookie,
    method: "POST",
    body: { listingId, checkIn, checkOut, guests: 2 },
  });
  check("booking created -> 201", created.status === 201, `got ${created.status}`);

  const booking = created.body?.data?.booking;
  check("the booking exposes paymentDueAt", typeof booking?.paymentDueAt === "string", String(booking?.paymentDueAt));
  check("it does not start out expired", booking?.paymentExpired === false, String(booking?.paymentExpired));
  check("and has not timed out", booking?.paymentTimedOut === false, String(booking?.paymentTimedOut));

  const windowMinutes = booking?.paymentDueAt && booking?.createdAt
    ? Math.round((new Date(booking.paymentDueAt) - new Date(booking.createdAt)) / 60_000)
    : null;
  check("the window is 30 minutes", windowMinutes === 30, `got ${windowMinutes}`);

  console.log("\n— a live hold still blocks its dates");
  const clash = await api("/api/bookings", {
    cookie,
    method: "POST",
    body: { listingId, checkIn, checkOut, guests: 2 },
  });
  check(
    "booking the same dates while the hold is live -> 409",
    clash.status === 409,
    `got ${clash.status}`,
  );

  console.log("\n— expiry releases the dates");
  await ageHold(booking.id);

  const afterExpiry = await api("/api/bookings", { cookie });
  const listed = (afterExpiry.body?.data?.bookings ?? []).find((b) => b.id === booking.id);
  check(
    "the expired hold is auto-cancelled on read",
    listed?.status === "CANCELLED",
    String(listed?.status),
  );
  // The two flags answer different questions: `paymentExpired` describes a hold
  // that can no longer be paid, `paymentTimedOut` is the lasting explanation of
  // why a cancelled order was cancelled. "My trips" labels orders with the
  // second one, so it must survive the sweep that clears the first.
  check(
    "the cancelled record still explains itself as timed out",
    listed?.paymentTimedOut === true,
    String(listed?.paymentTimedOut),
  );
  check(
    "while paymentExpired (a payable-hold question) is now false",
    listed?.paymentExpired === false,
    String(listed?.paymentExpired),
  );

  const rebooked = await api("/api/bookings", {
    cookie,
    method: "POST",
    body: { listingId, checkIn, checkOut, guests: 2 },
  });
  check(
    "the released dates can be booked again -> 201",
    rebooked.status === 201,
    `got ${rebooked.status}`,
  );

  console.log("\n— a late payment is refused");
  const late = await api(`/api/bookings/${booking.id}/pay`, {
    cookie,
    method: "POST",
    body: { method: "WECHAT" },
  });
  check("paying an expired hold -> 409", late.status === 409, `got ${late.status}`);
  check(
    "the message says the order was auto-cancelled",
    /自动取消|时限/.test(String(late.body?.error?.message)),
    String(late.body?.error?.message),
  );

  const stillCancelled = await api(`/api/bookings/${booking.id}`, { cookie });
  check(
    "and it did not become CONFIRMED",
    stillCancelled.body?.data?.booking?.status === "CANCELLED",
    String(stillCancelled.body?.data?.booking?.status),
  );

  console.log("\n— a live hold can still be paid");
  const live = rebooked.body?.data?.booking;
  if (live) {
    const paid = await api(`/api/bookings/${live.id}/pay`, {
      cookie,
      method: "POST",
      body: { method: "WECHAT" },
    });
    check("paying within the window -> 200", paid.status === 200, `got ${paid.status}`);
    check("it becomes CONFIRMED", paid.body?.data?.booking?.status === "CONFIRMED");
    check(
      "a confirmed booking never reports as expired",
      paid.body?.data?.booking?.paymentExpired === false,
    );

    // A confirmed booking must not be swept by the deadline logic.
    await db.query(`update "Booking" set "paymentDueAt" = now() - interval '1 minute' where id = $1`, [
      live.id,
    ]);
    const afterPaid = await api(`/api/bookings/${live.id}`, { cookie });
    check(
      "an aged but PAID booking is not cancelled",
      afterPaid.body?.data?.booking?.status === "CONFIRMED",
      String(afterPaid.body?.data?.booking?.status),
    );
    check(
      "and is not labelled as having timed out",
      afterPaid.body?.data?.booking?.paymentTimedOut === false,
      String(afterPaid.body?.data?.booking?.paymentTimedOut),
    );

    await api(`/api/bookings/${live.id}`, { cookie, method: "DELETE" });
  }

  console.log(`\n${"=".repeat(58)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log("=".repeat(58));
  await db.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await db.end();
  process.exit(1);
});
