"use client";

/**
 * Small helpers shared by the forum surfaces.
 *
 * Kept out of the components themselves for one reason: board text and board
 * emoji are needed by the board rail (forum view), the post card and the post
 * detail header, and three copies of the same fallback chain is how a board ends
 * up localised in one place and Chinese in another.
 */
import type { BoardDto } from "@/types";
import type { Locale } from "@/lib/i18n/locales";

/**
 * A board's name in the reader's language.
 *
 * Exactly the shape of `localizedTitle` for listings: the per-locale override is
 * preferred, and the authored Chinese `name` is the fallback — so a board added
 * by a seed change without translations still renders rather than showing a slug
 * or a blank.
 */
export function boardName(
  locale: Locale,
  board: Pick<BoardDto, "name" | "nameI18n"> & { slug?: string },
): string {
  return board.nameI18n?.[locale] ?? board.name ?? board.slug ?? "";
}

/** The board's blurb in the reader's language, same fallback chain as the name. */
export function boardDescription(
  locale: Locale,
  board: Pick<BoardDto, "description" | "descriptionI18n">,
): string {
  return board.descriptionI18n?.[locale] ?? board.description;
}

/**
 * The board's emoji.
 *
 * The seed always sets one, but a board created by hand may only carry the lucide
 * `icon` name — in which case there is nothing to render here and the caller
 * falls back to its own generic icon.
 */
export function boardEmoji(board: Pick<BoardDto, "emoji">): string | null {
  return board.emoji ?? null;
}

/** Short label for a board inside a compact badge ("🎿 滑雪旅行"). */
export function boardBadgeLabel(
  locale: Locale,
  board: Pick<BoardDto, "name" | "nameI18n" | "emoji">,
): string {
  const emoji = boardEmoji(board);
  const name = boardName(locale, board);
  return emoji ? `${emoji} ${name}` : name;
}

/** Today at UTC midnight, as the baseline for "how long ago was this posted". */
function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Whole days between a timestamp and today, at UTC granularity.
 *
 * Days rather than milliseconds because the labels below are whole-day labels
 * ("3 天前"), and because a UTC day boundary is the same boundary `parseDateOnly`
 * and `formatDate` already use — mixing a local-midnight difference with a
 * UTC-formatted date is how "今天" ends up on yesterday's post.
 */
export function daysSince(value: string): number {
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return 0;
  const thenDay = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  return Math.max(0, Math.round((startOfTodayUtc() - thenDay) / 86_400_000));
}
