/**
 * Community forum: boards, posts and replies.
 *
 * Two things shape this module:
 *
 *  1. **Reading is public, writing is not.** Every read takes an optional
 *     `viewerId`; it is only ever used to answer "is this mine?", which the UI
 *     needs to offer a delete button. It is never a filter and never a
 *     permission for reading.
 *
 *  2. **`Post.replyCount` is denormalised on purpose.** Board and post lists
 *     show a reply count on every row, and the "most replies" sort orders by it;
 *     computing it with a `_count` aggregate per row would turn one list query
 *     into a join-and-group over the whole `Reply` table. The cost of that
 *     denormalisation is that the counter can drift from the actual rows — so
 *     every write keeps the two in step inside a single transaction (see
 *     `createReply` / `deleteReply`), and replies are never inserted or removed
 *     anywhere else. `scripts/smoke-forum.mjs` asserts the counter equals the
 *     real number of rows after both an add and a delete, which is what keeps
 *     this honest.
 */
import { prisma } from "../lib/db";
import { badRequest, forbidden, notFound } from "../lib/http";
import { findCity } from "../lib/cities";
import { notify } from "./notification.service";
import type {
  BoardDto,
  ForumSortValue,
  PostDetailDto,
  PostSummaryDto,
  ReplyDto,
} from "../types";

/** A guard rail for the demo: no pagination UI, but never an unbounded read. */
const MAX_POSTS = 200;

const MAX_TITLE = 120;
const MAX_BODY = 5000;
const MAX_REPLY = 2000;
const EXCERPT_LENGTH = 160;

export type ListPostsInput = {
  /** Board slug, or undefined / "all" for every board. */
  board?: string | null;
  sort: ForumSortValue;
  q?: string | null;
  city?: string | null;
  /** The "我的帖子" filter. Requires a viewer; false without one. */
  mine?: boolean;
  viewerId: string | null;
};

/** First ~160 characters of a body, with newlines collapsed for a list card. */
function buildExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat;
}

/**
 * A post body is authored text, and the way it is read *is* sequential — so it is
 * trimmed rather than reflowed. `null` characters are the one thing stripped:
 * they are invisible in the UI but survive into logs and JSON.
 */
function cleanBody(body: string): string {
  return body.replace(/\u0000/g, "").trim();
}

const authorOf = (user: { id: string; name: string; avatar: string | null }) => ({
  id: user.id,
  name: user.name,
  avatar: user.avatar,
});

/**
 * Everything a list row needs, plus `authorId` so the caller can compute
 * `isMine` without a second lookup.
 */
const postSelect = {
  id: true,
  boardId: true,
  authorId: true,
  title: true,
  body: true,
  city: true,
  image: true,
  pinned: true,
  replyCount: true,
  createdAt: true,
  updatedAt: true,
  board: { select: { slug: true, name: true } },
  author: { select: { id: true, name: true, avatar: true } },
} as const;

type PostRow = {
  id: string;
  boardId: string;
  authorId: string;
  title: string;
  body: string;
  city: string | null;
  image: string | null;
  pinned: boolean;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
  board: { slug: string; name: string };
  author: { id: string; name: string; avatar: string | null };
};

function toSummary(post: PostRow, viewerId: string | null): PostSummaryDto {
  return {
    id: post.id,
    boardSlug: post.board.slug,
    title: post.title,
    excerpt: buildExcerpt(post.body),
    city: post.city,
    image: post.image,
    pinned: post.pinned,
    replyCount: post.replyCount,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    author: authorOf(post.author),
    isMine: viewerId !== null && post.authorId === viewerId,
  };
}

function toDetail(post: PostRow, viewerId: string | null): PostDetailDto {
  return {
    ...toSummary(post, viewerId),
    body: post.body,
    // The authored Chinese board name — the UI localises it from `Board.nameI18n`
    // via the board list it already holds, so the API keeps handing out the
    // source of truth the Agent reads.
    boardName: post.board.name,
  };
}

/**
 * Every board with its post count and its latest activity.
 *
 * "Latest activity" is the newest of the board's posts *and* its replies: a
 * question answered five minutes ago is more alive than one posted an hour ago
 * with no answer, and that difference is the entire point of the "最新回复" sort.
 *
 * Two grouped reads rather than a per-board aggregate: the counts come from
 * `Post` (one row per post, `body` excluded) and the reply times from a
 * `groupBy` over `Reply`. Both are scoped to `boardId`, so the work is
 * proportional to the boards on screen rather than to every reply in the database.
 */
export async function listBoards(): Promise<BoardDto[]> {
  const boards = await prisma.board.findMany({ orderBy: [{ position: "asc" }, { slug: "asc" }] });
  if (boards.length === 0) return [];

  const boardIds = boards.map((board) => board.id);

  const [postStats, replyStats] = await Promise.all([
    prisma.post.findMany({
      where: { boardId: { in: boardIds } },
      select: { boardId: true, createdAt: true },
    }),
    prisma.reply.groupBy({
      by: ["postId"],
      where: { post: { boardId: { in: boardIds } } },
      _max: { createdAt: true },
    }),
  ]);

  // Replies are grouped by post; map post -> board to attribute them to a board.
  const postBoard = await prisma.post.findMany({
    where: { id: { in: replyStats.map((row) => row.postId) } },
    select: { id: true, boardId: true },
  });
  const boardByPostId = new Map(postBoard.map((post) => [post.id, post.boardId]));

  const countByBoard = new Map<string, number>();
  const postTimeByBoard = new Map<string, Date>();
  const replyTimeByBoard = new Map<string, Date>();

  for (const post of postStats) {
    countByBoard.set(post.boardId, (countByBoard.get(post.boardId) ?? 0) + 1);
    const seen = postTimeByBoard.get(post.boardId);
    if (!seen || post.createdAt > seen) postTimeByBoard.set(post.boardId, post.createdAt);
  }

  for (const row of replyStats) {
    const latest = row._max.createdAt;
    const boardId = boardByPostId.get(row.postId);
    if (!latest || !boardId) continue;
    const seen = replyTimeByBoard.get(boardId);
    if (!seen || latest > seen) replyTimeByBoard.set(boardId, latest);
  }

  return boards.map((board) => {
    const postAt = postTimeByBoard.get(board.id);
    const replyAt = replyTimeByBoard.get(board.id);
    const latest = [postAt, replyAt].filter((value): value is Date => Boolean(value));
    latest.sort((a, b) => b.getTime() - a.getTime());

    return {
      id: board.id,
      slug: board.slug,
      name: board.name,
      description: board.description,
      nameI18n: (board.nameI18n as Record<string, string> | null) ?? null,
      descriptionI18n: (board.descriptionI18n as Record<string, string> | null) ?? null,
      icon: board.icon,
      emoji: board.emoji,
      position: board.position,
      postCount: countByBoard.get(board.id) ?? 0,
      latestAt: latest[0]?.toISOString() ?? null,
    };
  });
}

/**
 * Filtered + sorted post list.
 *
 * Sorting is done in memory, not in SQL, for one reason: `latest` orders by the
 * newest of two columns on two tables, and `pinned` has to lead in every order.
 * Expressing that in Prisma's `orderBy` means a correlated subquery per row;
 * over the `MAX_POSTS` window this repository actually serves, sorting the
 * fetched rows is both simpler and honest about what it costs.
 */
export async function listPosts(
  input: ListPostsInput,
): Promise<{ posts: PostSummaryDto[]; total: number }> {
  const { sort, viewerId } = input;
  const q = input.q?.trim() ?? "";
  const board = input.board?.trim() ?? "";
  const useBoardFilter = board.length > 0 && board !== "all";

  // "My posts" without a session can only ever be empty — never "everyone's".
  if (input.mine && !viewerId) return { posts: [], total: 0 };

  const where = {
    ...(useBoardFilter ? { board: { slug: board } } : {}),
    ...(input.city ? { city: input.city } : {}),
    ...(input.mine && viewerId ? { authorId: viewerId } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { body: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: postSelect,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: MAX_POSTS,
    }),
    prisma.post.count({ where }),
  ]);

  const replies =
    rows.length > 0
      ? await prisma.reply.groupBy({
          by: ["postId"],
          where: { postId: { in: rows.map((row) => row.id) } },
          _max: { createdAt: true },
        })
      : [];
  const lastReplyAt = new Map(
    replies.map((row) => [row.postId, row._max.createdAt?.getTime() ?? 0]),
  );

  const ordered = [...rows].sort((a, b) => {
    // Pinned posts lead within their board, whatever the sort.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

    if (sort === "new") return b.createdAt.getTime() - a.createdAt.getTime();
    if (sort === "popular") {
      if (b.replyCount !== a.replyCount) return b.replyCount - a.replyCount;
      return b.createdAt.getTime() - a.createdAt.getTime();
    }

    // "latest" — activity, not authorship.
    const aActivity = Math.max(a.createdAt.getTime(), lastReplyAt.get(a.id) ?? 0);
    const bActivity = Math.max(b.createdAt.getTime(), lastReplyAt.get(b.id) ?? 0);
    if (bActivity !== aActivity) return bActivity - aActivity;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return { posts: ordered.map((post) => toSummary(post, viewerId)), total };
}

/** One post with its replies, oldest first so the thread reads top to bottom. */
export async function getPost(
  id: string,
  viewerId: string | null,
): Promise<{ post: PostDetailDto; replies: ReplyDto[] }> {
  const post = await prisma.post.findUnique({ where: { id }, select: postSelect });
  if (!post) throw notFound("帖子不存在或已被删除");

  const replies = await prisma.reply.findMany({
    where: { postId: id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      postId: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: { id: true, name: true, avatar: true } },
    },
  });

  return {
    post: toDetail(post, viewerId),
    replies: replies.map((reply) => ({
      id: reply.id,
      postId: reply.postId,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      author: authorOf(reply.author),
      isMine: viewerId !== null && reply.authorId === viewerId,
    })),
  };
}

export type CreatePostInput = {
  boardSlug: string;
  title: string;
  body: string;
  city?: string | null;
};

/**
 * Publish a post.
 *
 * The author is always the session user (the route passes `requireUser()`'s id),
 * never anything from the request body — so a client cannot post as someone else.
 */
export async function createPost(
  authorId: string,
  input: CreatePostInput,
): Promise<PostDetailDto> {
  const boardSlug = input.boardSlug?.trim() ?? "";
  const board = boardSlug
    ? await prisma.board.findUnique({ where: { slug: boardSlug }, select: { id: true } })
    : null;
  // An unknown slug is a client bug, not a missing resource: 400 says "your
  // request names a board that does not exist", which is actionable.
  if (!board) throw badRequest("板块不存在");

  const title = input.title?.trim() ?? "";
  if (title.length === 0) throw badRequest("标题不能为空");
  if (title.length > MAX_TITLE) throw badRequest(`标题不能超过 ${MAX_TITLE} 个字`);

  const body = cleanBody(input.body ?? "");
  if (body.length === 0) throw badRequest("正文不能为空");
  if (body.length > MAX_BODY) throw badRequest(`正文不能超过 ${MAX_BODY} 个字`);

  // City input is free text ("东京", "tokyo", "东京都涩谷区"); storage is the
  // canonical English name so `Post.city` stays indexable and matchable against
  // `Listing.city`. Unresolvable text is dropped rather than stored verbatim: a
  // typo would otherwise create a city value nothing else in the app can join on.
  const city = findCity(input.city)?.name ?? null;

  const created = await prisma.post.create({
    data: { boardId: board.id, authorId, title, body, city },
    select: postSelect,
  });

  return toDetail(created, authorId);
}

/**
 * Add a reply and keep `Post.replyCount` in step.
 *
 * The insert and the `increment` share one transaction, so there is no window in
 * which the row exists and the counter does not. `increment` (rather than
 * "count the rows and write that number") is what makes two simultaneous replies
 * safe: it is a single `UPDATE ... SET "replyCount" = "replyCount" + 1` in the
 * database, so the two updates serialise instead of one overwriting the other.
 */
export async function createReply(
  authorId: string,
  postId: string,
  body: string,
): Promise<{ reply: ReplyDto; replyCount: number }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    // `authorId` and `title` are for the notification: the author needs telling,
    // and the copy quotes the thread.
    select: { id: true, authorId: true, title: true },
  });
  if (!post) throw notFound("帖子不存在或已被删除");

  const text = cleanBody(body);
  if (text.length === 0) throw badRequest("回复不能为空");
  if (text.length > MAX_REPLY) throw badRequest(`回复不能超过 ${MAX_REPLY} 个字`);

  const result = await prisma.$transaction(async (tx) => {
    const reply = await tx.reply.create({
      data: { postId, authorId, body: text },
      select: {
        id: true,
        postId: true,
        body: true,
        createdAt: true,
        authorId: true,
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    const updated = await tx.post.update({
      where: { id: postId },
      data: { replyCount: { increment: 1 } },
      select: { replyCount: true },
    });

    return {
      reply: {
        id: reply.id,
        postId: reply.postId,
        body: reply.body,
        createdAt: reply.createdAt.toISOString(),
        author: authorOf(reply.author),
        isMine: reply.authorId === authorId,
      },
      replyCount: updated.replyCount,
    };
  });

  /*
   * Notified *after* the transaction commits, not inside it.
   *
   * `notify` writes on its own connection, so calling it inside the callback would
   * have it racing the open transaction; and a notification about a reply that got
   * rolled back would be a lie. `notify` handles "you replied to yourself" and the
   * recipient's mutes, and never throws.
   */
  await notify({
    recipientId: post.authorId,
    type: "POST_REPLY",
    actorId: authorId,
    href: `/forum/${postId}`,
    meta: { postTitle: post.title },
  });

  return result;
}

/** Delete a post. Only its author may; the replies go with it (`onDelete: Cascade`). */
export async function deletePost(userId: string, id: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
  if (!post) throw notFound("帖子不存在或已被删除");
  if (post.authorId !== userId) throw forbidden("只能删除自己发布的帖子");

  // No counter bookkeeping here: the replies are cascade-deleted along with the
  // post, so there is no surviving row for `replyCount` to describe. Cleaning up
  // a counter on a row that is being removed in the same statement would be a
  // second write that can only ever disagree with the first.
  await prisma.post.delete({ where: { id } });
}

/** Delete a reply. Only its author may; the post's counter goes down with it. */
export async function deleteReply(userId: string, id: string): Promise<void> {
  const reply = await prisma.reply.findUnique({
    where: { id },
    select: { id: true, authorId: true, postId: true },
  });
  if (!reply) throw notFound("回复不存在或已被删除");
  if (reply.authorId !== userId) throw forbidden("只能删除自己的回复");

  await prisma.$transaction(async (tx) => {
    // Lock the post first. Two replies on the same post being deleted at once
    // would otherwise read the same counter value and one of the two updates
    // would be lost; `FOR UPDATE` serialises them. It also means the row cannot
    // disappear between the delete and the update below.
    const locked = await tx.$queryRaw<Array<{ id: string; replyCount: number }>>`
      SELECT "id", "replyCount" FROM "Post" WHERE "id" = ${reply.postId} FOR UPDATE
    `;
    const current = locked[0];
    // The post is already gone (its replies went with it): nothing left to count.
    if (!current) return;

    await tx.reply.delete({ where: { id } });

    // The counter is denormalised, so removal must be the exact inverse of
    // insertion. `max(0, …)` only matters if the column was already wrong — a
    // hand-edited row — and a list showing "-1 条回复" would be worse than a
    // counter that is merely stale.
    await tx.post.update({
      where: { id: reply.postId },
      data: { replyCount: Math.max(0, current.replyCount - 1) },
    });
  });
}
