/**
 * Notifications: created by real events, readable, markable, mutable.
 *
 *     node scripts/smoke-notifications.mjs [baseUrl]
 *
 * Drives the *actual* business operations (send a friend request, accept it, reply
 * to a post) and then checks the recipient's inbox — because the value of this
 * feature is that it is wired to those events, and a suite that inserted
 * notification rows directly would prove nothing about the wiring.
 *
 * Two throwaway `@example.com` accounts, deleted at the end, so the demo account's
 * own notification list stays empty and the other suites are unaffected.
 */
import pg from "pg";

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

function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async request(path, { method = "GET", body } = {}) {
      const response = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      const setCookie = (response.headers.getSetCookie?.() ?? [])
        .map((entry) => entry.split(";")[0])
        .join("; ");
      if (setCookie) cookie = setCookie;
      return { status: response.status, body: json };
    },
  };
}

const stamp = Date.now();
const password = "Demo1234";

const alice = client();
const bob = client();

const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});
await db.connect();

const inbox = async (who) => {
  const response = await who.request("/api/notifications");
  return response.body?.data ?? { items: [], unreadCount: 0 };
};

async function main() {
  console.log("— two throwaway accounts");
  const aliceEmail = `notify-alice-${stamp}@example.com`;
  const bobEmail = `notify-bob-${stamp}@example.com`;

  const aliceReg = await alice.request("/api/auth/register", {
    method: "POST",
    body: { name: "通知测试甲", email: aliceEmail, password },
  });
  const bobReg = await bob.request("/api/auth/register", {
    method: "POST",
    body: { name: "通知测试乙", email: bobEmail, password },
  });
  check("both test accounts register", aliceReg.status === 201 && bobReg.status === 201, `${aliceReg.status}/${bobReg.status}`);

  const aliceId = (await alice.request("/api/auth/session")).body?.data?.user?.id;
  const bobId = (await bob.request("/api/auth/session")).body?.data?.user?.id;
  check("and both have session ids", Boolean(aliceId && bobId));

  console.log("\n— a new inbox is empty (and needs a session)");
  const anonymous = await fetch(`${BASE}/api/notifications`);
  check("the endpoint refuses an anonymous caller", anonymous.status === 401, `got ${anonymous.status}`);
  check("a new account starts with nothing", (await inbox(bob)).unreadCount === 0);

  console.log("\n— a friend request notifies the addressee, not the sender");
  const sent = await alice.request("/api/friends", { method: "POST", body: { userId: bobId } });
  check("the request is created", sent.status === 201 || sent.status === 200, `got ${sent.status}`);

  const bobInbox = await inbox(bob);
  check("the addressee has one notification", bobInbox.items.length === 1, `got ${bobInbox.items.length}`);
  check(
    "of type FRIEND_REQUEST",
    bobInbox.items[0]?.type === "FRIEND_REQUEST",
    String(bobInbox.items[0]?.type),
  );
  check(
    "carrying the actor, so the copy can name them",
    bobInbox.items[0]?.actor?.id === aliceId,
    JSON.stringify(bobInbox.items[0]?.actor),
  );
  check("and it points at the friends page", bobInbox.items[0]?.href === "/friends", String(bobInbox.items[0]?.href));
  check("the badge counts it", bobInbox.unreadCount === 1, String(bobInbox.unreadCount));
  check("the sender got nothing", (await inbox(alice)).items.length === 0);

  console.log("\n— being told your own action is not news");
  // The friendship id (`friendshipId`), not the notification id: the accept route
  // takes the friendship row, and using the wrong id produced a 404 rather than a
  // wrong result — which is exactly why it is asserted rather than assumed.
  const friendshipId = sent.body?.data?.friend?.friendshipId;
  check("the request returns the friendship id", Boolean(friendshipId), JSON.stringify(sent.body?.data));

  const accepted = await bob.request(`/api/friends/${friendshipId}`, {
    method: "POST",
    body: { action: "accept" },
  });
  check("the request can be accepted", accepted.status === 200, `got ${accepted.status}`);

  const aliceInbox = await inbox(alice);
  check(
    "the requester is told it was accepted",
    aliceInbox.items.some((item) => item.type === "FRIEND_ACCEPTED"),
    JSON.stringify(aliceInbox.items.map((item) => item.type)),
  );
  check(
    "and the actor is the accepting side",
    aliceInbox.items.find((item) => item.type === "FRIEND_ACCEPTED")?.actor?.id === bobId,
  );
  check(
    "accepting did not notify the accepter about their own action",
    !(await inbox(bob)).items.some((item) => item.type === "FRIEND_ACCEPTED"),
  );

  console.log("\n— a reply notifies the author");
  const post = await alice.request("/api/forum/posts", {
    method: "POST",
    body: { boardSlug: "city", title: `通知测试帖 ${stamp}`, body: "占位正文，用于验证回复通知。", city: "Tokyo" },
  });
  const postId = post.body?.data?.post?.id;
  check("a post can be created", Boolean(postId), `got ${post.status}`);

  await bob.request(`/api/forum/posts/${postId}/replies`, {
    method: "POST",
    body: { body: "来自通知测试的回复。" },
  });
  const afterReply = await inbox(alice);
  const replyNote = afterReply.items.find((item) => item.type === "POST_REPLY");
  check("the post author is notified", Boolean(replyNote), JSON.stringify(afterReply.items.map((i) => i.type)));
  check("of type POST_REPLY", replyNote?.type === "POST_REPLY", String(replyNote?.type));
  check("pointing at the thread", replyNote?.href === `/forum/${postId}`, String(replyNote?.href));
  check("with the post title for the copy", replyNote?.meta?.postTitle === `通知测试帖 ${stamp}`, JSON.stringify(replyNote?.meta));

  const beforeSelfReply = (await inbox(bob)).items.length;
  await bob.request(`/api/forum/posts/${postId}/replies`, { method: "POST", body: { body: "自己回复自己。" } });
  check(
    "replying to your own thread notifies nobody",
    (await inbox(bob)).items.length === beforeSelfReply,
    "the actor's own inbox grew",
  );

  console.log("\n— reading and marking");
  const unreadBefore = (await inbox(alice)).unreadCount;
  const firstId = (await inbox(alice)).items[0].id;
  const markedOne = await alice.request("/api/notifications/read", { method: "POST", body: { id: firstId } });
  check("marking one succeeds", markedOne.status === 200, `got ${markedOne.status}`);
  check(
    "and lowers the count by exactly one",
    markedOne.body?.data?.unreadCount === unreadBefore - 1,
    `${unreadBefore} -> ${markedOne.body?.data?.unreadCount}`,
  );

  const markedAll = await alice.request("/api/notifications/read", { method: "POST", body: {} });
  check("marking all empties the badge", markedAll.body?.data?.unreadCount === 0, String(markedAll.body?.data?.unreadCount));
  check(
    "and the rows read as read",
    (await inbox(alice)).items.every((item) => item.read === true),
  );

  console.log("\n— one account cannot touch another's inbox");
  const bobUnread = (await inbox(bob)).unreadCount;
  if (bobUnread > 0) {
    const bobFirst = (await inbox(bob)).items[0].id;
    await alice.request("/api/notifications/read", { method: "POST", body: { id: bobFirst } });
    check(
      "a guessed id does not clear someone else's notification",
      (await inbox(bob)).unreadCount === bobUnread,
      `${bobUnread} -> ${(await inbox(bob)).unreadCount}`,
    );
  } else {
    console.log("  SKIP  the other inbox has nothing unread");
  }

  console.log("\n— muting a type stops it being created");
  const mute = await bob.request("/api/users/me", {
    method: "PATCH",
    body: { mutedNotificationTypes: ["FRIEND_REQUEST"] },
  });
  check("the mute list saves", mute.status === 200, `got ${mute.status}`);
  check(
    "and is echoed back",
    JSON.stringify(mute.body?.data?.user?.mutedNotificationTypes) === JSON.stringify(["FRIEND_REQUEST"]),
    JSON.stringify(mute.body?.data?.user?.mutedNotificationTypes),
  );

  const carol = client();
  const carolReg = await carol.request("/api/auth/register", {
    method: "POST",
    body: { name: "通知测试丙", email: `notify-carol-${stamp}@example.com`, password },
  });
  const carolId = (await carol.request("/api/auth/session")).body?.data?.user?.id;
  check("a third account registers", carolReg.status === 201 && Boolean(carolId), `got ${carolReg.status}`);

  const bobBefore = (await inbox(bob)).items.length;
  const carolRequest = await carol.request("/api/friends", { method: "POST", body: { userId: bobId } });
  check("they can send a friend request", carolRequest.status === 201 || carolRequest.status === 200, `got ${carolRequest.status}`);
  check(
    "but the muted type creates no notification",
    (await inbox(bob)).items.length === bobBefore,
    `${bobBefore} -> ${(await inbox(bob)).items.length}`,
  );

  const unmute = await bob.request("/api/users/me", { method: "PATCH", body: { mutedNotificationTypes: [] } });
  check("unmuting works too", unmute.status === 200, `got ${unmute.status}`);

  // Clean up: the accounts and everything cascading from them.
  const removed = await db.query(
    `delete from "User" where email in ($1, $2, $3)`,
    [aliceEmail, bobEmail, `notify-carol-${stamp}@example.com`],
  );
  check("the throwaway accounts are removed", removed.rowCount === 3, `deleted ${removed.rowCount}`);

  console.log(`\n${"=".repeat(58)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log("=".repeat(58));
}

try {
  await main();
} catch (error) {
  console.error(error);
  failed++;
} finally {
  await db.end();
}

process.exit(failed === 0 ? 0 : 1);
