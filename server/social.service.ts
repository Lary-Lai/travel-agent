/**
 * Social graph: profile visibility, public profiles, friends.
 *
 * Two things make this module the single source of truth for "who may see what":
 *
 *  1. `resolveProfileAccess` is the ONLY place the visibility precedence is
 *     written down. Everything that shows or hides a profile goes through it, so
 *     there is exactly one rule to reason about (and one to test).
 *  2. Every friend mutation re-derives the caller's participation from the
 *     stored row. A friendship id arriving from the client is a *reference*, not
 *     an authorisation — the row itself decides whether the caller may act on it.
 */
import { prisma } from "../lib/db";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import { notify } from "./notification.service";
import type {
  FriendDto,
  FriendRelationValue,
  FriendsPayload,
  FriendshipStatusValue,
  ProfileAccessKindValue,
  ProfileAccessReason,
  ProfilePrivacyDto,
  ProfileVisibilityValue,
  PublicProfileDto,
  PublicUserBrief,
} from "../types";

/** Everything needed to render a person as a chip, an avatar row, or a link. */
const briefSelect = { id: true, name: true, avatar: true } as const;

type BriefRow = { id: string; name: string; avatar: string | null };

const toBrief = (row: BriefRow): PublicUserBrief => ({
  id: row.id,
  name: row.name,
  avatar: row.avatar,
});

/**
 * The most people either exception list may hold.
 *
 * A cap exists so a scripted client cannot store an unbounded list that every
 * profile read then has to hydrate.
 */
export const MAX_ACCESS_LIST = 200;

/** How many people the picker offers when nothing has been typed yet. */
const DEFAULT_PICKER_SIZE = 8;

/** Search results are capped so the picker stays a picker, not a directory dump. */
const SEARCH_LIMIT = 20;

// --------------------------------------------------------------- friendships

/**
 * The ACCEPTED friendship between two people, in either direction, or null.
 *
 * One row per pair (see the schema note), so this is a single lookup rather than
 * an "is it a or b that asked" reconciliation.
 */
export async function friendshipBetween(a: string, b: string) {
  if (a === b) return null;
  return prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

/**
 * How `viewerId` relates to `otherId`, plus the friendship row involved.
 *
 * `requestId` is returned for a pending request (so the UI can accept, decline
 * or cancel it in place) AND for an accepted friendship (so "remove friend" does
 * not need a second round-trip to find the row).
 */
export async function relationshipBetween(
  viewerId: string | null,
  otherId: string,
): Promise<{ relation: FriendRelationValue; requestId: string | null }> {
  if (!viewerId) return { relation: "NONE", requestId: null };
  if (viewerId === otherId) return { relation: "SELF", requestId: null };

  const rows = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: viewerId },
      ],
    },
    select: { id: true, requesterId: true, status: true },
  });

  const accepted = rows.find((row) => row.status === "ACCEPTED");
  if (accepted) return { relation: "FRIEND", requestId: accepted.id };

  const pending = rows.find((row) => row.status === "PENDING");
  if (pending) {
    return {
      relation: pending.requesterId === viewerId ? "REQUEST_SENT" : "REQUEST_RECEIVED",
      requestId: pending.id,
    };
  }

  return { relation: "NONE", requestId: null };
}

/** The denial reason that names the mode which actually blocked the viewer. */
function deniedReason(visibility: ProfileVisibilityValue): ProfileAccessReason {
  if (visibility === "FRIENDS") return "FRIENDS_ONLY";
  if (visibility === "SELECTED") return "SELECTED_ONLY";
  return "PRIVATE";
}

/**
 * Does this mode admit accepted friends on the strength of the friendship alone?
 *
 * PUBLIC and FRIENDS do; SELECTED does not. That split is the whole point of
 * having four modes: if friendship admitted under SELECTED too, SELECTED and
 * FRIENDS would both mean "friends ∪ allow-list" and two of the four options
 * would be behaviourally identical.
 */
function admitsFriends(visibility: ProfileVisibilityValue): boolean {
  return visibility === "PUBLIC" || visibility === "FRIENDS";
}

/**
 * The visibility rule, as a pure function of everything it depends on.
 *
 * PRECEDENCE (first match wins, and the order is the whole point):
 *
 *   1. the viewer is the owner                     -> SELF, may view
 *   2. nobody is signed in                         -> PUBLIC may view, otherwise
 *                                                    denied with the mode's reason
 *   3. a DENY row exists for this pair             -> DENIED. **DENY beats
 *                                                    everything below it**: an
 *                                                    explicit block is the only
 *                                                    way to keep someone out of a
 *                                                    PUBLIC profile, and "they
 *                                                    blocked me but I am on the
 *                                                    allow-list so I got in" is
 *                                                    a bug nobody can reason about.
 *   4. the mode is PRIVATE                         -> denied (PRIVATE). Nobody but
 *                                                    the owner: friends and ALLOW
 *                                                    rows do NOT admit here.
 *   5. an ALLOW row exists for this pair           -> ALLOWED
 *   6. accepted friendship, in a mode that admits
 *      friends (PUBLIC / FRIENDS)                  -> FRIEND
 *   7. the mode is PUBLIC                          -> PUBLIC
 *   8. the mode is FRIENDS                         -> denied (FRIENDS_ONLY)
 *   9. the mode is SELECTED                        -> denied (SELECTED_ONLY)
 *
 * What the four modes therefore mean — the same thing their four labels promise:
 *
 *   PUBLIC   everyone. The reason still names the relationship
 *            (FRIEND / ALLOWED / PUBLIC, or DENIED when blocked)
 *   FRIENDS  accepted friends, plus the allow-list
 *   SELECTED the allow-list only — a friend who is not listed is refused
 *   PRIVATE  nobody but the owner — friends and the allow-list included
 *
 * Steps 6/7 are also why a friend viewing a PUBLIC profile is reported as
 * FRIEND: that is the reason their access holds, and the one the UI can talk
 * about.
 *
 * Kept pure so the matrix can be reasoned about (and, in the smoke suite, driven
 * from the outside) without a database.
 */
export function decideProfileAccess(input: {
  ownerId: string;
  viewerId: string | null;
  visibility: ProfileVisibilityValue;
  /** The ALLOW / DENY row for this exact pair, if one exists. */
  accessKind: ProfileAccessKindValue | null;
  /** An ACCEPTED friendship between the two, in either direction. */
  isFriend: boolean;
}): { canView: boolean; access: ProfileAccessReason } {
  const { ownerId, viewerId, visibility, accessKind, isFriend } = input;

  // 1 — your own profile is always yours, including when it is PRIVATE.
  if (viewerId !== null && viewerId === ownerId) {
    return { canView: true, access: "SELF" };
  }

  // 2 — a signed-out visitor has no id, so no exception row can apply to them.
  if (viewerId === null) {
    return visibility === "PUBLIC"
      ? { canView: true, access: "PUBLIC" }
      : { canView: false, access: deniedReason(visibility) };
  }

  // 3 — blocks win over the allow-list, over friendship, and over every mode.
  if (accessKind === "DENY") return { canView: false, access: "DENIED" };

  // 4 — PRIVATE stops here: neither a friendship nor an ALLOW row admits anyone.
  if (visibility === "PRIVATE") return { canView: false, access: "PRIVATE" };

  // 5 — an explicit grant. This is how SELECTED admits someone, and it adds
  // someone to a FRIENDS or PUBLIC profile without changing the mode.
  if (accessKind === "ALLOW") return { canView: true, access: "ALLOWED" };

  // 6 — friendship alone admits under PUBLIC and FRIENDS, but never under
  // SELECTED (see admitsFriends).
  if (isFriend && admitsFriends(visibility)) {
    return { canView: true, access: "FRIEND" };
  }

  // 7 — the open mode.
  if (visibility === "PUBLIC") return { canView: true, access: "PUBLIC" };

  // 8 — friends-only, and this viewer is neither a friend nor listed.
  if (visibility === "FRIENDS") return { canView: false, access: "FRIENDS_ONLY" };

  // 9 — selected-only, and this viewer is not listed.
  return { canView: false, access: "SELECTED_ONLY" };
}

/**
 * Resolve the viewer's access to one profile.
 *
 * Reads the three inputs the rule needs (the owner's mode, the pair's exception
 * row, the pair's friendship) and hands them to `decideProfileAccess`. The
 * friendship lookup is skipped when the answer is already settled — a DENY row
 * decides on its own, PRIVATE mode refuses before friendship is consulted, and a
 * signed-out viewer has no pair at all.
 */
export async function resolveProfileAccess(
  ownerId: string,
  viewerId: string | null,
): Promise<{ canView: boolean; access: ProfileAccessReason }> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    // An unknown owner is treated as PRIVATE so the rule stays total; callers
    // that need a 404 ask for the user explicitly (see getPublicProfile).
    select: { profileVisibility: true },
  });

  const visibility: ProfileVisibilityValue = owner?.profileVisibility ?? "PRIVATE";

  // Cases 1 and 2 of the rule settle without touching the tables: the owner, and
  // a signed-out visitor (who has no pair, so no exception row can apply).
  if (viewerId === null || viewerId === ownerId) {
    return decideProfileAccess({ ownerId, viewerId, visibility, accessKind: null, isFriend: false });
  }

  const accessRow = await prisma.profileAccess.findUnique({
    where: { ownerId_viewerId: { ownerId, viewerId } },
    select: { kind: true },
  });

  const accessKind: ProfileAccessKindValue | null = accessRow?.kind ?? null;

  // Only ask about the friendship when it can still change the answer: a DENY
  // row refuses on its own, and PRIVATE mode refuses before friendship matters.
  const needsFriendship = accessKind === null && visibility !== "PRIVATE";
  const isFriend = needsFriendship ? Boolean(await friendshipBetween(viewerId, ownerId)) : false;

  return decideProfileAccess({ ownerId, viewerId, visibility, accessKind, isFriend });
}

// ----------------------------------------------------------- public profiles

const ownerSelect = {
  id: true,
  name: true,
  avatar: true,
  coverPreset: true,
  coverImage: true,
  tags: true,
  hobbies: true,
  dreamDestinations: true,
  visitedPlaces: true,
  createdAt: true,
  profileVisibility: true,
} as const;

const otherSide = (
  rows: Array<{ requesterId: string; addresseeId: string }>,
  userId: string,
): string[] => rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));

/** Friends shared by two people — the number the profile page shows. */
async function mutualFriendCount(viewerId: string, ownerId: string): Promise<number> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: viewerId },
        { addresseeId: viewerId },
        { requesterId: ownerId },
        { addresseeId: ownerId },
      ],
    },
    select: { requesterId: true, addresseeId: true },
  });

  const viewerFriends = new Set(otherSide(rows, viewerId));
  const ownerFriends = otherSide(rows, ownerId);

  return ownerFriends.filter((id) => viewerFriends.has(id)).length;
}

/**
 * One person's profile, as much of it as this viewer is allowed to have.
 *
 * `user` is always populated: you navigated to this person, so their name and
 * avatar are not the secret — the profile *contents* are. When `canView` is
 * false the caller still gets a usable DTO (`canView: false` plus the reason)
 * so the page can explain itself instead of 404-ing or rendering blank.
 */
export async function getPublicProfile(
  ownerId: string,
  viewerId: string | null,
): Promise<PublicProfileDto> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: ownerSelect,
  });

  // A genuinely unknown id is a 404; a hidden profile is not.
  if (!owner) throw notFound("该用户不存在");

  const [{ canView, access }, relationship] = await Promise.all([
    resolveProfileAccess(ownerId, viewerId),
    relationshipBetween(viewerId, ownerId),
  ]);

  const dto: PublicProfileDto = {
    user: toBrief(owner),
    visibility: owner.profileVisibility,
    canView,
    access,
    relation: relationship.relation,
    requestId: relationship.requestId,
    // Reported only to a viewer who may see the profile: "you have 3 friends in
    // common" is itself profile information, so a blocked or signed-out viewer
    // gets 0 rather than a hint about the owner's circle.
    mutualFriendCount: 0,
    profile: null,
    stats: null,
  };

  if (!canView) return dto;

  const [friendCount, postCount, mutual] = await Promise.all([
    prisma.friendship.count({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: ownerId }, { addresseeId: ownerId }],
      },
    }),
    prisma.post.count({ where: { authorId: ownerId } }),
    viewerId ? mutualFriendCount(viewerId, ownerId) : Promise.resolve(0),
  ]);

  return {
    ...dto,
    mutualFriendCount: mutual,
    profile: {
      coverPreset: owner.coverPreset,
      coverImage: owner.coverImage,
      tags: owner.tags,
      hobbies: owner.hobbies,
      dreamDestinations: owner.dreamDestinations,
      visitedPlaces: owner.visitedPlaces,
      joinedAt: owner.createdAt.toISOString(),
    },
    stats: { friends: friendCount, posts: postCount },
  };
}

// ----------------------------------------------------------- privacy settings

/** The owner's own visibility mode plus both hydrated exception lists. */
export async function getPrivacySettings(userId: string): Promise<ProfilePrivacyDto> {
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { profileVisibility: true },
    }),
    prisma.profileAccess.findMany({
      where: { ownerId: userId },
      select: { kind: true, viewer: { select: briefSelect } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!user) throw notFound("该用户不存在");

  return {
    visibility: user.profileVisibility,
    allow: rows.filter((row) => row.kind === "ALLOW").map((row) => toBrief(row.viewer)),
    deny: rows.filter((row) => row.kind === "DENY").map((row) => toBrief(row.viewer)),
  };
}

/**
 * Replace the owner's mode and both exception lists in one transaction.
 *
 * Two product decisions, both chosen so the UI never has to explain a surprise:
 *
 *  - **Yourself is silently dropped from either list.** "I blocked myself" is not
 *    a state anyone means, and the rule answers SELF before it ever looks at an
 *    exception row, so the id would be dead data. Rejecting a whole save over a
 *    stray id would be worse than ignoring it.
 *  - **An id on both lists is kept only on DENY.** The schema says an explicit
 *    block is the strongest signal, so storing both would leave two rows that
 *    disagree and a reader who cannot tell which one wins.
 *
 * Unknown ids (a deleted account, a typo) are dropped for the same reason as
 * yourself: the lists are a preference, not a referential-integrity document.
 */
export async function savePrivacySettings(
  userId: string,
  input: { visibility: ProfileVisibilityValue; allow: string[]; deny: string[] },
): Promise<ProfilePrivacyDto> {
  const clean = (ids: string[]) =>
    [...new Set(ids.map((id) => id.trim()).filter(Boolean))].filter((id) => id !== userId);

  const allowIds = clean(input.allow);
  const denyIds = clean(input.deny);
  const denied = new Set(denyIds);
  const allowOnly = allowIds.filter((id) => !denied.has(id));

  const requested = [...new Set([...allowOnly, ...denyIds])].slice(0, MAX_ACCESS_LIST * 2);

  const existing = await prisma.user.findMany({
    where: { id: { in: requested } },
    select: { id: true },
  });
  const known = new Set(existing.map((row) => row.id));

  const keep = (ids: string[]) => ids.filter((id) => known.has(id)).slice(0, MAX_ACCESS_LIST);
  const finalAllow = keep(allowOnly);
  const finalDeny = keep(denyIds);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { profileVisibility: input.visibility },
    });

    // Replace rather than merge: the client sends the complete lists, and a
    // merge would make "remove someone from the allow-list" impossible.
    await tx.profileAccess.deleteMany({ where: { ownerId: userId } });

    const rows = [
      ...finalAllow.map((viewerId) => ({ ownerId: userId, viewerId, kind: "ALLOW" as const })),
      ...finalDeny.map((viewerId) => ({ ownerId: userId, viewerId, kind: "DENY" as const })),
    ];
    if (rows.length > 0) await tx.profileAccess.createMany({ data: rows });
  });

  return getPrivacySettings(userId);
}

// ------------------------------------------------------------------- search

/**
 * The people picker: by name, excluding the caller and anyone on either side of
 * a block.
 *
 * Names only — never emails. A name is already public on any listing or post the
 * person authored, whereas a directory searchable by email would turn a
 * sign-in address into discoverable data.
 */
export async function searchUsers(
  viewerId: string,
  query: string,
): Promise<PublicUserBrief[]> {
  const term = query.trim().slice(0, 80);

  // Blocks cut both ways: the people the caller blocked and the people who
  // blocked the caller are both absent from the results. Otherwise a blocked
  // person could still be found (and then be sent a friend request) by name.
  const denials = await prisma.profileAccess.findMany({
    where: {
      kind: "DENY",
      OR: [{ ownerId: viewerId }, { viewerId }],
    },
    select: { ownerId: true, viewerId: true },
  });

  const excluded = new Set<string>([viewerId]);
  for (const row of denials) {
    excluded.add(row.ownerId === viewerId ? row.viewerId : row.ownerId);
  }

  const users = await prisma.user.findMany({
    where: {
      id: { notIn: [...excluded] },
      ...(term ? { name: { contains: term, mode: "insensitive" as const } } : {}),
    },
    select: briefSelect,
    // An empty query is the state the picker opens in, so it returns a short
    // list of the newest accounts instead of nothing to click.
    orderBy: { createdAt: "desc" },
    take: term ? SEARCH_LIMIT : DEFAULT_PICKER_SIZE,
  });

  return users.map(toBrief);
}

// ------------------------------------------------------------------ friends

const toFriendDto = (
  row: {
    id: string;
    requesterId: string;
    addresseeId: string;
    status: FriendshipStatusValue;
    createdAt: Date;
  },
  viewerId: string,
  other: BriefRow,
): FriendDto => {
  const outgoing = row.requesterId === viewerId;
  const status: FriendshipStatusValue = row.status;

  return {
    friendshipId: row.id,
    user: toBrief(other),
    relation:
      status === "ACCEPTED" ? "FRIEND" : outgoing ? "REQUEST_SENT" : "REQUEST_RECEIVED",
    status,
    // For an accepted pair this records who originally asked, which is the only
    // direction the single row still carries.
    direction: outgoing ? "OUTGOING" : "INCOMING",
    createdAt: row.createdAt.toISOString(),
  };
};

/** The caller's own friends, requests received, and requests sent. */
export async function listFriends(userId: string): Promise<FriendsPayload> {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
      createdAt: true,
      requester: { select: briefSelect },
      addressee: { select: briefSelect },
    },
    orderBy: { createdAt: "desc" },
  });

  const payload: FriendsPayload = { friends: [], incoming: [], outgoing: [] };

  for (const row of rows) {
    const outgoing = row.requesterId === userId;
    const other = outgoing ? row.addressee : row.requester;
    const dto = toFriendDto(row, userId, other);

    if (row.status === "ACCEPTED") payload.friends.push(dto);
    else if (outgoing) payload.outgoing.push(dto);
    else payload.incoming.push(dto);
  }

  return payload;
}

/**
 * Send a friend request.
 *
 *  - **A self-add is a 400.** It is meaningless, and it would create a row whose
 *    two ends are the same person, which every "who is the other side" helper in
 *    this file would then have to special-case.
 *  - **Duplicates are rejected in both directions**, and the message says which
 *    case it is, because "already sent" and "they already asked you" need
 *    different actions from the user.
 *  - **A pending request in the opposite direction is auto-accepted.** If they
 *    already asked you and you now ask them, both people have said yes to the
 *    same thing; making the second click queue behind the first would be
 *    pedantry, and the schema forbids a second row for the pair anyway.
 */
export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
): Promise<FriendDto> {
  if (requesterId === addresseeId) throw badRequest("不能添加自己为好友");

  const addressee = await prisma.user.findUnique({
    where: { id: addresseeId },
    select: briefSelect,
  });
  if (!addressee) throw notFound("该用户不存在");

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId },
        { requesterId: addresseeId, addresseeId: requesterId },
      ],
    },
  });

  if (existing?.status === "ACCEPTED") {
    throw conflict("你们已经是好友了");
  }

  if (existing) {
    if (existing.requesterId === requesterId) {
      throw conflict("好友申请已发送，请等待对方通过");
    }

    // They asked first: asking back is a yes.
    const accepted = await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
      select: {
        id: true,
        requesterId: true,
        addresseeId: true,
        status: true,
        createdAt: true,
      },
    });

    // They asked first: asking back is a yes. They are the one who wants to know
    // the outcome — the actor here is me, so the recipient is the original asker.
    await notify({
      recipientId: accepted.requesterId,
      type: "FRIEND_ACCEPTED",
      actorId: requesterId,
      href: `/u/${requesterId}`,
    });

    return toFriendDto(accepted, requesterId, addressee);
  }
  const created = await prisma.friendship.create({
    data: { requesterId, addresseeId },
    select: {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
      createdAt: true,
    },
  });

  // The addressee hears about it. `notify` owns the "your own action" and mute
  // checks and never throws, so a notification problem cannot fail the request.
  await notify({
    recipientId: addresseeId,
    type: "FRIEND_REQUEST",
    actorId: requesterId,
    href: "/friends",
  });

  return toFriendDto(created, requesterId, addressee);
}

/**
 * Load a friendship and prove the caller is part of it.
 *
 * An id from the client is a reference, not authorisation: anyone can read a
 * friendship id out of a response and post it back. So every friend endpoint
 * re-derives the caller's role from the stored row and answers 403 otherwise —
 * that is what stops a stranger from accepting, declining, or deleting somebody
 * else's request.
 */
async function loadFriendshipForParticipant(userId: string, friendshipId: string) {
  const row = await prisma.friendship.findUnique({
    where: { id: friendshipId },
    select: {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
      createdAt: true,
      requester: { select: briefSelect },
      addressee: { select: briefSelect },
    },
  });

  if (!row) throw notFound("该好友申请不存在");

  if (row.requesterId !== userId && row.addresseeId !== userId) {
    throw forbidden("你与该好友申请无关");
  }

  return row;
}

/**
 * Accept or decline a request. Only the addressee may respond.
 *
 * `decline` deletes the row, because the frozen `FriendshipStatus` enum has no
 * DECLINED state and keeping a PENDING row would leave the request in the
 * recipient's inbox forever. The returned DTO therefore describes what the
 * caller's relationship has just become — NONE — rather than a stored row.
 */
export async function respondToFriendRequest(
  userId: string,
  friendshipId: string,
  action: "accept" | "decline",
): Promise<FriendDto> {
  const row = await loadFriendshipForParticipant(userId, friendshipId);

  if (row.addresseeId !== userId) {
    throw forbidden("只有收到申请的一方能处理该申请");
  }

  if (row.status !== "PENDING") throw conflict("该申请已经处理过了");

  const other = row.requester;

  if (action === "decline") {
    await prisma.friendship.delete({ where: { id: row.id } });
    return { ...toFriendDto(row, userId, other), relation: "NONE" };
  }

  const accepted = await prisma.friendship.update({
    where: { id: row.id },
    data: { status: "ACCEPTED", respondedAt: new Date() },
    select: {
      id: true,
      requesterId: true,
      addresseeId: true,
      status: true,
      createdAt: true,
    },
  });

  // The requester asked and waited; they are the one who wants the answer. The
  // actor is the accepting side (the signed-in user), so the copy reads
  // "<name> accepted your friend request".
  await notify({
    recipientId: accepted.requesterId,
    type: "FRIEND_ACCEPTED",
    actorId: userId,
    href: `/u/${userId}`,
  });

  return toFriendDto(accepted, userId, other);
}

/**
 * Remove a friendship row.
 *
 * One endpoint covers both gestures, because they are the same operation on the
 * same row: cancelling a request you sent, and unfriending someone. Either party
 * may do it — requiring the requester's consent to be unfriended would be
 * absurd.
 */
export async function removeFriendship(userId: string, friendshipId: string): Promise<boolean> {
  const row = await loadFriendshipForParticipant(userId, friendshipId);
  await prisma.friendship.delete({ where: { id: row.id } });
  return true;
}
