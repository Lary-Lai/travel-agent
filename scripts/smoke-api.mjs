#!/usr/bin/env node
/**
 * End-to-end API integration test.
 *
 * Exercises the real HTTP API against the real PostgreSQL database:
 * public search, authentication, wishlist CRUD, booking rules, and — most
 * importantly — cross-user data isolation.
 *
 * Usage: node scripts/smoke-api.mjs [baseUrl]
 * Requires the dev server to be running (`npm run dev`).
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Minimal cookie-aware fetch client (one instance == one browser session). */
function createClient() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(path, { method = "GET", body, headers = {} } = {}) {
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
      });

      const setCookie = response.headers.getSetCookie?.() ?? [];
      if (setCookie.length > 0) {
        cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
      }

      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      return { status: response.status, body: json };
    },
  };
}

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return iso(new Date(d.getTime() + days * 86_400_000));
};

async function main() {
  console.log(`\nAPI integration test against ${BASE}\n`);

  // ---------------------------------------------------------------- public
  console.log("— public endpoints");

  const anon = createClient();

  const meta = await anon.request("/api/meta");
  check("GET /api/meta returns 200", meta.status === 200);
  check("meta has 6 destinations", meta.body?.data?.cities?.length === 6, `got ${meta.body?.data?.cities?.length}`);
  check("meta has amenity groups", (meta.body?.data?.amenities?.length ?? 0) > 0);
  check(
    "meta price bounds are sane",
    meta.body?.data?.priceBounds?.min > 0 && meta.body?.data?.priceBounds?.max > meta.body.data.priceBounds.min,
  );

  const search = await anon.request("/api/listings?location=tokyo&guests=4&priceMax=1000");
  check("GET /api/listings returns 200", search.status === 200);
  const items = search.body?.data?.items ?? [];
  check("search finds >=3 Tokyo listings for 4 guests", items.length >= 3, `got ${items.length}`);
  check(
    "every result satisfies guests<=maxGuests and price<=1000",
    items.every((i) => i.maxGuests >= 4 && i.pricePerNight <= 1000),
  );
  check(
    "results expose display labels (city/property type)",
    items.every((i) => typeof i.cityLabel === "string" && typeof i.propertyTypeLabel === "string"),
  );

  const byType = await anon.request("/api/listings?location=tokyo&propertyType=APARTMENT");
  check(
    "propertyType filter is applied",
    (byType.body?.data?.items ?? []).every((i) => i.propertyType === "APARTMENT"),
  );

  const sorted = await anon.request("/api/listings?sort=price_asc&pageSize=10");
  const prices = (sorted.body?.data?.items ?? []).map((i) => i.pricePerNight);
  check(
    "price_asc returns ascending prices",
    prices.every((p, idx) => idx === 0 || prices[idx - 1] <= p),
  );

  const badRange = await anon.request("/api/listings?priceMin=900&priceMax=100");
  check("contradictory price range -> 400", badRange.status === 400, `got ${badRange.status}`);

  const badDate = await anon.request("/api/listings?checkIn=2026-10-05&checkOut=2026-10-01");
  check("checkOut before checkIn -> 400", badDate.status === 400, `got ${badDate.status}`);

  const missing = await anon.request("/api/listings/does-not-exist");
  check("unknown listing id -> 404", missing.status === 404, `got ${missing.status}`);

  const detail = await anon.request(`/api/listings/${items[0].id}`);
  check("GET /api/listings/:id returns 200", detail.status === 200);
  check("detail includes description + amenities", 
    typeof detail.body?.data?.description === "string" &&
    Array.isArray(detail.body?.data?.amenities) &&
    detail.body.data.amenities.length > 0);
  check("detail includes host with listing count", detail.body?.data?.host?.listingCount >= 1);
  check("detail gallery has images", (detail.body?.data?.images?.length ?? 0) > 0);

  // ---------------------------------------------------------------- auth
  console.log("\n— authentication");

  const guard = await anon.request("/api/wishlists");
  check("wishlists without session -> 401", guard.status === 401, `got ${guard.status}`);

  const bookingsGuard = await anon.request("/api/bookings");
  check("bookings without session -> 401", bookingsGuard.status === 401, `got ${bookingsGuard.status}`);

  const wrongPassword = await createClient().request("/api/auth/login", {
    method: "POST",
    body: { email: "demo@travel-agent.dev", password: "wrong-password" },
  });
  check("login with wrong password -> 401", wrongPassword.status === 401, `got ${wrongPassword.status}`);

  const alice = createClient();
  const login = await alice.request("/api/auth/login", {
    method: "POST",
    body: { email: "demo@travel-agent.dev", password: "Demo1234" },
  });
  check("demo login -> 200", login.status === 200, `got ${login.status}`);
  check("login sets a session cookie", alice.cookie.includes("ta_session"));

  const session = await alice.request("/api/auth/session");
  check("session returns the signed-in user", session.body?.data?.user?.email === "demo@travel-agent.dev");
  check("session payload never leaks a password", !("password" in (session.body?.data?.user ?? {})));

  const badRegister = await createClient().request("/api/auth/register", {
    method: "POST",
    body: { name: "x", email: "not-an-email", password: "123" },
  });
  check("register with invalid input -> 400", badRegister.status === 400, `got ${badRegister.status}`);

  const duplicate = await createClient().request("/api/auth/register", {
    method: "POST",
    body: { name: "重复", email: "demo@travel-agent.dev", password: "Demo1234" },
  });
  check("register with existing email -> 409", duplicate.status === 409, `got ${duplicate.status}`);

  // ---------------------------------------------------------------- wishlists
  console.log("\n— wishlist CRUD");

  const seeded = await alice.request("/api/wishlists");
  check("seeded wishlists are returned", seeded.status === 200 && seeded.body.data.wishlists.length === 2,
    `got ${seeded.body?.data?.wishlists?.length}`);

  const created = await alice.request("/api/wishlists", {
    method: "POST",
    body: { name: `测试心愿单-${Date.now()}` },
  });
  check("create wishlist -> 201", created.status === 201, `got ${created.status}`);
  const testWishlistId = created.body?.data?.wishlist?.id;

  const dupWishlist = await alice.request("/api/wishlists", {
    method: "POST",
    body: { name: created.body?.data?.wishlist?.name },
  });
  check("duplicate wishlist name -> 409", dupWishlist.status === 409, `got ${dupWishlist.status}`);

  const addItem = await alice.request(`/api/wishlists/${testWishlistId}/items`, {
    method: "POST",
    body: { listingId: items[0].id },
  });
  check("add listing to wishlist -> 201", addItem.status === 201, `got ${addItem.status}`);
  check("wishlist now holds 1 item", addItem.body?.data?.wishlist?.itemCount === 1);

  const dupItem = await alice.request(`/api/wishlists/${testWishlistId}/items`, {
    method: "POST",
    body: { listingId: items[0].id },
  });
  check("duplicate wishlist item -> 409", dupItem.status === 409, `got ${dupItem.status}`);

  const badItem = await alice.request(`/api/wishlists/${testWishlistId}/items`, {
    method: "POST",
    body: { listingId: "does-not-exist" },
  });
  check("adding an unknown listing -> 404", badItem.status === 404, `got ${badItem.status}`);

  const saved = await alice.request(`/api/saved?listingId=${items[0].id}`);
  check("GET /api/saved reports the saved listing", (saved.body?.data?.listingIds ?? []).includes(items[0].id));
  check("GET /api/saved reports containing wishlist",
    (saved.body?.data?.wishlistsContaining ?? []).some((w) => w.id === testWishlistId));

  const removed = await alice.request(`/api/wishlists/${testWishlistId}/items?listingId=${items[0].id}`, {
    method: "DELETE",
  });
  check("remove listing from wishlist -> 200", removed.status === 200, `got ${removed.status}`);
  check("wishlist is empty again", removed.body?.data?.wishlist?.itemCount === 0);

  const removeMissing = await alice.request(
    `/api/wishlists/${testWishlistId}/items?listingId=${items[0].id}`,
    { method: "DELETE" },
  );
  check("removing a non-member listing -> 404", removeMissing.status === 404, `got ${removeMissing.status}`);

  // ---------------------------------------------------------------- bookings
  console.log("\n— bookings / trips");

  // Every booking this suite creates is cancelled at the end, so repeated runs
  // do not collide on the same dates (PENDING/CONFIRMED holds block them).
  const createdBookingIds = [];

  const checkIn = addDays(40);
  const checkOut = addDays(45);
  const nights = 5;

  const booking = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn, checkOut, guests: 4 },
  });
  check("create booking -> 201", booking.status === 201, `got ${booking.status}: ${JSON.stringify(booking.body?.error)}`);

  const b = booking.body?.data?.booking;
  if (b?.id) createdBookingIds.push(b.id);
  if (b) {
    check("nights computed from dates", b.nights === nights, `got ${b.nights}`);
    check(
      "roomPrice == pricePerNight * nights",
      b.roomPrice === items[0].pricePerNight * nights,
      `${b.roomPrice} vs ${items[0].pricePerNight * nights}`,
    );
    check(
      "totalPrice == room + cleaning + service",
      b.totalPrice === b.roomPrice + b.cleaningFee + b.serviceFee,
      `${b.totalPrice} vs ${b.roomPrice + b.cleaningFee + b.serviceFee}`,
    );
    check("booking has a status label", typeof b.statusLabel === "string" && b.statusLabel.length > 0);
    check("new booking starts PENDING (awaiting payment)", b.status === "PENDING", b.status);
    check("new booking is not marked paid", b.isPaid === false);
  }

  const overlap = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn: addDays(42), checkOut: addDays(47), guests: 2 },
  });
  check("overlapping dates -> 409", overlap.status === 409, `got ${overlap.status}`);

  const nonOverlap = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn: addDays(60), checkOut: addDays(62), guests: 2 },
  });
  check("non-overlapping dates -> 201", nonOverlap.status === 201, `got ${nonOverlap.status}`);
  if (nonOverlap.body?.data?.booking?.id) createdBookingIds.push(nonOverlap.body.data.booking.id);

  const tooManyGuests = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items.find((i) => i.maxGuests <= 4).id, checkIn: addDays(70), checkOut: addDays(72), guests: 16 },
  });
  check("guests above listing capacity -> 400", tooManyGuests.status === 400, `got ${tooManyGuests.status}`);

  const pastDate = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn: "2020-01-01", checkOut: "2020-01-05", guests: 2 },
  });
  check("past check-in -> 400", pastDate.status === 400, `got ${pastDate.status}`);

  const badRangeBooking = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn: addDays(80), checkOut: addDays(80), guests: 2 },
  });
  check("zero-night stay -> 400", badRangeBooking.status === 400, `got ${badRangeBooking.status}`);

  const trips = await alice.request("/api/bookings");
  check("GET /api/bookings returns the trips", (trips.body?.data?.bookings?.length ?? 0) >= 2);
  check("trip stats are present", typeof trips.body?.data?.stats?.totalSpend === "number");

  const cancelled = await alice.request(`/api/bookings/${b.id}`, { method: "DELETE" });
  check("cancel booking -> 200", cancelled.status === 200, `got ${cancelled.status}`);
  check("cancelled status persisted", cancelled.body?.data?.booking?.status === "CANCELLED");

  const cancelAgain = await alice.request(`/api/bookings/${b.id}`, { method: "DELETE" });
  check("cancelling twice -> 409", cancelAgain.status === 409, `got ${cancelAgain.status}`);

  // ---------------------------------------------------------------- payments
  console.log("\n— payments (simulated checkout)");

  const payable = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn: addDays(100), checkOut: addDays(103), guests: 3 },
  });
  check("checkout booking created -> 201", payable.status === 201, `got ${payable.status}`);
  const payableId = payable.body?.data?.booking?.id;
  if (payableId) createdBookingIds.push(payableId);
  const payableTotal = payable.body?.data?.booking?.totalPrice;
  check("checkout booking is PENDING", payable.body?.data?.booking?.status === "PENDING");
  check("checkout booking has no trade number yet", !payable.body?.data?.booking?.paymentTradeNo);

  const paymentPage = await alice.request(`/payment/${payableId}`, {});
  // The page is a browser route; a non-HTML fetch returns 200 for signed-in owners.
  check("payment page is reachable for the owner", paymentPage.status === 200, `got ${paymentPage.status}`);

  const badMethod = await alice.request(`/api/bookings/${payableId}/pay`, {
    method: "POST",
    body: { method: "BITCOIN" },
  });
  check("unsupported payment method -> 400", badMethod.status === 400, `got ${badMethod.status}`);

  const anonPay = await createClient().request(`/api/bookings/${payableId}/pay`, {
    method: "POST",
    body: { method: "WECHAT" },
  });
  check("paying without a session -> 401", anonPay.status === 401, `got ${anonPay.status}`);

  const unknownPay = await alice.request("/api/bookings/does-not-exist/pay", {
    method: "POST",
    body: { method: "WECHAT" },
  });
  check("paying an unknown booking -> 404", unknownPay.status === 404, `got ${unknownPay.status}`);

  const wechatPay = await alice.request(`/api/bookings/${payableId}/pay`, {
    method: "POST",
    body: { method: "WECHAT" },
  });
  check("pay with WeChat -> 200", wechatPay.status === 200, `got ${wechatPay.status}`);

  const paidBooking = wechatPay.body?.data?.booking;
  check("booking becomes CONFIRMED after payment", paidBooking?.status === "CONFIRMED", paidBooking?.status);
  check("booking records isPaid", paidBooking?.isPaid === true);
  check("booking records the payment method", paidBooking?.paymentMethod === "WECHAT");
  check("payment method has a Chinese label", paidBooking?.paymentMethodLabel === "微信支付",
    paidBooking?.paymentMethodLabel);
  check("booking records a trade number", typeof paidBooking?.paymentTradeNo === "string" &&
    payableId !== null && (paidBooking?.paymentTradeNo ?? "").length >= 10,
    paidBooking?.paymentTradeNo);
  check("booking records paidAt", Boolean(paidBooking?.paidAt));
  check("amount is unchanged by payment", paidBooking?.totalPrice === payableTotal,
    `${paidBooking?.totalPrice} vs ${payableTotal}`);

  const payTwice = await alice.request(`/api/bookings/${payableId}/pay`, {
    method: "POST",
    body: { method: "ALIPAY" },
  });
  check("paying twice -> 409", payTwice.status === 409, `got ${payTwice.status}`);

  const paidCancel = await alice.request(`/api/bookings/${payableId}`, { method: "DELETE" });
  check("a paid booking can still be cancelled", paidCancel.status === 200, `got ${paidCancel.status}`);

  const payCancelled = await alice.request(`/api/bookings/${payableId}/pay`, {
    method: "POST",
    body: { method: "CARD" },
  });
  check("paying a cancelled booking -> 409", payCancelled.status === 409, `got ${payCancelled.status}`);

  // Alipay + card paths on a fresh order.
  const secondOrder = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn: addDays(120), checkOut: addDays(122), guests: 2 },
  });
  const secondId = secondOrder.body?.data?.booking?.id;
  if (secondId) createdBookingIds.push(secondId);
  const alipayPay = await alice.request(`/api/bookings/${secondId}/pay`, {
    method: "POST",
    body: { method: "ALIPAY" },
  });
  check("pay with Alipay -> 200", alipayPay.status === 200, `got ${alipayPay.status}`);
  check("Alipay label recorded", alipayPay.body?.data?.booking?.paymentMethodLabel === "支付宝");

  const thirdOrder = await alice.request("/api/bookings", {
    method: "POST",
    body: { listingId: items[0].id, checkIn: addDays(140), checkOut: addDays(141), guests: 2 },
  });
  const thirdId = thirdOrder.body?.data?.booking?.id;
  if (thirdId) createdBookingIds.push(thirdId);
  const cardPay = await alice.request(`/api/bookings/${thirdId}/pay`, {
    method: "POST",
    body: { method: "CARD" },
  });
  check("pay with bank card -> 200", cardPay.status === 200, `got ${cardPay.status}`);
  check("card label recorded", cardPay.body?.data?.booking?.paymentMethodLabel === "银行卡");
  check("card trade number is prefixed", String(cardPay.body?.data?.booking?.paymentTradeNo ?? "").startsWith("CARD"),
    cardPay.body?.data?.booking?.paymentTradeNo);

  const tripsAfterPay = await alice.request("/api/bookings");
  const paidInList = (tripsAfterPay.body?.data?.bookings ?? []).find((x) => x.id === payableId);
  check("paid order is reflected in the trips list", paidInList?.isPaid === true);
  check("stats expose a pending counter", typeof tripsAfterPay.body?.data?.stats?.pending === "number",
    String(tripsAfterPay.body?.data?.stats?.pending));

  // ----------------------------------------------------------------- refunds
  console.log("\n— refunds (cancellation policy)");

  /** Create a booking (optionally paid) and remember it for cleanup. */
  const book = async ({ checkIn, checkOut, guests = 2, method }) => {
    const created = await alice.request("/api/bookings", {
      method: "POST",
      body: { listingId: items[0].id, checkIn, checkOut, guests },
    });
    const booking = created.body?.data?.booking;
    if (booking?.id) createdBookingIds.push(booking.id);
    if (method && booking?.id) {
      await alice.request(`/api/bookings/${booking.id}/pay`, {
        method: "POST",
        body: { method },
      });
      const fresh = await alice.request(`/api/bookings/${booking.id}`);
      return fresh.body?.data?.booking;
    }
    return booking;
  };

  // ---- tier: NOT_PAID
  const unpaid = await book({ checkIn: addDays(200), checkOut: addDays(202) });
  const unpaidQuote = await alice.request(`/api/bookings/${unpaid.id}/refund-quote`);
  check("refund quote for an unpaid booking -> 200", unpaidQuote.status === 200, `got ${unpaidQuote.status}`);
  check("unpaid booking quote is NOT_PAID", unpaidQuote.body?.data?.quote?.tier === "NOT_PAID",
    unpaidQuote.body?.data?.quote?.tier);
  check("unpaid booking refunds nothing", unpaidQuote.body?.data?.quote?.amount === 0);

  // ---- tier: FREE (>= 7 days out)
  const freeBooking = await book({ checkIn: addDays(30), checkOut: addDays(33), guests: 3, method: "WECHAT" });
  const freeQuote = (await alice.request(`/api/bookings/${freeBooking.id}/refund-quote`)).body?.data?.quote;
  check("free-cancellation tier detected", freeQuote?.tier === "FREE", freeQuote?.tier);
  check("free cancellation refunds the full amount",
    freeQuote?.amount === freeBooking.roomPrice + freeBooking.cleaningFee + freeBooking.serviceFee,
    `${freeQuote?.amount} vs ${freeBooking.roomPrice + freeBooking.cleaningFee + freeBooking.serviceFee}`);
  check("free cancellation refunds the service fee too", freeQuote?.serviceRefund === freeBooking.serviceFee);
  check("quote reports the full paid amount", freeQuote?.totalPaid === freeBooking.totalPrice);
  check("quote counts days until check-in", typeof freeQuote?.daysUntilCheckIn === "number" && freeQuote.daysUntilCheckIn >= 29,
    String(freeQuote?.daysUntilCheckIn));

  // ---- tier: PARTIAL (3-6 days out)
  const partialBooking = await book({ checkIn: addDays(5), checkOut: addDays(7), guests: 2, method: "ALIPAY" });
  const partialQuote = (await alice.request(`/api/bookings/${partialBooking.id}/refund-quote`)).body?.data?.quote;
  const expectedPartial = Math.round(partialBooking.roomPrice * 0.5) + partialBooking.cleaningFee;
  check("partial-refund tier detected", partialQuote?.tier === "PARTIAL", partialQuote?.tier);
  check("partial refund = 50% room + full cleaning",
    partialQuote?.amount === expectedPartial,
    `${partialQuote?.amount} vs ${expectedPartial}`);
  check("partial refund returns the cleaning fee", partialQuote?.cleaningRefund === partialBooking.cleaningFee);
  check("partial refund withholds the service fee", partialQuote?.serviceRefund === 0);
  check("partial refund is less than what was paid", partialQuote?.amount < partialBooking.totalPrice);

  // ---- tier: NONE (<= 2 days out)
  const lateBooking = await book({ checkIn: addDays(2), checkOut: addDays(4), guests: 2, method: "CARD" });
  const lateQuote = (await alice.request(`/api/bookings/${lateBooking.id}/refund-quote`)).body?.data?.quote;
  check("no-refund tier detected", lateQuote?.tier === "NONE", lateQuote?.tier);
  check("no-refund tier refunds nothing", lateQuote?.amount === 0);
  check("no-refund tier still reports the paid amount", lateQuote?.totalPaid === lateBooking.totalPrice);

  // ---- cancelling an unpaid booking creates no refund
  const cancelledUnpaid = await alice.request(`/api/bookings/${unpaid.id}`, { method: "DELETE" });
  check("cancel unpaid booking -> 200", cancelledUnpaid.status === 200, `got ${cancelledUnpaid.status}`);
  check("unpaid cancellation records no refund", cancelledUnpaid.body?.data?.booking?.refund === null,
    JSON.stringify(cancelledUnpaid.body?.data?.booking?.refund));

  // ---- cancelling a paid booking creates a PROCESSING refund
  const cancelledFree = await alice.request(`/api/bookings/${freeBooking.id}`, { method: "DELETE" });
  const freeRefund = cancelledFree.body?.data?.booking?.refund;
  check("paid cancellation -> 200", cancelledFree.status === 200, `got ${cancelledFree.status}`);
  check("cancellation created a refund record", Boolean(freeRefund), JSON.stringify(freeRefund));
  check("refund amount matches the quote", freeRefund?.amount === freeQuote?.amount,
    `${freeRefund?.amount} vs ${freeQuote?.amount}`);
  check("refund starts as PROCESSING", freeRefund?.status === "PROCESSING", freeRefund?.status);
  check("refund status has a Chinese label", freeRefund?.statusLabel === "退款处理中", freeRefund?.statusLabel);
  check("refund carries a tier label", freeRefund?.tierLabel === "免费取消", freeRefund?.tierLabel);
  check("refund returns to the original channel", freeRefund?.method === "WECHAT" && freeRefund.methodLabel === "微信支付",
    `${freeRefund?.method}/${freeRefund?.methodLabel}`);
  check("refund has a trade number", typeof freeRefund?.tradeNo === "string" && freeRefund.tradeNo.startsWith("RF"),
    freeRefund?.tradeNo);
  check("refund is not settled yet", freeRefund?.isSettled === false);
  check("refund never exceeds what was paid", freeRefund?.amount <= freeBooking.totalPrice);
  check("cancelled booking keeps its paid marker", cancelledFree.body?.data?.booking?.isPaid === true);

  const quoteAfterCancel = (await alice.request(`/api/bookings/${freeBooking.id}/refund-quote`)).body?.data?.quote;
  check("quote on a cancelled booking reports ALREADY_CANCELLED",
    quoteAfterCancel?.tier === "ALREADY_CANCELLED", quoteAfterCancel?.tier);

  // ---- settle (simulated channel payout)
  const settled = await alice.request(`/api/refunds/${freeRefund.id}/settle`, { method: "POST" });
  check("settle refund -> 200", settled.status === 200, `got ${settled.status}`);
  check("refund becomes SUCCEEDED", settled.body?.data?.refund?.status === "SUCCEEDED",
    settled.body?.data?.refund?.status);
  check("refund records completion time", Boolean(settled.body?.data?.refund?.completedAt));
  check("refund reports isSettled", settled.body?.data?.refund?.isSettled === true);

  const settleAgain = await alice.request(`/api/refunds/${freeRefund.id}/settle`, { method: "POST" });
  check("settling twice -> 409", settleAgain.status === 409, `got ${settleAgain.status}`);

  const unknownRefund = await alice.request("/api/refunds/does-not-exist/settle", { method: "POST" });
  check("settling an unknown refund -> 404", unknownRefund.status === 404, `got ${unknownRefund.status}`);

  const anonQuote = await createClient().request(`/api/bookings/${freeBooking.id}/refund-quote`);
  check("refund quote without a session -> 401", anonQuote.status === 401, `got ${anonQuote.status}`);

  const tripsAfterRefund = await alice.request("/api/bookings");
  const refundStats = tripsAfterRefund.body?.data?.stats;
  check("stats expose refunded total", refundStats?.refunded >= freeRefund.amount,
    `${refundStats?.refunded} vs ${freeRefund.amount}`);

  const cancelledCard = (tripsAfterRefund.body?.data?.bookings ?? []).find((x) => x.id === freeBooking.id);
  check("cancelled trip still lists its refund", cancelledCard?.refund?.status === "SUCCEEDED");

  // ------------------------------------------------- cross-user isolation
  console.log("\n— cross-user isolation (the security-critical part)");

  const bob = createClient();
  const bobEmail = `bob-${Date.now()}@travel-agent.dev`;
  const bobRegister = await bob.request("/api/auth/register", {
    method: "POST",
    body: { name: "Bob", email: bobEmail, password: "BobPassword123" },
  });
  check("register a second user -> 201", bobRegister.status === 201, `got ${bobRegister.status}`);

  const aliceWishlists = await alice.request("/api/wishlists");
  const aliceWishlistId = aliceWishlists.body?.data?.wishlists?.[0]?.id;

  const bobReadsAlice = await bob.request(`/api/wishlists/${aliceWishlistId}`);
  check("user B cannot read user A's wishlist", bobReadsAlice.status === 403, `got ${bobReadsAlice.status}`);

  const bobWritesAlice = await bob.request(`/api/wishlists/${aliceWishlistId}/items`, {
    method: "POST",
    body: { listingId: items[1].id },
  });
  check("user B cannot write to user A's wishlist", bobWritesAlice.status === 403, `got ${bobWritesAlice.status}`);

  const bobDeletesAlice = await bob.request(`/api/wishlists/${aliceWishlistId}`, { method: "DELETE" });
  check("user B cannot delete user A's wishlist", bobDeletesAlice.status === 403, `got ${bobDeletesAlice.status}`);

  const bobSees = await bob.request("/api/wishlists");
  check("user B sees only their own (empty) wishlists", bobSees.body?.data?.wishlists?.length === 0,
    `got ${bobSees.body?.data?.wishlists?.length}`);

  const bobSaved = await bob.request("/api/saved");
  check("user B's saved list is empty", (bobSaved.body?.data?.listingIds ?? []).length === 0);

  const aliceBookingId = trips.body?.data?.bookings?.[0]?.id;
  const bobCancelsAliceBooking = await bob.request(`/api/bookings/${aliceBookingId}`, { method: "DELETE" });
  check("user B cannot cancel user A's booking", bobCancelsAliceBooking.status === 403,
    `got ${bobCancelsAliceBooking.status}`);

  const bobPaysAliceBooking = await bob.request(`/api/bookings/${aliceBookingId}/pay`, {
    method: "POST",
    body: { method: "WECHAT" },
  });
  check("user B cannot pay user A's booking", bobPaysAliceBooking.status === 403,
    `got ${bobPaysAliceBooking.status}`);

  const bobPaymentPage = await bob.request(`/payment/${aliceBookingId}`, {});
  check("user B cannot open user A's checkout page", bobPaymentPage.status === 404,
    `got ${bobPaymentPage.status}`);

  const bobRefundQuote = await bob.request(`/api/bookings/${freeBooking.id}/refund-quote`, {});
  check("user B cannot read user A's refund quote", bobRefundQuote.status === 403,
    `got ${bobRefundQuote.status}`);

  const bobSettlesAliceRefund = await bob.request(`/api/refunds/${freeRefund.id}/settle`, {
    method: "POST",
  });
  check("user B cannot settle user A's refund", bobSettlesAliceRefund.status === 403,
    `got ${bobSettlesAliceRefund.status}`);

  const bobTrips = await bob.request("/api/bookings");
  check("user B sees no bookings", (bobTrips.body?.data?.bookings ?? []).length === 0);

  // cleanup
  await alice.request(`/api/wishlists/${testWishlistId}`, { method: "DELETE" });

  // ---------------------------------------------------------------- cleanup
  console.log("\n— cleanup (release the dates this suite held)");

  for (const id of createdBookingIds) {
    await alice.request(`/api/bookings/${id}`, { method: "DELETE" });
  }

  const afterCleanup = await alice.request("/api/bookings");
  const stillHolding = (afterCleanup.body?.data?.bookings ?? []).filter(
    (booking) => createdBookingIds.includes(booking.id) && booking.status !== "CANCELLED",
  );
  check(
    "every booking created by this suite was released",
    stillHolding.length === 0,
    stillHolding.map((booking) => booking.status).join(","),
  );

  // ---------------------------------------------------------------- logout
  console.log("\n— logout");

  const logout = await alice.request("/api/auth/logout", { method: "POST" });
  check("logout -> 200", logout.status === 200, `got ${logout.status}`);
  const afterLogout = await alice.request("/api/wishlists");
  check("wishlists after logout -> 401", afterLogout.status === 401, `got ${afterLogout.status}`);

  // ---------------------------------------------------------------- report
  console.log(`\n${"=".repeat(64)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("=".repeat(64));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("\nsmoke-api crashed:", error);
  process.exit(1);
});
