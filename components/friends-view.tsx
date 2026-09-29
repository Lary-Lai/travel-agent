"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, LogIn, MailPlus, UserMinus, Users, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n/locales";
import type { FriendDto } from "@/types";

/**
 * `/friends` — your friends, the requests you received, and the ones you sent.
 *
 * All three lists come from one payload, because they are three views of the
 * same table and splitting them into three endpoints would let them drift apart
 * (a request that is in "incoming" but missing from "outgoing" is exactly the
 * bug the single payload makes impossible).
 */
export function FriendsView() {
  const { locale, t } = useLocale();
  const queryClient = useQueryClient();
  const { user, isLoading: sessionLoading } = useSession();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["friends"],
    queryFn: api.listFriends,
    enabled: Boolean(user),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["friends"] });
    // Every profile page shows a relation and a friend count, so both are stale
    // after any mutation here.
    void queryClient.invalidateQueries({ queryKey: ["public-profile"] });
  };

  const failed = (error: unknown) =>
    toast.error(error instanceof ApiClientError ? error.message : t("social.actionFailed"));

  const respond = useMutation({
    mutationFn: ({ friendshipId, action }: { friendshipId: string; action: "accept" | "decline" }) =>
      api.respondToFriendRequest(friendshipId, action),
    onSuccess: (_result, variables) => {
      toast.success(
        variables.action === "accept"
          ? t("social.friendRequestAccepted")
          : t("social.friendRequestDeclined"),
      );
      invalidate();
    },
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: (friendshipId: string) => api.removeFriend(friendshipId),
    onSuccess: () => {
      toast.success(t("social.friendRemoved"));
      invalidate();
    },
    onError: failed,
  });

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon={LogIn}
        title={t("account.loginTitle")}
        description={t("account.loginBody")}
        action={
          <Button asChild className="gap-2">
            <Link href="/login?redirect=%2Ffriends">
              <LogIn className="size-4" />
              {t("account.goLogin")}
            </Link>
          </Button>
        }
      />
    );
  }

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const busy = respond.isPending || remove.isPending;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("social.friendsTitle")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("social.friendsSubtitle")}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href={`/u/${user.id}`}>
            <Users className="size-3.5" />
            {t("social.myProfile")}
          </Link>
        </Button>
      </div>

      {isError ? (
        <ErrorState
          title={t("social.loadFailedTitle")}
          description={t("social.loadFailedBody")}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <Section title={t("social.requestsTitle")} count={incoming.length} icon={MailPlus}>
            {incoming.length === 0 ? (
              <EmptyState icon={MailPlus} title={t("social.noRequests")} />
            ) : (
              <ul className="divide-y">
                {incoming.map((request) => (
                  <PersonRow key={request.friendshipId} friend={request} locale={locale}>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() =>
                        respond.mutate({ friendshipId: request.friendshipId, action: "accept" })
                      }
                    >
                      <Check className="size-3.5" />
                      {t("social.accept")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        respond.mutate({ friendshipId: request.friendshipId, action: "decline" })
                      }
                    >
                      <X className="size-3.5" />
                      {t("social.decline")}
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("social.friendsTitle")} count={friends.length} icon={Users}>
            {friends.length === 0 ? (
              <EmptyState
                icon={Users}
                title={t("social.noFriends")}
                action={
                  // The copy itself points at the community, so the button goes
                  // there rather than to a profile page that does not exist yet.
                  <Button asChild variant="outline">
                    <Link href="/forum">{t("forum.title")}</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {friends.map((friend) => (
                  <PersonRow key={friend.friendshipId} friend={friend} locale={locale}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => remove.mutate(friend.friendshipId)}
                    >
                      <UserMinus className="size-3.5" />
                      {t("social.removeFriend")}
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("social.sentTitle")} count={outgoing.length} icon={Clock}>
            {outgoing.length === 0 ? (
              <EmptyState icon={Clock} title={t("social.noSent")} />
            ) : (
              <ul className="divide-y">
                {outgoing.map((request) => (
                  <PersonRow key={request.friendshipId} friend={request} locale={locale}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      disabled={busy}
                      onClick={() => remove.mutate(request.friendshipId)}
                    >
                      <X className="size-3.5" />
                      {t("social.cancelRequestHint")}
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/** One titled block; the count is shown so an empty section is still informative. */
function Section({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count: number;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="text-primary size-4" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </div>
      <div className="rounded-2xl border p-2 sm:p-3">{children}</div>
    </section>
  );
}

/** A person, linked to their profile, with whatever actions the section offers. */
function PersonRow({
  friend,
  locale,
  children,
}: {
  friend: FriendDto;
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 p-2">
      <Link href={`/u/${friend.user.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-10">
          {friend.user.avatar ? <AvatarImage src={friend.user.avatar} alt="" /> : null}
          <AvatarFallback>{friend.user.name.slice(0, 1) || "?"}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="hover:text-primary block truncate text-sm font-medium transition-colors">
            {friend.user.name}
          </span>
          <span className="text-muted-foreground block text-xs tabular-nums">
            {formatDate(friend.createdAt, locale)}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-1.5">{children}</div>
    </li>
  );
}
