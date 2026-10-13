import { prisma } from "../lib/db";
import type { Prisma } from "../lib/generated/prisma/client";
import type { NotificationDto, NotificationTypeValue } from "../types";

/**
 * Notifications.
 *
 * ## Why the type is stored and the sentence is not
 *
 * A notification records *what happened* (type), *who did it* (actor) and *where
 * it points* (href). The sentence is composed when it is read, in the reader's
 * current language. Storing the sentence would freeze whichever language the event
 * happened in, in an app with six of them — and would need rewriting if the copy
 * ever changed.
 *
 * ## Why `notify` never throws
 *
 * Every call site is a *business* operation — accepting a friend request, posting a
 * reply, confirming a booking. A notification is a side effect of that, so a
 * failure to record one must never fail the operation itself or leave the caller
 * with a half-applied action. The function swallows and logs, deliberately.
 */

type NotifyInput = {
  recipientId: string;
  type: NotificationTypeValue;
  actorId?: string | null;
  href: string;
  /**
   * Extras for the copy. Typed as Prisma's JSON input rather than
   * `Record<string, unknown>` because the column is `Json` and Prisma will not
   * accept an arbitrary object for it.
   */
  meta?: Prisma.InputJsonValue;
};

export async function notify(input: NotifyInput): Promise<void> {
  try {
    // Acting on your own content is not news to you.
    if (input.actorId && input.actorId === input.recipientId) return;

    const recipient = await prisma.user.findUnique({
      where: { id: input.recipientId },
      select: { mutedNotificationTypes: true },
    });
    if (!recipient) return;
    if (recipient.mutedNotificationTypes.includes(input.type)) return;

    await prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        type: input.type,
        actorId: input.actorId ?? null,
        href: input.href,
        meta: input.meta,
      },
    });
  } catch (error) {
    console.error("[notify] failed to record a notification:", error);
  }
}

const actorSelect = { id: true, name: true, avatar: true } as const;

type NotificationRow = {
  id: string;
  type: NotificationTypeValue;
  href: string;
  meta: unknown;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; name: string; avatar: string | null } | null;
};

const toDto = (row: NotificationRow): NotificationDto => ({
  id: row.id,
  type: row.type,
  href: row.href,
  meta: (row.meta as Record<string, unknown> | null) ?? null,
  read: row.readAt !== null,
  createdAt: row.createdAt.toISOString(),
  actor: row.actor,
});

/** The list plus the badge count, so the header never shows a stale number. */
export async function listNotifications(
  userId: string,
  limit = 30,
): Promise<{ items: NotificationDto[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        href: true,
        meta: true,
        readAt: true,
        createdAt: true,
        actor: { select: actorSelect },
      },
    }),
    prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
  ]);

  return { items: rows.map(toDto), unreadCount };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { recipientId: userId, readAt: null } });
}

/**
 * Mark one, or all.
 *
 * The `userId` is part of every `where`, so a guessed id cannot mark somebody
 * else's notification as read — the ownership check is the query, not a branch
 * that could be forgotten.
 */
export async function markRead(userId: string, id?: string): Promise<number> {
  await prisma.notification.updateMany({
    where: { recipientId: userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: new Date() },
  });
  return getUnreadCount(userId);
}

/** Replace the set of muted types. Unknown values are ignored by the validator. */
export async function setMutedTypes(
  userId: string,
  types: NotificationTypeValue[],
): Promise<NotificationTypeValue[]> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { mutedNotificationTypes: types },
    select: { mutedNotificationTypes: true },
  });
  return user.mutedNotificationTypes;
}
