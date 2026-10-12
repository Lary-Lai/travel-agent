"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Compass, Footprints, Heart, Lock, LogIn, MapPin, Sparkles, Tag, Users } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { FriendButton } from "@/components/friend-button";
import { useLocale } from "@/components/locale-provider";
import { ProfilePrivacyDialog } from "@/components/profile-privacy-dialog";
import { useSession } from "@/components/session-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { resolveCover } from "@/lib/profile-options";
import { cn } from "@/lib/utils";
import type { ProfileAccessReason, PublicUserBrief } from "@/types";

/**
 * Someone else's profile page (`/u/[id]`).
 *
 * The DTO never hides the *person* — you navigated here, so the name and avatar
 * are shown either way. What the visibility rule gates is the profile body, and
 * a refused read is still a successful response carrying the reason, so this
 * renders a real explanation instead of a 404 or an empty shell.
 */
export function PublicProfileView({ id }: { id: string }) {
  const { locale, t } = useLocale();
  const { user } = useSession();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["public-profile", id],
    queryFn: () => api.getPublicProfile(id),
    // A refused or missing profile is an answer, not a transient failure.
    retry: false,
  });

  /**
   * Recent forum posts.
   *
   * `PublicProfileDto` carries the post *count* but no post list, and the forum
   * client has no author filter, so the newest page of posts is filtered down to
   * this author. Only fetched once the profile is known to be visible — and only
   * rendered when the request succeeded, so a forum that is not available yet
   * leaves this section out instead of showing an error on someone's profile.
   */
  const { data: forum } = useQuery({
    queryKey: ["forum-posts", "newest"],
    queryFn: () => api.listPosts({ sort: "new" }),
    enabled: data?.canView === true,
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    const missing = error instanceof ApiClientError && error.status === 404;
    return (
      <EmptyState
        icon={missing ? Lock : undefined}
        title={missing ? t("social.notFoundTitle") : t("social.loadFailedTitle")}
        description={missing ? t("social.notFoundBody") : t("social.loadFailedBody")}
        action={
          missing ? (
            <Button asChild variant="outline">
              <Link href="/search">{t("trips.emptyAction")}</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void refetch()}>
              {t("globals.reload")}
            </Button>
          )
        }
      />
    );
  }

  const { profile, stats } = data;

  if (!data.canView || !profile || !stats) {
    return <HiddenProfile user={data.user} access={data.access} signedIn={Boolean(user)} />;
  }

  const cover = resolveCover(profile.coverImage, profile.coverPreset);
  const posts = (forum?.posts ?? []).filter((post) => post.author.id === data.user.id).slice(0, 5);

  /**
   * Where this traveller has actually been posting from.
   *
   * Derived from their own public posts rather than from anything private, and
   * de-duplicated in post order so the most recent place comes first. Labelled
   * "recent" because it is built from the newest posts the profile already lists.
   */
  const footprint = [
    ...new Set(posts.map((post) => post.city).filter((city): city is string => Boolean(city))),
  ];

  const hasDeclaredProfile = [
    profile.tags,
    profile.hobbies,
    profile.dreamDestinations,
    profile.visitedPlaces,
  ].some((values) => values.length > 0);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- banner */}
      <section className="relative overflow-hidden rounded-2xl border">
        {cover.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="" className="h-44 w-full object-cover" />
        ) : (
          <div className={cn("h-44 w-full", cover.className)} />
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
          <div className="flex items-end gap-3">
            <Avatar className="size-16 border-2 border-white/70 shadow-lg">
              {data.user.avatar ? <AvatarImage src={data.user.avatar} alt={data.user.name} /> : null}
              <AvatarFallback className="text-lg">{data.user.name.slice(0, 1) || "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 pb-1">
              <p className="truncate font-semibold text-white">{data.user.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
                <CalendarDays className="size-3" />
                {t("account.joinedAt", { date: formatDate(profile.joinedAt, locale) })}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- meta */}
      {/*
        A lightweight metrics row, not a row of cards.

        Each figure was its own bordered card, which gave three numbers the same
        visual weight as the content sections below and made the top of the page
        read as a dashboard. The figures are now set as one strip divided by hairlines
        — number first and larger, label beneath it — so the eye reads
        "2 friends · 4 posts" at a glance and moves on.

        The values are bare numbers for the same reason: "1位好友" as a big figure
        puts the unit in the loudest position and the number in the quietest. The
        label carries the unit now, which also removes the plural forms from a place
        where they were doing no work.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-y-3">
          <StatTile label={t("social.friends")} value={stats.friends} />
          <StatTile label={t("social.recentPosts")} value={stats.posts} />
          {/* "Mutual friends" is meaningless on your own profile — every friend
              is a mutual friend — so the tile is only shown to a visitor, where
              it carries information neither of the other two tiles does. */}
          {user && data.relation !== "SELF" && data.mutualFriendCount > 0 ? (
            <StatTile label={t("social.friendsTitle")} value={data.mutualFriendCount} />
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {/* The owner gets the visibility dialog here rather than a friend
              button: the one action that makes sense on your own profile is
              changing who may see it. */}
          {data.relation === "SELF" ? <ProfilePrivacyDialog /> : null}
          <FriendButton userId={data.user.id} relation={data.relation} requestId={data.requestId} />
        </div>
      </div>

      {data.relation === "SELF" ? (
        <p className="text-muted-foreground text-xs">{t("social.selfProfile")}</p>
      ) : null}

      {/*
        ---------------------------------------------------------- travel profile

        This section used to render as an empty bordered box whenever the owner had
        filled in none of the four declared lists, because each `ChipRow` returns
        null when empty and nothing else was in the card — an empty rounded
        rectangle that reads as a broken placeholder (it showed up in a user
        screenshot as exactly that).

        It now has three jobs: show what the owner declared, derive a **footprint**
        from what they have actually published, and — if both are empty — say so
        instead of leaving a blank box.

        The derived row comes from the author's own public posts (their cities),
        never from private signals: search history and wishlists are not shown to
        visitors, and a profile page is not the place to leak them.
      */}
      <section className="space-y-5 rounded-2xl border p-5">
        <ChipRow icon={Tag} label={t("account.tags")} values={profile.tags} />
        <ChipRow icon={Heart} label={t("account.hobbies")} values={profile.hobbies} />
        <ChipRow icon={Compass} label={t("account.dreamDestinations")} values={profile.dreamDestinations} />
        <ChipRow icon={MapPin} label={t("account.visitedPlaces")} values={profile.visitedPlaces} />
        <ChipRow icon={Footprints} label={t("social.travelFootprint")} values={footprint} />

        {footprint.length === 0 && !hasDeclaredProfile ? (
          <p className="text-muted-foreground text-sm">
            {data.relation === "SELF" ? t("social.profileEmptySelf") : t("social.profileEmpty")}
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------------- posts */}
      {forum ? (
        <section className="space-y-3 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" />
            <h2 className="text-sm font-semibold">{t("social.recentPosts")}</h2>
          </div>

          {posts.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("social.noPosts")}</p>
          ) : (
            <ul className="divide-y">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/forum/${post.id}`}
                    className="hover:text-primary flex flex-wrap items-baseline justify-between gap-2 py-2 transition-colors"
                  >
                    <span className="line-clamp-1 text-sm font-medium">{post.title}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatDate(post.createdAt, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/**
 * One figure in the metrics strip: the number is the focus, the label explains it.
 *
 * The hairline is drawn by the tile itself (`:not(:first-child)`) so the strip
 * stays correct when the optional mutual-friends tile is absent — a divider
 * element between children would leave a dangling line in that case.
 */
function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1 [&:not(:first-child)]:border-l [&:not(:first-child)]:pl-5">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

/** One chip row; a section with nothing in it would just be noise. */
function ChipRow({
  icon: Icon,
  label,
  values,
}: {
  icon: typeof Tag;
  label: string;
  values: string[];
}) {
  if (values.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon className="size-3.5" />
        {label}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <li key={value} className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Why the profile did not open.
 *
 * Each reason names the mode that actually blocked the viewer, because "private"
 * and "you are blocked" call for different reactions from the person reading it —
 * and a signed-out visitor needs to know that signing in might change the answer.
 */
function HiddenProfile({
  user,
  access,
  signedIn,
}: {
  user: PublicUserBrief;
  access: ProfileAccessReason;
  signedIn: boolean;
}) {
  const { t } = useLocale();

  const reasonKey =
    access === "DENIED"
      ? "social.accessDenied"
      : access === "FRIENDS_ONLY"
        ? "social.accessFriendsOnly"
        : access === "SELECTED_ONLY"
          ? "social.accessSelectedOnly"
          : "social.accessPrivate";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
          <AvatarFallback>{user.name.slice(0, 1) || "?"}</AvatarFallback>
        </Avatar>
        <p className="font-semibold">{user.name}</p>
      </div>

      <EmptyState
        icon={Lock}
        title={t("social.profileHiddenTitle")}
        description={`${t(reasonKey)} ${t("social.profileHiddenBody")}`}
        action={
          !signedIn ? (
            <div className="space-y-2">
              <Button asChild className="gap-2">
                <Link href="/login">
                  <LogIn className="size-4" />
                  {t("account.goLogin")}
                </Link>
              </Button>
              <p className="text-muted-foreground max-w-xs text-xs">{t("social.loginToView")}</p>
            </div>
          ) : (
            <Button asChild variant="outline">
              <Link href="/friends">
                <Users className="size-4" />
                {t("social.friendsTitle")}
              </Link>
            </Button>
          )
        }
      />
    </div>
  );
}
