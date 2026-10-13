"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NotificationDto, NotificationTypeValue } from "@/types";

/**
 * The header bell: unread badge, and the inbox behind it.
 *
 * ## Why the sentence is built here
 *
 * The API returns a *type*, an actor and a target — never a sentence (see
 * `server/notification.service.ts`). The wording is composed at render time from
 * the reader's dictionary, so a notification written while the app was in Chinese
 * still reads correctly to the same person in English, and changing the copy does
 * not require rewriting stored rows.
 *
 * ## Why it polls gently rather than streaming
 *
 * A friend request is not a chat message; a 60-second refresh plus a refetch when
 * the tab regains focus is enough to feel live without holding a connection open
 * for every signed-in visitor.
 */
export function NotificationBell() {
  const { t, locale } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: api.listNotifications,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const markRead = useMutation({
    mutationFn: (id?: string) => api.markNotificationsRead(id),
    onSuccess: (result) => {
      queryClient.setQueryData(["notifications"], (previous: typeof data) =>
        previous ? { ...previous, unreadCount: result.unreadCount } : previous,
      );
      // The list itself is refetched so the read state of each row is accurate,
      // not just the badge.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  /** One line of copy per type, in the current language. */
  const describe = (notification: NotificationDto) => {
    const name = notification.actor?.name ?? "";
    const key: Record<NotificationTypeValue, Parameters<typeof t>[0]> = {
      FRIEND_REQUEST: "notifications.friendRequest",
      FRIEND_ACCEPTED: "notifications.friendAccepted",
      POST_REPLY: "notifications.postReply",
      BOOKING_CONFIRMED: "notifications.bookingConfirmed",
      BOOKING_CANCELLED: "notifications.bookingCancelled",
    };
    return t(key[notification.type], { name });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("notifications.title")}>
          <Bell className="size-4" />
          {/* A count, not just a dot: "3" tells you whether to stop what you are
              doing, which is the only reason the badge exists. */}
          {unreadCount > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-medium tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            {t("notifications.title")}
            {unreadCount > 0 ? (
              <span className="text-muted-foreground text-xs font-normal">
                {t("notifications.unread", { count: unreadCount })}
              </span>
            ) : null}
          </SheetTitle>
        </SheetHeader>

        {unreadCount > 0 ? (
          <div className="mb-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => markRead.mutate(undefined)}
              disabled={markRead.isPending}
            >
              {markRead.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCheck className="size-3.5" />
              )}
              {t("notifications.markAllRead")}
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-muted-foreground text-sm">…</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("notifications.empty")}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((notification) => (
              <li key={notification.id}>
                <Link
                  href={notification.href}
                  onClick={() => {
                    if (!notification.read) markRead.mutate(notification.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "hover:bg-accent flex items-start gap-3 rounded-xl p-3 transition-colors",
                    // Unread is shown with a tint plus a dot, not with bold text
                    // alone: colour survives being read at a glance.
                    !notification.read && "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      notification.read ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{describe(notification)}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {formatRelativeTime(notification.createdAt, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
