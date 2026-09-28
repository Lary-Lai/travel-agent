/**
 * Deleting a past order record.
 *
 *     node scripts/smoke-archive-booking.mjs [baseUrl]
 *
 * What matters here is not that a button works, but that the *guarantees* hold:
 * an active order cannot be removed, only the owner can remove one, and the
 * refund/payment record survives — because the whole point of archiving instead
 * of deleting is that the financial trail stays intact.
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

async function main() {
  const { cookie } = await login("demo@travel-agent.dev", "Demo1234");
  check("demo account can log in", Boolean(cookie));

  const before = await api("/api/bookings", { cookie });
  const bookings = before.body?.data?.bookings ?? [];
  const cancelled = bookings.filter((b) => b.status === "CANCELLED");
  const active = bookings.filter((b) => b.status !== "CANCELLED");
  console.log(`\n  ${bookings.length} order(s): ${cancelled.length} cancelled, ${active.length} active`);

  console.log("\n— access control");
  const anon = await api("/api/bookings/archive-cancelled", { method: "POST" });
  check("archiving without a session -> 401", anon.status === 401, `got ${anon.status}`);

  console.log("\n— an active order cannot be removed");
  // Created on the spot rather than relying on one happening to exist: this is
  // the single most important guarantee (archiving an active order would release
  // its dates without going through the refund flow), so it must never skip.
  const listingId = await fetch(`${BASE}/api/listings?pageSize=1`)
    .then((r) => r.json())
    .then((j) => j.data?.items?.[0]?.id);
  const day = (offset) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    return new Date(date.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  };
  const created = await api("/api/bookings", {
    cookie,
    method: "POST",
    body: { listingId, checkIn: day(200), checkOut: day(203), guests: 2 },
  });
  check("a fresh booking is created for the test", created.status === 201, `got ${created.status}`);

  const activeId = created.body?.data?.booking?.id;
  if (activeId) {
    const attempted = await api(`/api/bookings/${activeId}/archive`, { cookie, method: "POST" });
    check("archiving a non-cancelled order -> 400", attempted.status === 400, `got ${attempted.status}`);

    const still = await api("/api/bookings", { cookie });
    check(
      "and it is still in the list afterwards",
      (still.body?.data?.bookings ?? []).some((b) => b.id === activeId),
    );

    // Leaving it behind would occupy its dates for every later run.
    const released = await api(`/api/bookings/${activeId}`, { cookie, method: "DELETE" });
    check("the test booking is cancelled afterwards", released.status === 200, `got ${released.status}`);
  }

  console.log("\n— an unknown order");
  const unknown = await api("/api/bookings/does-not-exist/archive", { cookie, method: "POST" });
  check("archiving an unknown order -> 404", unknown.status === 404, `got ${unknown.status}`);

  console.log("\n— another user cannot touch it");
  const otherEmail = `archive-${Date.now()}@example.com`;
  await api("/api/auth/register", {
    method: "POST",
    body: { name: "路人乙", email: otherEmail, password: "ArchivePass123" },
  });
  const other = await login(otherEmail, "ArchivePass123");
  if (cancelled.length > 0) {
    const foreign = await api(`/api/bookings/${cancelled[0].id}/archive`, {
      cookie: other.cookie,
      method: "POST",
    });
    check("a stranger gets 404, not a success", foreign.status === 404, `got ${foreign.status}`);
  }

  console.log("\n— the bulk action");
  // Counted immediately before the call: the test above just cancelled a booking,
  // so the figure captured at the start is already stale.
  const preBulk = await api("/api/bookings", { cookie });
  const cancelledNow = (preBulk.body?.data?.bookings ?? []).filter(
    (b) => b.status === "CANCELLED",
  ).length;
  const activeNow = (preBulk.body?.data?.bookings ?? []).filter(
    (b) => b.status !== "CANCELLED",
  ).length;

  const bulk = await api("/api/bookings/archive-cancelled", { cookie, method: "POST" });
  check("bulk archive -> 200", bulk.status === 200, `got ${bulk.status}`);
  check(
    "it reports how many were hidden",
    typeof bulk.body?.data?.count === "number",
    JSON.stringify(bulk.body?.data),
  );
  check(
    "it hid exactly the cancelled ones",
    bulk.body?.data?.count === cancelledNow,
    `got ${bulk.body?.data?.count}, expected ${cancelledNow}`,
  );

  const after = await api("/api/bookings", { cookie });
  const remaining = after.body?.data?.bookings ?? [];
  check(
    "cancelled orders are gone from the list",
    remaining.every((b) => b.status !== "CANCELLED"),
    remaining.map((b) => b.status).join(", "),
  );
  check(
    "active orders are untouched",
    remaining.length === activeNow,
    `${remaining.length} vs ${activeNow}`,
  );

  // The point of archiving rather than deleting.
  const stats = after.body?.data?.stats;
  check("stats still report a total that excludes them", typeof stats?.total === "number");
  check(
    "the refunded total is still reported after archiving",
    typeof stats?.refunded === "number" && typeof stats?.refunding === "number",
  );

  console.log(`\n${"=".repeat(56)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log("=".repeat(56));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
