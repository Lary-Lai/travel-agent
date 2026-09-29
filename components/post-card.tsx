"use client";

import { MessageSquare, Pin } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { boardBadgeLabel, boardName, daysSince } from "@/components/forum/board-text";
import { formatDate } from "@/lib/format";
import { cityName } from "@/lib/i18n/cities";
import { cn } from "@/lib/utils";
import type { Translate } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/locales";
import type { BoardDto, PostSummaryDto } from "@/types";

/** Keys for the day-granularity labels; whole-day buckets, not a live timer. */
function relativeLabel(t: Translate, days: number): string {
  if (days <= 0) return t("forum.relativeToday");
  if (days === 1) return t("forum.relativeYesterday");
  return t("forum.relativeDays", { count: days });
}

/**
 * One row in the post list.
 *
 * A card rather than a table row: the excerpt is the reason someone clicks, and
 * it needs two lines of prose, which a table column cannot give it. The whole
 * card is *not* a link — the title, the board badge and the author each lead
 * somewhere different, and nesting those inside one anchor is how a "click
 * anywhere" card ends up making the author unclickable.
 */
export function PostCard({
  post,
  board,
  locale,
  t,
  onCityClick,
  className,
}: {
  post: PostSummaryDto;
  /** The board row, for its localised name and emoji. Optional: the post list can
   *  render before the board query settles, and the slug is a readable fallback. */
  board?: BoardDto;
  locale: Locale;
  t: Translate;
  onCityClick?: (city: string) => void;
  className?: string;
}) {
  const days = daysSince(post.createdAt);
  const boardLabel = board
    ? boardBadgeLabel(locale, board)
    : boardName(locale, { name: post.boardSlug, nameI18n: null });

  return (
    <article
      className={cn(
        "hover:border-foreground/20 group relative rounded-2xl border p-4 transition-colors",
        // Pinned posts get a tinted edge rather than a louder background, so a
        // board with several pinned posts does not read as a different list.
        post.pinned && "border-primary/30 bg-primary/[0.03]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {post.pinned ? (
          <Badge variant="secondary" className="gap-1 text-[11px]">
            <Pin className="size-3" />
            {t("forum.pinned")}
          </Badge>
        ) : null}

        <Link
          href={`/forum?board=${encodeURIComponent(post.boardSlug)}`}
          className="focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-none"
        >
          <Badge variant="outline" className="hover:bg-accent text-[11px] transition-colors">
            {boardLabel}
          </Badge>
        </Link>

        {post.city ? (
          onCityClick ? (
            <button
              type="button"
              onClick={() => onCityClick(post.city as string)}
              className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
            >
              {cityName(locale, post.city)}
            </button>
          ) : (
            <span className="text-muted-foreground text-[11px]">{cityName(locale, post.city)}</span>
          )
        ) : null}

        {post.isMine ? (
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
            {t("forum.myPost")}
          </span>
        ) : null}
      </div>

      <h3 className="mt-2 text-base leading-snug font-semibold">
        <Link
          href={`/forum/${post.id}`}
          className="hover:text-primary focus-visible:ring-ring rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          {post.title}
        </Link>
      </h3>

      <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm leading-relaxed">
        {post.excerpt}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <Link
          href={`/u/${post.author.id}`}
          className="group/author flex items-center gap-1.5 hover:underline"
        >
          <Avatar size="sm" className="size-5">
            {post.author.avatar ? (
              <AvatarImage src={post.author.avatar} alt={post.author.name} />
            ) : null}
            <AvatarFallback className="text-[10px]">
              {post.author.name.slice(0, 1) || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground group-hover/author:text-foreground font-medium transition-colors">
            {post.author.name}
          </span>
        </Link>

        <span className="text-muted-foreground flex items-center gap-1">
          <MessageSquare className="size-3.5" />
          {t("forum.replies", { count: post.replyCount })}
        </span>

        <time
          dateTime={post.createdAt}
          className="text-muted-foreground ml-auto tabular-nums"
          title={formatDate(post.createdAt, locale)}
        >
          {relativeLabel(t, days)}
        </time>
      </div>
    </article>
  );
}
