"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LayoutGrid, Loader2, MessagesSquare, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { PostCard } from "@/components/post-card";
import { PostComposer } from "@/components/post-composer";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { boardEmoji, boardName } from "@/components/forum/board-text";
import { cn } from "@/lib/utils";
import { FORUM_SORTS, type ForumSortValue } from "@/types";

const SEARCH_DEBOUNCE_MS = 350;

const SORT_LABEL_KEY: Record<ForumSortValue, string> = {
  latest: "forum.sortLatest",
  new: "forum.sortNew",
  popular: "forum.sortPopular",
};

/**
 * The board rail, on its own so the desktop sidebar and the mobile chip row
 * cannot drift apart.
 */
function BoardList({
  boards,
  activeSlug,
  onSelect,
  variant,
}: {
  boards: ReturnType<typeof useBoards>["boards"];
  activeSlug: string;
  onSelect: (slug: string) => void;
  variant: "sidebar" | "chips";
}) {
  const { locale, t } = useLocale();
  const total = boards.reduce((sum, board) => sum + board.postCount, 0);

  const entries = [
    { slug: "", name: t("forum.allBoards"), emoji: "🗂", postCount: total },
    ...boards.map((board) => ({
      slug: board.slug,
      name: boardName(locale, board),
      emoji: boardEmoji(board) ?? "💬",
      postCount: board.postCount,
    })),
  ];

  if (variant === "chips") {
    return (
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {entries.map((entry) => {
          const active = entry.slug === activeSlug;
          return (
            <button
              key={entry.slug || "all"}
              type="button"
              onClick={() => onSelect(entry.slug)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent",
              )}
            >
              <span aria-hidden>{entry.emoji}</span>
              {entry.name}
              <span className={cn("text-[11px]", active ? "opacity-80" : "text-muted-foreground")}>
                {entry.postCount}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <nav className="space-y-1">
      {entries.map((entry) => {
        const active = entry.slug === activeSlug;
        return (
          <button
            key={entry.slug || "all"}
            type="button"
            onClick={() => onSelect(entry.slug)}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
              active ? "bg-accent font-medium" : "hover:bg-accent/60",
            )}
          >
            <span aria-hidden>{entry.emoji}</span>
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{entry.postCount}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Boards query, shared by the view and its rail. */
function useBoards() {
  const { data, isLoading } = useQuery({
    queryKey: ["forum", "boards"],
    queryFn: api.listBoards,
    // Board rows change only when the seed runs; the counts move with posts, so
    // the post mutations explicitly invalidate this key.
    staleTime: 60_000,
  });

  return { boards: data?.boards ?? [], isLoading };
}

/**
 * The forum index.
 *
 * The URL is the single source of truth for *what is being shown* — board, sort,
 * search, city and the "my posts" switch all live in search params, so the view
 * is shareable, bookmarkable and survives a refresh. That is the same contract
 * `components/search-results.tsx` uses for listing searches, and it is the reason
 * this component holds no filter state of its own.
 */
export function ForumView() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const criteria = useMemo(() => {
    const sortParam = searchParams.get("sort");
    const sort: ForumSortValue = (FORUM_SORTS as readonly string[]).includes(sortParam ?? "")
      ? (sortParam as ForumSortValue)
      : "latest";

    return {
      board: searchParams.get("board") ?? "",
      sort,
      q: searchParams.get("q") ?? "",
      city: searchParams.get("city") ?? "",
      mine: searchParams.get("mine") === "1",
    };
    // Recomputing off the query string keeps this stable across re-renders that
    // do not change the URL — a `searchParams` object identity would not be.
  }, [searchParams]);

  const { board, sort, q, city, mine } = criteria;

  /** Write a patch back to the URL; unrelated params are preserved. */
  const updateCriteria = (patch: Partial<typeof criteria>) => {
    const next = new URLSearchParams(searchParams.toString());
    const merged = { ...criteria, ...patch };

    const set = (key: string, value: string) => {
      if (value) next.set(key, value);
      else next.delete(key);
    };

    set("board", merged.board);
    set("sort", merged.sort === "latest" ? "" : merged.sort);
    set("q", merged.q);
    set("city", merged.city);
    set("mine", merged.mine ? "1" : "");

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // The search box is typed into faster than the URL should change, so it keeps
  // its own draft and pushes it up once typing pauses. `q` is a dependency so
  // that arriving via a shared link (or the browser's back button) syncs the box.
  const [draft, setDraft] = useState(q);
  const lastPushed = useRef(q);

  useEffect(() => {
    if (draft === lastPushed.current) return;

    const timer = setTimeout(() => {
      lastPushed.current = draft;
      updateCriteria({ q: draft });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `updateCriteria` is re-created per render by design: it closes over the
    // current params, and depending on it here would restart the timer on every
    // parent render instead of on the next keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (q === lastPushed.current) return;
    lastPushed.current = q;
    setDraft(q);
  }, [q]);

  const { boards, isLoading: boardsLoading } = useBoards();

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["forum", "posts", criteria],
    queryFn: () =>
      api.listPosts({
        board: board || undefined,
        sort,
        q: q || undefined,
        city: city || undefined,
        mine: mine || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const activeBoard = boards.find((entry) => entry.slug === board);
  const posts = data?.posts ?? [];
  const total = data?.total ?? 0;
  const hasFilters = Boolean(q || city || mine);

  const selectBoard = (slug: string) => {
    // Switching boards keeps the sort (a reading preference) and drops the
    // filters (a question about the board you were just looking at).
    updateCriteria({ board: slug, q: "", city: "", mine: false });
    setDraft("");
    lastPushed.current = "";
  };

  const clearFilters = () => {
    updateCriteria({ q: "", city: "", mine: false });
    setDraft("");
    lastPushed.current = "";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">{t("forum.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            {t("forum.description")}
          </p>
        </div>
        <PostComposer boards={boards} defaultBoardSlug={board || undefined} />
      </div>

      <div className="gap-8 lg:flex">
        {/* ------------------------------------------------------- board rail */}
        <aside className="lg:w-60 lg:shrink-0">
          <div className="lg:sticky lg:top-24">
            <h2 className="text-muted-foreground mb-2 hidden text-xs font-medium tracking-wide uppercase lg:block">
              {t("forum.boards")}
            </h2>

            {boardsLoading ? (
              <div className="hidden space-y-1 lg:block">
                {Array.from({ length: 7 }, (_, index) => (
                  <Skeleton key={index} className="h-9 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                <div className="hidden lg:block">
                  <BoardList
                    boards={boards}
                    activeSlug={board}
                    onSelect={selectBoard}
                    variant="sidebar"
                  />
                </div>
                <div className="lg:hidden">
                  <BoardList
                    boards={boards}
                    activeSlug={board}
                    onSelect={selectBoard}
                    variant="chips"
                  />
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ---------------------------------------------------------- results */}
        <div className="mt-6 min-w-0 flex-1 space-y-4 lg:mt-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t("forum.searchPlaceholder")}
                aria-label={t("forum.searchPosts")}
                className="pl-9"
              />
              {isFetching && !isLoading ? (
                <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
              ) : null}
            </div>

            <Select
              value={sort}
              onValueChange={(value) => updateCriteria({ sort: value as ForumSortValue })}
            >
              <SelectTrigger className="w-40" aria-label={t("forum.sortLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORUM_SORTS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(SORT_LABEL_KEY[option] as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant={mine ? "default" : "outline"}
              aria-pressed={mine}
              onClick={() => updateCriteria({ mine: !mine })}
            >
              {t("forum.mine")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-sm">
              {activeBoard
                ? `${boardEmoji(activeBoard) ?? ""} ${boardName(locale, activeBoard)}`
                : t("forum.allBoards")}
              {" · "}
              {t("forum.resultsCount", { count: total })}
            </p>

            {city ? (
              <button
                type="button"
                onClick={() => updateCriteria({ city: "" })}
                className="bg-accent hover:bg-accent/70 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
              >
                {city}
                <X className="size-3" />
              </button>
            ) : null}

            {hasFilters ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
                {t("forum.clearSearch")}
              </Button>
            ) : null}
          </div>

          {isError ? (
            <ErrorState
              title={t("globals.errorTitle")}
              description={t("globals.errorBody")}
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-32 w-full rounded-2xl" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={Search}
                title={t("forum.noResults")}
                description={t("forum.noResultsHint")}
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    {t("forum.clearSearch")}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={MessagesSquare}
                title={t("forum.noPosts")}
                description={t("forum.description")}
              />
            )
          ) : (
            <div
              className={cn(
                "space-y-3 transition-opacity",
                isFetching ? "opacity-60" : "opacity-100",
              )}
            >
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  board={boards.find((entry) => entry.slug === post.boardSlug)}
                  locale={locale}
                  t={t}
                  onCityClick={(value) => updateCriteria({ city: value, mine: false })}
                />
              ))}

              {/* The API caps the window it returns; say so rather than letting a
                  truncated list look like the whole board. */}
              {total > posts.length ? (
                <p className="text-muted-foreground flex items-center justify-center gap-1.5 pt-2 text-xs">
                  <LayoutGrid className="size-3.5" />
                  {t("forum.resultsCount", { count: posts.length })} / {total}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
