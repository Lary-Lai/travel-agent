#!/usr/bin/env node
/**
 * Forum API integration test.
 *
 *     node scripts/smoke-forum.mjs [baseUrl]
 *
 * Exercises the real HTTP API against the real database, and it deliberately
 * targets the parts of the design that are easy to get quietly wrong:
 *
 *  - reading the forum is public, writing is not;
 *  - `Post.replyCount` is a denormalised counter, so it is asserted against the
 *    *actual* number of reply rows after adding and after deleting;
 *  - the three sorts are asserted against timestamps and counts that this script
 *    controls (it backdates its own posts directly in the database), because a
 *    sort that happens to look right on seed data proves nothing;
 *  - ownership: deleting someone else's post is a 403, not a silent success.
 *
 * Everything it creates is deleted again through the API at the end, so a run
 * leaves no test posts in the demo data.
 */
import pg from "pg";

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
        cookie = setCookie.map((entry) => entry.split(";")[0]).join("; ");
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

/**
 * Direct database access, used for exactly one thing: backdating a post so the
 * sort order under test is determined by this script rather than by whatever the
 * seed happened to create. Everything else goes through the API.
 */
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55432,
  user: "postgres",
  password: "postgres",
  database: "travel_agent",
});

const backdatePost = (postId, days) =>
  db.query(
    `update "Post" set "createdAt" = now() - ($2 || ' days')::interval where id = $1`,
    [postId, String(days)],
  );

/** Every post this run creates carries this marker, so cleanup can be verified. */
const MARKER = `[smoke-forum ${Date.now()}]`;

/**
 * Posts this run created, tracked at module scope so the safety net below can
 * clean up even when the run dies half-way through (a thrown fetch, a `pg` error,
 * or an interrupted process). A failed run must not leave demo posts behind —
 * that is exactly the debris that makes the *next* run's counts confusing.
 */
const createdPostIds = [];

/**
 * Last-resort cleanup: deleting a post cascades its replies, so this is the whole
 * job. It runs on the crash path only; the happy path deletes through the API and
 * asserts that it worked.
 */
async function emergencyCleanup() {
  if (createdPostIds.length === 0) return;
  const client = createClient();
  await client.request("/api/auth/login", {
    method: "POST",
    body: { email: "demo@travel-agent.dev", password: "Demo1234" },
  });
  for (const id of createdPostIds) {
    await client.request(`/api/forum/posts/${id}`, { method: "DELETE" }).catch(() => {});
  }
  console.error(`\nsmoke-forum: removed ${createdPostIds.length} test post(s) after an unclean exit`);
}

/** The suite proper. */
async function main() {
  console.log(`\nForum API test against ${BASE}\n`);
  await db.connect();

  /** Reply ids this run created, so a stray one can be traced if a check fails. */
  const createdReplyIds = [];

  // ---------------------------------------------------------------- boards
  console.log("— boards");

  const anon = createClient();
  const boardsResponse = await anon.request("/api/forum/boards");
  check("GET /api/forum/boards is public -> 200", boardsResponse.status === 200, `got ${boardsResponse.status}`);

  const boards = boardsResponse.body?.data?.boards ?? [];
  check("the seeded boards are listed", boards.length >= 7, `got ${boards.length}`);

  const positions = boards.map((board) => board.position);
  check(
    "boards come back ordered by position",
    positions.every((value, index) => index === 0 || positions[index - 1] <= value),
    positions.join(","),
  );

  const expectedSlugs = ["ski", "beach", "city", "food", "outdoors", "budget", "companions"];
  check(
    "the seven documented board slugs exist",
    expectedSlugs.every((slug) => boards.some((board) => board.slug === slug)),
    boards.map((board) => board.slug).join(","),
  );

  const sampleBoard = boards.find((board) => board.slug === "ski");
  check("a board carries its Chinese name and description", Boolean(sampleBoard?.name && sampleBoard?.description));
  check(
    "a board carries per-locale overrides, including the 5 generated locales",
    ["zh-TW", "en", "ja", "ko", "es"].every((locale) => Boolean(sampleBoard?.nameI18n?.[locale])),
    Object.keys(sampleBoard?.nameI18n ?? {}).join(","),
  );
  check("a board carries an emoji", Boolean(sampleBoard?.emoji), sampleBoard?.emoji);
  check(
    "a seeded board reports a non-zero post count",
    (sampleBoard?.postCount ?? 0) > 0,
    `got ${sampleBoard?.postCount}`,
  );
  check(
    "a board with posts reports latest activity",
    typeof sampleBoard?.latestAt === "string" && !Number.isNaN(Date.parse(sampleBoard.latestAt)),
    String(sampleBoard?.latestAt),
  );
  check(
    "latest activity is never older than the board's newest post",
    boards.every((board) => board.latestAt === null || Number.isFinite(Date.parse(board.latestAt))),
  );

  // ------------------------------------------------- reading is public
  console.log("\n— reading is public, writing is not");

  const publicList = await anon.request("/api/forum/posts?sort=latest");
  check("GET /api/forum/posts works signed out -> 200", publicList.status === 200, `got ${publicList.status}`);
  check(
    "the signed-out list has posts",
    (publicList.body?.data?.posts ?? []).length > 0,
    `got ${publicList.body?.data?.posts?.length}`,
  );
  check(
    "a list row carries an excerpt",
    (publicList.body?.data?.posts ?? []).every((post) => typeof post.excerpt === "string"),
  );
  check(
    "excerpts are collapsed to one line and capped",
    (publicList.body?.data?.posts ?? []).every(
      (post) => post.excerpt.length <= 161 && !/[\r\n]/.test(post.excerpt),
    ),
  );
  check(
    "a signed-out viewer owns nothing",
    (publicList.body?.data?.posts ?? []).every((post) => post.isMine === false),
  );

  const seededPost = (publicList.body?.data?.posts ?? []).find((post) => post.boardSlug === "ski");
  const seededDetail = await anon.request(`/api/forum/posts/${seededPost.id}`);
  check("GET a post detail works signed out -> 200", seededDetail.status === 200, `got ${seededDetail.status}`);
  check("the detail carries the full body", seededDetail.body?.data?.post?.body?.length > 0);
  check(
    "the detail's boardName is the authored Chinese board name",
    seededDetail.body?.data?.post?.boardName === "滑雪旅行",
    seededDetail.body?.data?.post?.boardName,
  );
  check(
    "the detail lists replies in ascending time order",
    (seededDetail.body?.data?.replies ?? []).every((reply, index, all) =>
      index === 0 ? true : Date.parse(all[index - 1].createdAt) <= Date.parse(reply.createdAt),
    ),
  );
  check(
    "the seeded replyCount matches the reply rows",
    seededDetail.body?.data?.post?.replyCount === (seededDetail.body?.data?.replies ?? []).length,
    `${seededDetail.body?.data?.post?.replyCount} vs ${seededDetail.body?.data?.replies?.length}`,
  );

  const anonCreate = await anon.request("/api/forum/posts", {
    method: "POST",
    body: { boardSlug: "ski", title: "signed out", body: "should not be allowed" },
  });
  check("creating a post signed out -> 401", anonCreate.status === 401, `got ${anonCreate.status}`);

  const anonReply = await anon.request(`/api/forum/posts/${seededPost.id}/replies`, {
    method: "POST",
    body: { body: "signed out reply" },
  });
  check("replying signed out -> 401", anonReply.status === 401, `got ${anonReply.status}`);

  const anonDelete = await anon.request(`/api/forum/posts/${seededPost.id}`, { method: "DELETE" });
  check("deleting signed out -> 401", anonDelete.status === 401, `got ${anonDelete.status}`);

  const unknownPost = await anon.request("/api/forum/posts/does-not-exist-at-all");
  check("an unknown post -> 404", unknownPost.status === 404, `got ${unknownPost.status}`);

  // -------------------------------------------------------------- sessions
  console.log("\n— sessions");

  const alice = createClient();
  const login = await alice.request("/api/auth/login", {
    method: "POST",
    body: { email: "demo@travel-agent.dev", password: "Demo1234" },
  });
  check("demo login -> 200", login.status === 200, `got ${login.status}`);

  const bob = createClient();
  const bobEmail = `forum-smoke-${Date.now()}@example.com`;
  const register = await bob.request("/api/auth/register", {
    method: "POST",
    body: { name: "论坛测试乙", email: bobEmail, password: "SmokeTest123" },
  });
  check("a second account registers -> 201", register.status === 201, `got ${register.status}`);

  // ------------------------------------------------------------ creating
  console.log("\n— creating posts");

  const created = await alice.request("/api/forum/posts", {
    method: "POST",
    body: {
      boardSlug: "ski",
      title: `${MARKER} 北海道雪场选择`,
      body: "第一行：这条帖子由 smoke-forum 创建。\n第二行：用来验证排序、筛选与回复计数。",
      city: "东京",
    },
  });
  check("creating a post -> 201", created.status === 201, `got ${created.status}`);
  const post = created.body?.data?.post;
  if (post?.id) createdPostIds.push(post.id);
  check("the created post is returned as a detail DTO", Boolean(post?.id && typeof post?.body === "string"));
  check("the author is the session user", post?.author?.email === undefined && Boolean(post?.author?.id));
  check("a new post is mine", post?.isMine === true);
  check("a new post starts with no replies", post?.replyCount === 0, `got ${post?.replyCount}`);
  check(
    "the Chinese city input is normalised to the canonical English name",
    post?.city === "Tokyo",
    post?.city,
  );
  check("the board name is filled in", post?.boardName === "滑雪旅行", post?.boardName);

  const inBoard = await anon.request("/api/forum/posts?board=ski&sort=new");
  check(
    "the new post appears in its board's list",
    (inBoard.body?.data?.posts ?? []).some((row) => row.id === post.id),
  );
  const otherBoard = await anon.request("/api/forum/posts?board=beach&sort=new");
  check(
    "and not in another board's list",
    !(otherBoard.body?.data?.posts ?? []).some((row) => row.id === post.id),
  );

  const detail = await anon.request(`/api/forum/posts/${post.id}`);
  check("the detail endpoint returns it", detail.status === 200 && detail.body?.data?.post?.id === post.id);
  check("the detail preserves the body's line breaks", detail.body?.data?.post?.body?.includes("\n"));

  const mineList = await alice.request("/api/forum/posts?mine=1&sort=new");
  check(
    "mine=1 includes the post I just wrote",
    (mineList.body?.data?.posts ?? []).some((row) => row.id === post.id),
  );
  check(
    "mine=1 marks my rows as mine",
    (mineList.body?.data?.posts ?? []).length > 0 &&
      (mineList.body?.data?.posts ?? []).every((row) => row.isMine === true),
  );
  const anonMine = await anon.request("/api/forum/posts?mine=1");
  check(
    "mine=1 signed out returns nothing rather than everything",
    (anonMine.body?.data?.posts ?? []).length === 0,
    `got ${anonMine.body?.data?.posts?.length}`,
  );

  // ------------------------------------------------------------ validating
  console.log("\n— validation");

  const unknownBoard = await alice.request("/api/forum/posts", {
    method: "POST",
    body: { boardSlug: "no-such-board", title: "x", body: "y" },
  });
  check("an unknown board slug -> 400", unknownBoard.status === 400, `got ${unknownBoard.status}`);

  const emptyTitle = await alice.request("/api/forum/posts", {
    method: "POST",
    body: { boardSlug: "ski", title: "   ", body: "有正文但没有标题" },
  });
  check("an empty title -> 400", emptyTitle.status === 400, `got ${emptyTitle.status}`);

  const emptyBody = await alice.request("/api/forum/posts", {
    method: "POST",
    body: { boardSlug: "ski", title: "有标题但没有正文", body: "  " },
  });
  check("an empty body -> 400", emptyBody.status === 400, `got ${emptyBody.status}`);

  const longTitle = await alice.request("/api/forum/posts", {
    method: "POST",
    body: { boardSlug: "ski", title: "标".repeat(121), body: "正文" },
  });
  check("a 121-character title -> 400", longTitle.status === 400, `got ${longTitle.status}`);

  const emptyReply = await alice.request(`/api/forum/posts/${post.id}/replies`, {
    method: "POST",
    body: { body: "   " },
  });
  check("an empty reply -> 400", emptyReply.status === 400, `got ${emptyReply.status}`);

  const longReply = await alice.request(`/api/forum/posts/${post.id}/replies`, {
    method: "POST",
    body: { body: "回".repeat(2001) },
  });
  check("a 2001-character reply -> 400", longReply.status === 400, `got ${longReply.status}`);

  const replyToUnknown = await alice.request("/api/forum/posts/does-not-exist/replies", {
    method: "POST",
    body: { body: "回复一个不存在的帖子" },
  });
  check("replying to an unknown post -> 404", replyToUnknown.status === 404, `got ${replyToUnknown.status}`);

  const unresolvableCity = await alice.request("/api/forum/posts", {
    method: "POST",
    body: { boardSlug: "ski", title: `${MARKER} 没有城市的帖子`, body: "城市填了无法识别的内容。" , city: "zzz-not-a-city" },
  });
  const noCityPost = unresolvableCity.body?.data?.post;
  if (noCityPost?.id) createdPostIds.push(noCityPost.id);
  check(
    "an unresolvable city is dropped rather than stored",
    unresolvableCity.status === 201 && noCityPost?.city === null,
    `${unresolvableCity.status} / ${noCityPost?.city}`,
  );

  // ---------------------------------------------------------------- replies
  console.log("\n— replies and the denormalised counter");

  const reply1 = await alice.request(`/api/forum/posts/${post.id}/replies`, {
    method: "POST",
    body: { body: "来自 smoke-forum 的第一条回复。" },
  });
  check("creating a reply -> 201", reply1.status === 201, `got ${reply1.status}`);
  const replyRow = reply1.body?.data?.reply;
  if (replyRow?.id) createdReplyIds.push(replyRow.id);
  check("the reply is returned", Boolean(replyRow?.id));
  check("the reply is mine", replyRow?.isMine === true);
  check("the response reports the new replyCount", reply1.body?.data?.replyCount === 1, `got ${reply1.body?.data?.replyCount}`);

  const reply2 = await alice.request(`/api/forum/posts/${post.id}/replies`, {
    method: "POST",
    body: { body: "来自 smoke-forum 的第二条回复。" },
  });
  if (reply2.body?.data?.reply?.id) createdReplyIds.push(reply2.body.data.reply.id);
  check("a second reply -> 201", reply2.status === 201, `got ${reply2.status}`);
  check("the counter is now 2", reply2.body?.data?.replyCount === 2, `got ${reply2.body?.data?.replyCount}`);

  const afterReplies = await anon.request(`/api/forum/posts/${post.id}`);
  check(
    "the detail lists both replies",
    (afterReplies.body?.data?.replies ?? []).length === 2,
    `got ${afterReplies.body?.data?.replies?.length}`,
  );
  check(
    "replyCount on the detail equals the reply rows",
    afterReplies.body?.data?.post?.replyCount === (afterReplies.body?.data?.replies ?? []).length,
    `${afterReplies.body?.data?.post?.replyCount} vs ${afterReplies.body?.data?.replies?.length}`,
  );

  const listAfterReplies = await anon.request("/api/forum/posts?board=ski&sort=new");
  const listedRow = (listAfterReplies.body?.data?.posts ?? []).find((row) => row.id === post.id);
  check(
    "replyCount in the LIST equals the reply rows",
    listedRow?.replyCount === (afterReplies.body?.data?.replies ?? []).length,
    `${listedRow?.replyCount} vs ${afterReplies.body?.data?.replies?.length}`,
  );

  // ...and after a delete, which is the half that is easy to forget.
  const deleteReply = await alice.request(`/api/forum/replies/${replyRow.id}`, { method: "DELETE" });
  check("deleting my own reply -> 200", deleteReply.status === 200, `got ${deleteReply.status}`);
  check("the response says deleted", deleteReply.body?.data?.deleted === true);

  const afterReplyDelete = await anon.request(`/api/forum/posts/${post.id}`);
  check(
    "the reply is gone from the thread",
    (afterReplyDelete.body?.data?.replies ?? []).length === 1,
    `got ${afterReplyDelete.body?.data?.replies?.length}`,
  );
  check(
    "replyCount was decremented with it",
    afterReplyDelete.body?.data?.post?.replyCount === 1,
    `got ${afterReplyDelete.body?.data?.post?.replyCount}`,
  );
  const listAfterReplyDelete = await anon.request("/api/forum/posts?board=ski&sort=new");
  check(
    "and the list row agrees",
    (listAfterReplyDelete.body?.data?.posts ?? []).find((row) => row.id === post.id)?.replyCount === 1,
  );

  const deleteReplyTwice = await alice.request(`/api/forum/replies/${replyRow.id}`, { method: "DELETE" });
  check("deleting the same reply twice -> 404", deleteReplyTwice.status === 404, `got ${deleteReplyTwice.status}`);

  const deleteForeignReply = await bob.request(`/api/forum/replies/${reply2.body.data.reply.id}`, {
    method: "DELETE",
  });
  check(
    "deleting someone else's reply -> 403",
    deleteForeignReply.status === 403,
    `got ${deleteForeignReply.status}`,
  );

  // ------------------------------------------------------------- ownership
  console.log("\n— ownership");

  const deleteForeignPost = await bob.request(`/api/forum/posts/${post.id}`, { method: "DELETE" });
  check(
    "deleting someone else's post -> 403",
    deleteForeignPost.status === 403,
    `got ${deleteForeignPost.status}`,
  );
  const stillThere = await anon.request(`/api/forum/posts/${post.id}`);
  check("and it is still there afterwards", stillThere.status === 200, `got ${stillThere.status}`);

  // ----------------------------------------------------------------- sorts
  console.log("\n— sorting");

  const boardsNow = (await anon.request("/api/forum/boards")).body?.data?.boards ?? [];
  /**
   * Run the sort assertions on the board with the *fewest* seeded posts.
   *
   * On a quiet board this script's three samples are the only rows, so the order
   * is entirely its own to assert rather than being mixed with seed data whose
   * relative ages the test cannot know. Pinned demo posts are excluded from the
   * "popular" comparison for the same reason: pinning is a deliberate override of
   * sort order, so a pinned row is not evidence about sorting at all.
   */
  const sortBoard = [...boardsNow].sort((a, b) => a.postCount - b.postCount)[0] ?? boardsNow[0];
  console.log(
    `  using board "${sortBoard.slug}" (${sortBoard.postCount} seeded posts) for the sort assertions`,
  );

  const sortPosts = [];
  for (const [index, days] of [9, 5, 1].entries()) {
    const response = await alice.request("/api/forum/posts", {
      method: "POST",
      body: {
        boardSlug: sortBoard.slug,
        title: `${MARKER} 排序样本 ${index + 1}`,
        body: `排序测试用帖子，编号 ${index + 1}。`,
      },
    });
    const row = response.body?.data?.post;
    if (!row?.id) continue;
    createdPostIds.push(row.id);
    await backdatePost(row.id, days);
    sortPosts.push(row);
  }
  check("three sort samples were created", sortPosts.length === 3, `got ${sortPosts.length}`);

  // Give the MIDDLE-by-age post a reply now, so "latest activity" and "newest
  // post" must disagree: activity is the newer post, authorship is sample 3.
  const activityReply = await alice.request(`/api/forum/posts/${sortPosts[1].id}/replies`, {
    method: "POST",
    body: { body: "刚刚回复，让这条帖子的最新活动时间变成现在。" },
  });
  if (activityReply.body?.data?.reply?.id) createdReplyIds.push(activityReply.body.data.reply.id);
  check("the activity reply landed", activityReply.status === 201, `got ${activityReply.status}`);

  const byNew = await anon.request(`/api/forum/posts?board=${sortBoard.slug}&sort=new`);
  const newIds = (byNew.body?.data?.posts ?? []).map((row) => row.id);
  const mineNew = newIds.filter((id) => sortPosts.some((sample) => sample.id === id));
  check(
    "sort=new orders by createdAt desc",
    JSON.stringify(mineNew) === JSON.stringify([sortPosts[2].id, sortPosts[1].id, sortPosts[0].id]),
    mineNew.join(","),
  );

  const byLatest = await anon.request(`/api/forum/posts?board=${sortBoard.slug}&sort=latest`);
  const latestPosts = byLatest.body?.data?.posts ?? [];
  const mineLatest = latestPosts.filter((row) => sortPosts.some((sample) => sample.id === row.id));
  check(
    "sort=latest puts the newest *activity* first, not the newest post",
    mineLatest[0]?.id === sortPosts[1].id,
    mineLatest.map((row) => row.id).join(","),
  );
  check(
    "and the newest post is therefore not first",
    mineLatest[0]?.id !== sortPosts[2].id,
    mineLatest[0]?.id,
  );

  const secondReply = await alice.request(`/api/forum/posts/${sortPosts[0].id}/replies`, {
    method: "POST",
    body: { body: "第二条活动回复，把样本 1 推到最前面。" },
  });
  if (secondReply.body?.data?.reply?.id) createdReplyIds.push(secondReply.body.data.reply.id);

  const byLatestAgain = await anon.request(`/api/forum/posts?board=${sortBoard.slug}&sort=latest`);
  const mineLatestAgain = (byLatestAgain.body?.data?.posts ?? []).filter((row) =>
    sortPosts.some((sample) => sample.id === row.id),
  );
  check(
    "a newer reply moves its post to the top of sort=latest",
    mineLatestAgain[0]?.id === sortPosts[0].id,
    mineLatestAgain.map((row) => row.id).join(","),
  );

  // Pinned posts lead whatever the sort.
  const pinnedIndex = latestPosts.findIndex((row) => row.pinned);
  const firstUnpinned = latestPosts.findIndex((row) => !row.pinned);
  check(
    "pinned posts come first in sort=latest",
    pinnedIndex === -1 || firstUnpinned === -1 || pinnedIndex < firstUnpinned,
    `pinned@${pinnedIndex} unpinned@${firstUnpinned}`,
  );

  const byPopular = await anon.request(`/api/forum/posts?board=${sortBoard.slug}&sort=popular`);
  const popularRows = (byPopular.body?.data?.posts ?? []).filter((row) => !row.pinned);
  check(
    "sort=popular orders by replyCount desc",
    popularRows.every((row, index) => index === 0 || popularRows[index - 1].replyCount >= row.replyCount),
    popularRows.map((row) => row.replyCount).join(","),
  );
  const popularMine = popularRows.filter((row) => sortPosts.some((sample) => sample.id === row.id));
  // The activity reply gave sample 2 one reply and the later reply gave sample 1
  // one reply, so the two must be ranked by that equal count and *not* by age:
  // the tie is broken on createdAt desc, which puts the newer sample 2 first.
  check(
    "sample 2 and sample 1 are ranked by their equal reply count, newest first",
    popularMine[0]?.id === sortPosts[1].id && popularMine[1]?.id === sortPosts[0].id,
    popularMine.map((row) => `${row.id === sortPosts[0].id ? "A" : row.id === sortPosts[1].id ? "B" : "C"}:${row.replyCount}`).join(","),
  );
  check(
    "the reply-less sample sorts last in sort=popular",
    popularRows[popularRows.length - 1]?.id === sortPosts[2].id,
    popularRows.map((row) => `${row.id === sortPosts[0].id ? "A" : row.id === sortPosts[1].id ? "B" : row.id === sortPosts[2].id ? "C" : "seed"}:${row.replyCount}`).join(","),
  );

  // --------------------------------------------------------------- filters
  console.log("\n— filters");

  const boardFiltered = await anon.request("/api/forum/posts?board=food&sort=new");
  check(
    "board= returns only that board",
    (boardFiltered.body?.data?.posts ?? []).every((row) => row.boardSlug === "food"),
  );
  check("board= returns something", (boardFiltered.body?.data?.posts ?? []).length > 0);

  const titleMatch = await anon.request(`/api/forum/posts?q=${encodeURIComponent(MARKER)}`);
  check(
    "q= matches on the title",
    (titleMatch.body?.data?.posts ?? []).some((row) => row.id === post.id),
    `got ${titleMatch.body?.data?.posts?.length}`,
  );

  const bodyNeedle = "用来验证排序、筛选与回复计数";
  const bodyMatch = await anon.request(`/api/forum/posts?q=${encodeURIComponent(bodyNeedle)}`);
  check(
    "q= matches on the body",
    (bodyMatch.body?.data?.posts ?? []).some((row) => row.id === post.id),
    `got ${bodyMatch.body?.data?.posts?.length}`,
  );

  const noMatch = await anon.request(`/api/forum/posts?q=${encodeURIComponent("zzz-definitely-no-such-text-zzz")}`);
  check("q= with no match returns an empty list", (noMatch.body?.data?.posts ?? []).length === 0);

  const cityFiltered = await anon.request("/api/forum/posts?city=Tokyo");
  check(
    "city= returns only that city",
    (cityFiltered.body?.data?.posts ?? []).every((row) => row.city === "Tokyo"),
  );
  check(
    "city= matches the canonical name stored by the API",
    (cityFiltered.body?.data?.posts ?? []).some((row) => row.id === post.id),
  );

  const mineFiltered = await alice.request(`/api/forum/posts?mine=1&q=${encodeURIComponent(MARKER)}`);
  check(
    "mine=1 combined with q= narrows to my posts",
    (mineFiltered.body?.data?.posts ?? []).length > 0 &&
      (mineFiltered.body?.data?.posts ?? []).every((row) => row.isMine),
  );

  const boardCounts = (await anon.request("/api/forum/boards")).body?.data?.boards ?? [];
  const countsMatch = await Promise.all(
    boardCounts.map(async (board) => {
      const list = await anon.request(`/api/forum/posts?board=${board.slug}`);
      return { slug: board.slug, board: board.postCount, list: list.body?.data?.total ?? -1 };
    }),
  );
  check(
    "each board's postCount equals its filtered total",
    countsMatch.every((entry) => entry.board === entry.list),
    countsMatch.map((entry) => `${entry.slug}:${entry.board}/${entry.list}`).join(" "),
  );

  // --------------------------------------------------------------- cleanup
  console.log("\n— cleanup");

  for (const id of createdPostIds) {
    await alice.request(`/api/forum/posts/${id}`, { method: "DELETE" });
  }

  let leftovers = 0;
  for (const id of createdPostIds) {
    const response = await anon.request(`/api/forum/posts/${id}`);
    if (response.status !== 404) leftovers++;
  }
  check("every post this run created is deleted", leftovers === 0, `${leftovers} still readable`);

  const afterCleanup = await anon.request(`/api/forum/posts?q=${encodeURIComponent(MARKER)}`);
  check(
    "no post with this run's marker remains",
    (afterCleanup.body?.data?.posts ?? []).length === 0,
    `got ${afterCleanup.body?.data?.posts?.length}`,
  );

  const orphanReplies = await db.query(
    `select count(*)::int as count from "Reply" where "postId" = any($1::text[])`,
    [createdPostIds],
  );
  check(
    "deleting a post cascaded its replies",
    orphanReplies.rows[0].count === 0,
    `${orphanReplies.rows[0].count} orphaned replies`,
  );

  const countersInSync = await db.query(
    `select count(*)::int as count from "Post" p
     where p."replyCount" <> (select count(*) from "Reply" r where r."postId" = p.id)`,
  );
  check(
    "the denormalised counter is in sync across the whole table",
    countersInSync.rows[0].count === 0,
    `${countersInSync.rows[0].count} posts disagree`,
  );

  const remaining = await db.query('select count(*)::int as count from "Post"');
  console.log(`\n  posts in the database after cleanup: ${remaining.rows[0].count}`);

  // ---------------------------------------------------------------- report
  console.log(`\n${"=".repeat(64)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  console.log("=".repeat(64));

  await db.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("\nsmoke-forum crashed:", error);
  await emergencyCleanup().catch(() => {});
  await db.end().catch(() => {});
  process.exit(1);
});

// A ^C must not leave test posts in the demo data either.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void emergencyCleanup().finally(() => process.exit(1));
  });
}