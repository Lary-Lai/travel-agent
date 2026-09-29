#!/usr/bin/env node
/**
 * Social graph: profile visibility + friends.
 *
 *     node scripts/smoke-social.mjs [baseUrl]
 *
 * The visibility matrix is the part that matters. `resolveProfileAccess` is the
 * single rule that decides whether a profile opens at all, so this suite drives
 * it over real HTTP from four different vantage points (the owner, an accepted
 * friend, a stranger who is on the allow-list, a stranger who is not, and a
 * signed-out caller) and asserts both halves of every answer: *whether* the
 * profile opened AND *why* — a `canView: false` with the wrong reason is still a
 * bug, and it is the reason the UI renders to the user.
 *
 * The friend lifecycle is driven end to end, including the two rules that are
 * easy to get wrong: a duplicate request must be refused rather than silently
 * accepted, and a stranger holding someone else's friendship id must get 403.
 *
 * Throwaway accounts are registered with a per-run timestamp and deleted again
 * through `pg` at the end, so repeated runs leave no junk behind.
 */

const BASE = process.argv[2] ?? "http://localhost:3001";

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

const { default: pg } = await import("pg");
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});
await db.connect();

const RUN = Date.now();
const emails = [];

const register = async (label) => {
  const client = createClient();
  const email = `social-${label}-${RUN}@travel-agent.dev`;
  emails.push(email);
  const response = await client.request("/api/auth/register", {
    method: "POST",
    body: { name: `${label}-${RUN}`, email, password: "SocialTest123" },
  });
  if (response.status !== 201) {
    throw new Error(`register ${label} failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { client, id: response.body.data.user.id, name: response.body.data.user.name, email };
};

/** One profile read, as a given session. */
const profileOf = async (client, id) => {
  const response = await client.request(`/api/users/${id}`);
  return { status: response.status, profile: response.body?.data ?? null };
};

/** Put the owner into a visibility mode with explicit exception lists. */
const setPrivacy = (client, visibility, allow = [], deny = []) =>
  client.request("/api/users/me/privacy", {
    method: "PUT",
    body: { visibility, allow, deny },
  });

async function main() {
  console.log(`\nSocial integration test against ${BASE}\n`);

  // ------------------------------------------------------------------ fixtures
  console.log("— fixtures");

  const anonymous = createClient();

  // The demo account doubles as a stable, pre-existing "not listed anywhere"
  // viewer, and doubles as the credential check for this suite.
  const demo = createClient();
  const demoLogin = await demo.request("/api/auth/login", {
    method: "POST",
    body: { email: "demo@travel-agent.dev", password: "Demo1234" },
  });
  check("demo login -> 200", demoLogin.status === 200, `got ${demoLogin.status}`);
  const demoId = demoLogin.body?.data?.user?.id;
  check("demo session is usable", Boolean(demoId) && demo.cookie.includes("ta_session"));

  const owner = await register("owner");
  const friend = await register("friend");
  const stranger = await register("stranger");
  check("three throwaway accounts registered", Boolean(owner.id && friend.id && stranger.id));

  const fresh = await owner.client.request("/api/users/me/privacy");
  check("a new account starts PUBLIC", fresh.body?.data?.visibility === "PUBLIC", fresh.body?.data?.visibility);
  check(
    "a new account has empty exception lists",
    (fresh.body?.data?.allow ?? []).length === 0 && (fresh.body?.data?.deny ?? []).length === 0,
  );

  // ------------------------------------------------------- PUBLIC visibility
  console.log("\n— PUBLIC: everyone, including signed-out visitors");

  const strangerOnPublic = await profileOf(stranger.client, owner.id);
  check("a stranger can open a PUBLIC profile", strangerOnPublic.profile?.canView === true);
  check("the reason is PUBLIC", strangerOnPublic.profile?.access === "PUBLIC", strangerOnPublic.profile?.access);
  check("a visible profile carries profile + stats", Boolean(strangerOnPublic.profile?.profile) && Boolean(strangerOnPublic.profile?.stats));
  check("the owner's name is always present", strangerOnPublic.profile?.user?.id === owner.id);

  const anonOnPublic = await profileOf(anonymous, owner.id);
  check("a signed-out visitor can open a PUBLIC profile", anonOnPublic.profile?.canView === true);
  check("the signed-out reason is PUBLIC", anonOnPublic.profile?.access === "PUBLIC", anonOnPublic.profile?.access);
  check("a signed-out viewer has 0 mutual friends", anonOnPublic.profile?.mutualFriendCount === 0);
  check(
    "a signed-out viewer has no friend relation",
    anonOnPublic.profile?.relation === "NONE" && anonOnPublic.profile?.requestId === null,
  );

  const selfOnPublic = await profileOf(owner.client, owner.id);
  check("the owner sees their own profile", selfOnPublic.profile?.canView === true);
  check("the owner's reason is SELF", selfOnPublic.profile?.access === "SELF", selfOnPublic.profile?.access);
  check("the owner's relation is SELF", selfOnPublic.profile?.relation === "SELF");

  const missing = await profileOf(anonymous, "does-not-exist");
  check("an unknown user id -> 404", missing.status === 404, `got ${missing.status}`);

  // -------------------------------------------------------- friend lifecycle
  console.log("\n— friend requests: send, duplicate, accept, remove");

  const sent = await friend.client.request("/api/friends", {
    method: "POST",
    body: { userId: owner.id },
  });
  check("send a friend request -> 201", sent.status === 201, `got ${sent.status}`);
  const requestId = sent.body?.data?.friend?.friendshipId;
  check("the request is PENDING and outgoing", sent.body?.data?.friend?.status === "PENDING" && sent.body?.data?.friend?.direction === "OUTGOING");
  check("the sender's relation is REQUEST_SENT", sent.body?.data?.friend?.relation === "REQUEST_SENT", sent.body?.data?.friend?.relation);

  const duplicate = await friend.client.request("/api/friends", {
    method: "POST",
    body: { userId: owner.id },
  });
  check("a duplicate request -> 409", duplicate.status === 409, `got ${duplicate.status}`);
  check(
    "the duplicate message says the request is already sent",
    /已发送|等待/.test(duplicate.body?.error?.message ?? ""),
    duplicate.body?.error?.message,
  );

  const selfAdd = await friend.client.request("/api/friends", {
    method: "POST",
    body: { userId: friend.id },
  });
  check("adding yourself -> 400", selfAdd.status === 400, `got ${selfAdd.status}`);

  const ownerInbox = await owner.client.request("/api/friends");
  check("the request appears in the other user's incoming list", ownerInbox.body?.data?.incoming?.length === 1,
    JSON.stringify(ownerInbox.body?.data?.incoming?.length));
  check(
    "the incoming entry names the sender and the REQUEST_RECEIVED relation",
    ownerInbox.body?.data?.incoming?.[0]?.user?.id === friend.id &&
      ownerInbox.body?.data?.incoming?.[0]?.relation === "REQUEST_RECEIVED",
  );
  check("the received request has the same row id", ownerInbox.body?.data?.incoming?.[0]?.friendshipId === requestId);
  check("nothing is in the friends list yet", (ownerInbox.body?.data?.friends ?? []).length === 0);
  check(
    "the recipient's profile read says REQUEST_RECEIVED and exposes the row id",
    (await profileOf(owner.client, friend.id)).profile?.relation === "REQUEST_RECEIVED" &&
      (await profileOf(owner.client, friend.id)).profile?.requestId === requestId,
  );

  const strangerAccepts = await stranger.client.request(`/api/friends/${requestId}`, {
    method: "POST",
    body: { action: "accept" },
  });
  check("a stranger cannot accept someone else's request -> 403", strangerAccepts.status === 403,
    `got ${strangerAccepts.status}`);

  const strangerRemoves = await stranger.client.request(`/api/friends/${requestId}`, { method: "DELETE" });
  check("a stranger cannot delete someone else's friendship -> 403", strangerRemoves.status === 403,
    `got ${strangerRemoves.status}`);

  // Asking back while their request is pending is a "yes", not a second request.
  const askBack = await owner.client.request("/api/friends", {
    method: "POST",
    body: { userId: friend.id },
  });
  check("asking back auto-accepts the pending request -> 201", askBack.status === 201, `got ${askBack.status}`);
  check("the auto-accepted friendship is ACCEPTED", askBack.body?.data?.friend?.status === "ACCEPTED",
    askBack.body?.data?.friend?.status);
  check("the auto-accepted relation is FRIEND", askBack.body?.data?.friend?.relation === "FRIEND",
    askBack.body?.data?.friend?.relation);
  check("auto-accept reuses the same friendship row", askBack.body?.data?.friend?.friendshipId === requestId);

  const acceptedId = askBack.body?.data?.friend?.friendshipId;

  const ownerAfterAccept = await owner.client.request("/api/friends");
  check("both sides now list each other as friends",
    ownerAfterAccept.body?.data?.friends?.length === 1 &&
      ownerAfterAccept.body?.data?.friends?.[0]?.user?.id === friend.id &&
      ownerAfterAccept.body?.data?.friends?.[0]?.relation === "FRIEND");
  check("the incoming list is empty again", (ownerAfterAccept.body?.data?.incoming ?? []).length === 0);
  check(
    "the other side also sees FRIEND",
    (await profileOf(friend.client, owner.id)).profile?.relation === "FRIEND",
  );
  check(
    "the friend's own friends list is symmetric",
    (await friend.client.request("/api/friends")).body?.data?.friends?.[0]?.user?.id === owner.id,
  );

  const respondAfterAccept = await owner.client.request(`/api/friends/${acceptedId}`, {
    method: "POST",
    body: { action: "decline" },
  });
  check("responding to an already accepted friendship -> 409", respondAfterAccept.status === 409,
    `got ${respondAfterAccept.status}`);

  const unfriend = await friend.client.request(`/api/friends/${acceptedId}`, { method: "DELETE" });
  check("either party can remove the friendship -> 200", unfriend.status === 200, `got ${unfriend.status}`);
  check("removal reports true", unfriend.body?.data?.removed === true);
  check(
    "the relation is back to NONE",
    (await profileOf(friend.client, owner.id)).profile?.relation === "NONE" &&
      (await profileOf(friend.client, owner.id)).profile?.requestId === null,
  );
  check("the friends list is empty again", (await friend.client.request("/api/friends")).body?.data?.friends?.length === 0);

  // A fresh request, this time accepted explicitly, so both response paths are
  // covered; and one declined, to prove declining clears the request.
  const again = await friend.client.request("/api/friends", { method: "POST", body: { userId: owner.id } });
  const explicitAccept = await owner.client.request(`/api/friends/${again.body?.data?.friend?.friendshipId}`, {
    method: "POST",
    body: { action: "accept" },
  });
  check("the addressee can accept -> 200", explicitAccept.status === 200, `got ${explicitAccept.status}`);
  check("accepting sets ACCEPTED", explicitAccept.body?.data?.friend?.status === "ACCEPTED");

  const declineMe = await stranger.client.request("/api/friends", {
    method: "POST",
    body: { userId: owner.id },
  });
  check("a second user can send a request -> 201", declineMe.status === 201, `got ${declineMe.status}`);
  const declined = await owner.client.request(`/api/friends/${declineMe.body?.data?.friend?.friendshipId}`, {
    method: "POST",
    body: { action: "decline" },
  });
  check("the addressee can decline -> 200", declined.status === 200, `got ${declined.status}`);
  check("declining reports the relation is now NONE", declined.body?.data?.friend?.relation === "NONE",
    declined.body?.data?.friend?.relation);
  check(
    "a declined request is gone for both sides",
    (await owner.client.request("/api/friends")).body?.data?.incoming?.length === 0 &&
      (await profileOf(stranger.client, owner.id)).profile?.relation === "NONE",
  );

  const badAction = await owner.client.request(`/api/friends/${acceptedId}`, {
    method: "POST",
    body: { action: "maybe" },
  });
  check("an unknown action -> 400", badAction.status === 400, `got ${badAction.status}`);
  const unknownFriendship = await owner.client.request("/api/friends/does-not-exist", { method: "DELETE" });
  check("removing an unknown friendship -> 404", unknownFriendship.status === 404, `got ${unknownFriendship.status}`);
  const unknownAddressee = await owner.client.request("/api/friends", {
    method: "POST",
    body: { userId: "does-not-exist" },
  });
  check("requesting an unknown user -> 404", unknownAddressee.status === 404, `got ${unknownAddressee.status}`);

  // ------------------------------------------------------ FRIENDS visibility
  console.log("\n— FRIENDS: friends, plus the allow-list");

  const toFriends = await setPrivacy(owner.client, "FRIENDS");
  check("switching to FRIENDS -> 200", toFriends.status === 200, `got ${toFriends.status}`);
  check("the mode is stored", toFriends.body?.data?.visibility === "FRIENDS", toFriends.body?.data?.visibility);

  const strangerOnFriends = await profileOf(stranger.client, owner.id);
  check("a non-friend is blocked from a FRIENDS profile", strangerOnFriends.profile?.canView === false);
  check("the reason is FRIENDS_ONLY", strangerOnFriends.profile?.access === "FRIENDS_ONLY", strangerOnFriends.profile?.access);
  check("a hidden profile carries no profile section", strangerOnFriends.profile?.profile === null);
  check("a hidden profile carries no stats", strangerOnFriends.profile?.stats === null);
  check("a hidden profile still carries the name", strangerOnFriends.profile?.user?.id === owner.id);

  const anonOnFriends = await profileOf(anonymous, owner.id);
  check("a signed-out visitor is blocked from a FRIENDS profile", anonOnFriends.profile?.canView === false);
  check("the signed-out reason is FRIENDS_ONLY", anonOnFriends.profile?.access === "FRIENDS_ONLY", anonOnFriends.profile?.access);

  const friendOnFriends = await profileOf(friend.client, owner.id);
  check("an accepted friend can open a FRIENDS profile", friendOnFriends.profile?.canView === true);
  check("the reason is FRIEND", friendOnFriends.profile?.access === "FRIEND", friendOnFriends.profile?.access);
  check("the friend sees the stats", friendOnFriends.profile?.stats?.friends >= 1,
    JSON.stringify(friendOnFriends.profile?.stats));
  check("the friend sees the profile section", friendOnFriends.profile?.profile !== null);

  // FRIENDS admits the allow-list as well as friends — that is what the mode's
  // hint promises, and one person added to the list must not require switching
  // the whole mode to SELECTED.
  await setPrivacy(owner.client, "FRIENDS", [stranger.id]);
  const listedOnFriends = await profileOf(stranger.client, owner.id);
  check("a listed non-friend is admitted under FRIENDS", listedOnFriends.profile?.canView === true,
    `${listedOnFriends.profile?.canView}/${listedOnFriends.profile?.access}`);
  check("the listed viewer's reason is ALLOWED", listedOnFriends.profile?.access === "ALLOWED",
    listedOnFriends.profile?.access);
  const unlistedOnFriends = await profileOf(demo, owner.id);
  check("an unlisted non-friend stays blocked under FRIENDS", unlistedOnFriends.profile?.canView === false);
  check("the unlisted reason stays FRIENDS_ONLY", unlistedOnFriends.profile?.access === "FRIENDS_ONLY",
    unlistedOnFriends.profile?.access);

  // ----------------------------------------------------- SELECTED visibility
  console.log("\n— SELECTED: the allow-list only, friends included");

  const toSelected = await setPrivacy(owner.client, "SELECTED", [stranger.id]);
  check("switching to SELECTED -> 200", toSelected.status === 200, `got ${toSelected.status}`);
  check("the allow-list is hydrated with the user", toSelected.body?.data?.allow?.[0]?.id === stranger.id,
    JSON.stringify(toSelected.body?.data?.allow));

  const listed = await profileOf(stranger.client, owner.id);
  check("a listed user can open a SELECTED profile", listed.profile?.canView === true);
  check("the reason is ALLOWED", listed.profile?.access === "ALLOWED", listed.profile?.access);

  const unlisted = await profileOf(demo, owner.id);
  check("an unlisted non-friend is blocked from a SELECTED profile", unlisted.profile?.canView === false);
  check("the reason is SELECTED_ONLY", unlisted.profile?.access === "SELECTED_ONLY", unlisted.profile?.access);

  const anonOnSelected = await profileOf(anonymous, owner.id);
  check("a signed-out visitor is blocked from a SELECTED profile", anonOnSelected.profile?.canView === false);
  check("the signed-out reason is SELECTED_ONLY", anonOnSelected.profile?.access === "SELECTED_ONLY", anonOnSelected.profile?.access);

  // The mode split, pinned: a friend who is NOT on the allow-list is refused
  // under SELECTED. Otherwise SELECTED and FRIENDS would both mean
  // "friends ∪ allow-list" and two of the four modes would be identical.
  const friendOnSelected = await profileOf(friend.client, owner.id);
  check("an unlisted friend is refused under SELECTED", friendOnSelected.profile?.canView === false,
    `${friendOnSelected.profile?.canView}/${friendOnSelected.profile?.access}`);
  check("the unlisted friend's reason is SELECTED_ONLY",
    friendOnSelected.profile?.access === "SELECTED_ONLY", friendOnSelected.profile?.access);
  check("being a friend is not enough to be a listed user",
    !(toSelected.body?.data?.allow ?? []).some((person) => person.id === friend.id));

  // ------------------------------------------------------ PRIVATE visibility
  console.log("\n— PRIVATE: the owner, and nobody else at all");

  const toPrivate = await setPrivacy(owner.client, "PRIVATE");
  check("switching to PRIVATE -> 200", toPrivate.status === 200, `got ${toPrivate.status}`);

  const selfOnPrivate = await profileOf(owner.client, owner.id);
  check("the owner's own PRIVATE profile still works", selfOnPrivate.profile?.canView === true);
  check("the owner's reason is SELF", selfOnPrivate.profile?.access === "SELF");
  check("the owner still sees their own profile body", selfOnPrivate.profile?.profile !== null);

  for (const [label, client] of [
    ["a stranger", stranger.client],
    ["an unlisted user", demo],
    ["a signed-out visitor", anonymous],
  ]) {
    const hidden = await profileOf(client, owner.id);
    check(`${label} is blocked from a PRIVATE profile`, hidden.profile?.canView === false);
    check(`${label} is told PRIVATE`, hidden.profile?.access === "PRIVATE", hidden.profile?.access);
  }

  // PRIVATE is checked before friendship and before the allow-list, so neither
  // admits anybody: this is the case that used to let a friend in, and the whole
  // reason the ordering puts the mode above both.
  const friendOnPrivate = await profileOf(friend.client, owner.id);
  check("an accepted friend is refused under PRIVATE", friendOnPrivate.profile?.canView === false,
    `${friendOnPrivate.profile?.canView}/${friendOnPrivate.profile?.access}`);
  check("the friend's reason is PRIVATE, not FRIEND", friendOnPrivate.profile?.access === "PRIVATE",
    friendOnPrivate.profile?.access);

  await setPrivacy(owner.client, "PRIVATE", [stranger.id]);
  const granted = await profileOf(stranger.client, owner.id);
  check("an ALLOW row does NOT admit a viewer under PRIVATE", granted.profile?.canView === false,
    `${granted.profile?.canView}/${granted.profile?.access}`);
  check("the listed viewer is told PRIVATE, not ALLOWED", granted.profile?.access === "PRIVATE",
    granted.profile?.access);

  // DENY is still checked before the mode, so a blocked viewer is told they are
  // blocked even when the profile is private anyway.
  await setPrivacy(owner.client, "PRIVATE", [], [stranger.id]);
  const blockedOnPrivate = await profileOf(stranger.client, owner.id);
  check("a DENY row is reported ahead of PRIVATE",
    blockedOnPrivate.profile?.canView === false && blockedOnPrivate.profile?.access === "DENIED",
    `${blockedOnPrivate.profile?.canView}/${blockedOnPrivate.profile?.access}`);

  // ---------------------------------------------------------- DENY overrides
  console.log("\n— DENY: a block beats PUBLIC, ALLOW and friendship");

  const bothLists = await setPrivacy(owner.client, "PUBLIC", [stranger.id], [stranger.id]);
  check("a block survives being listed on both lists -> 200", bothLists.status === 200, `got ${bothLists.status}`);
  check("the duplicating id is dropped from the allow-list", (bothLists.body?.data?.allow ?? []).length === 0,
    JSON.stringify(bothLists.body?.data?.allow));
  check("the id is kept on the deny-list", bothLists.body?.data?.deny?.[0]?.id === stranger.id);

  const blockedOnPublic = await profileOf(stranger.client, owner.id);
  check("a block overrides PUBLIC", blockedOnPublic.profile?.canView === false);
  check("the reason is DENIED", blockedOnPublic.profile?.access === "DENIED", blockedOnPublic.profile?.access);

  const stillPublic = await profileOf(demo, owner.id);
  check("everyone else still sees the PUBLIC profile", stillPublic.profile?.canView === true);

  const anonOnPublicAgain = await profileOf(anonymous, owner.id);
  check("a signed-out visitor still sees the PUBLIC profile", anonOnPublicAgain.profile?.canView === true);

  check(
    "a block does not affect an accepted friend",
    (await profileOf(friend.client, owner.id)).profile?.access === "FRIEND",
  );

  // The client cannot smuggle an ALLOW row in alongside a DENY, because the
  // service drops the allow entry before storing; re-sending it must not help.
  await setPrivacy(owner.client, "SELECTED", [stranger.id], [stranger.id]);
  const blockedOnSelected = await profileOf(stranger.client, owner.id);
  check(
    "a block overrides an ALLOW row in SELECTED mode too",
    blockedOnSelected.profile?.canView === false && blockedOnSelected.profile?.access === "DENIED",
    `${blockedOnSelected.profile?.canView}/${blockedOnSelected.profile?.access}`,
  );

  const selfOnLists = await setPrivacy(owner.client, "PUBLIC", [owner.id], [owner.id]);
  check(
    "the owner cannot list themselves on either list",
    (selfOnLists.body?.data?.allow ?? []).length === 0 && (selfOnLists.body?.data?.deny ?? []).length === 0,
    JSON.stringify(selfOnLists.body?.data),
  );

  // ------------------------------------------------------------------ search
  console.log("\n— user search");

  // Re-establish a block (the self-list check above cleared the lists) so both
  // directions of "a block hides a person from search" can be asserted.
  await setPrivacy(owner.client, "PUBLIC", [], [stranger.id]);

  const ownSearch = await owner.client.request(`/api/users/search?q=${encodeURIComponent(owner.name)}`);
  check("search returns 200", ownSearch.status === 200, `got ${ownSearch.status}`);
  check("search never returns the caller", !(ownSearch.body?.data?.users ?? []).some((u) => u.id === owner.id));

  const friendSearch = await owner.client.request(`/api/users/search?q=${encodeURIComponent(friend.name)}`);
  check("search finds a user by name", (friendSearch.body?.data?.users ?? []).some((u) => u.id === friend.id),
    JSON.stringify(friendSearch.body?.data?.users));

  const blockedSearch = await stranger.client.request(`/api/users/search?q=${encodeURIComponent(owner.name)}`);
  check(
    "search hides the person who blocked you",
    !(blockedSearch.body?.data?.users ?? []).some((u) => u.id === owner.id),
    JSON.stringify(blockedSearch.body?.data?.users),
  );

  const blockerSearch = await owner.client.request(`/api/users/search?q=${encodeURIComponent(stranger.name)}`);
  check(
    "search hides the person you blocked",
    !(blockerSearch.body?.data?.users ?? []).some((u) => u.id === stranger.id),
    JSON.stringify(blockerSearch.body?.data?.users),
  );

  // The other direction: a block the *stranger* owns must hide the owner from
  // the owner's own search just the same.
  await setPrivacy(stranger.client, "PUBLIC", [], [owner.id]);
  const reverseSearch = await owner.client.request(`/api/users/search?q=${encodeURIComponent(stranger.name)}`);
  check(
    "search hides someone who blocked you from their side too",
    !(reverseSearch.body?.data?.users ?? []).some((u) => u.id === stranger.id),
    JSON.stringify(reverseSearch.body?.data?.users),
  );

  const emptySearch = await owner.client.request("/api/users/search");
  check("an empty query still offers a usable default list", (emptySearch.body?.data?.users ?? []).length > 0,
    JSON.stringify(emptySearch.body?.data?.users?.length));
  check("the default list is small", (emptySearch.body?.data?.users ?? []).length <= 8);
  check(
    "the default list never contains the caller",
    !(emptySearch.body?.data?.users ?? []).some((u) => u.id === owner.id),
  );
  const longQuery = await owner.client.request(`/api/users/search?q=${"x".repeat(120)}`);
  check("an over-long query -> 400", longQuery.status === 400, `got ${longQuery.status}`);

  // -------------------------------------------------------------- guards
  console.log("\n— authentication and validation guards");

  const anonFriends = await anonymous.request("/api/friends");
  check("GET /api/friends without a session -> 401", anonFriends.status === 401, `got ${anonFriends.status}`);
  const anonSend = await anonymous.request("/api/friends", { method: "POST", body: { userId: owner.id } });
  check("POST /api/friends without a session -> 401", anonSend.status === 401, `got ${anonSend.status}`);
  const anonPrivacy = await anonymous.request("/api/users/me/privacy");
  check("GET privacy without a session -> 401", anonPrivacy.status === 401, `got ${anonPrivacy.status}`);
  const anonSearch = await anonymous.request("/api/users/search?q=a");
  check("GET /api/users/search without a session -> 401", anonSearch.status === 401, `got ${anonSearch.status}`);
  const anonPrivacyPut = await anonymous.request("/api/users/me/privacy", {
    method: "PUT",
    body: { visibility: "PUBLIC", allow: [], deny: [] },
  });
  check("PUT privacy without a session -> 401", anonPrivacyPut.status === 401, `got ${anonPrivacyPut.status}`);

  const badVisibility = await owner.client.request("/api/users/me/privacy", {
    method: "PUT",
    body: { visibility: "EVERYONE", allow: [], deny: [] },
  });
  check("an unknown visibility mode -> 400", badVisibility.status === 400, `got ${badVisibility.status}`);
  const badBody = await owner.client.request("/api/users/me/privacy", {
    method: "PUT",
    body: { visibility: "PUBLIC", allow: [123], deny: [] },
  });
  check("a non-string id in a list -> 400", badBody.status === 400, `got ${badBody.status}`);
  const badSend = await owner.client.request("/api/friends", { method: "POST", body: {} });
  check("a friend request with no target -> 400", badSend.status === 400, `got ${badSend.status}`);

  const demoFriends = await demo.request("/api/friends");
  check("the demo account can read its own friends payload",
    demoFriends.status === 200 &&
      Array.isArray(demoFriends.body?.data?.friends) &&
      Array.isArray(demoFriends.body?.data?.incoming) &&
      Array.isArray(demoFriends.body?.data?.outgoing));

  // ------------------------------------------------------------- cleanup
  console.log("\n— cleanup (remove the throwaway accounts)");

  await db.query(`delete from "User" where email = any($1::text[])`, [emails]);
  const leftover = await db.query(`select count(*)::int as n from "User" where email = any($1::text[])`, [emails]);
  check("every throwaway account was deleted", leftover.rows[0]?.n === 0, `left ${leftover.rows[0]?.n}`);
  const orphans = await db.query(
    `select
       (select count(*)::int from "Friendship" where "requesterId" = any($1::text[]) or "addresseeId" = any($1::text[])) as friendships,
       (select count(*)::int from "ProfileAccess" where "ownerId" = any($1::text[]) or "viewerId" = any($1::text[])) as access`,
    [[owner.id, friend.id, stranger.id]],
  );
  check(
    "their friendships and access rows cascaded away",
    orphans.rows[0]?.friendships === 0 && orphans.rows[0]?.access === 0,
    JSON.stringify(orphans.rows[0]),
  );

  console.log(`\n${"=".repeat(64)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  console.log("=".repeat(64));
}

try {
  await main();
} catch (error) {
  console.error("\nsmoke-social crashed:", error);
  await db.query(`delete from "User" where email = any($1::text[])`, [emails]).catch(() => {});
  await db.end().catch(() => {});
  process.exit(1);
}

await db.end();
process.exit(failed > 0 ? 1 : 0);
