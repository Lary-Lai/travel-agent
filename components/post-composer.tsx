"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogIn, PenSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api";
import { boardEmoji, boardName } from "@/components/forum/board-text";
import type { BoardDto } from "@/types";

const MAX_TITLE = 120;
const MAX_BODY = 5000;

/**
 * "发布新帖" — a dialog on the forum page.
 *
 * Requires a session, and when signed out it renders the *reason* plus a way to
 * fix it instead of a form that would 401 on submit. Reading the forum is public,
 * so this is the one place where the forum asks who you are.
 */
export function PostComposer({
  boards,
  defaultBoardSlug,
}: {
  boards: BoardDto[];
  /** The board currently being viewed, pre-selected so the common case is one click. */
  defaultBoardSlug?: string | null;
}) {
  const { locale, t } = useLocale();
  const { user, isLoading } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const fallbackBoard = defaultBoardSlug ?? boards[0]?.slug ?? "";
  const [boardSlug, setBoardSlug] = useState(fallbackBoard);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [city, setCity] = useState("");

  const reset = () => {
    setBoardSlug(defaultBoardSlug ?? boards[0]?.slug ?? "");
    setTitle("");
    setBody("");
    setCity("");
  };

  const create = useMutation({
    mutationFn: () =>
      api.createPost({
        boardSlug,
        title: title.trim(),
        body: body.trim(),
        // Omitted rather than sent empty: the server treats an unresolvable city
        // as "no city", and an empty string is not a city.
        ...(city.trim() ? { city: city.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(t("forum.published"), { description: result.post.title });
      // The new post belongs in the board list, and the board's count changed.
      void queryClient.invalidateQueries({ queryKey: ["forum", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["forum", "boards"] });
      setOpen(false);
      reset();
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiClientError ? error.message : t("globals.errorBody"),
      ),
  });

  // The session query resolves after first paint; rendering the sign-in prompt
  // during that window would flash "please log in" at a signed-in user.
  if (isLoading) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Loader2 className="size-4 animate-spin" />
        {t("forum.newPost")}
      </Button>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm">{t("forum.loginToPost")}</span>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/login?redirect=${encodeURIComponent("/forum")}`}>
            <LogIn className="size-3.5" />
            {t("forum.loginAction")}
          </Link>
        </Button>
      </div>
    );
  }

  const titleTooLong = title.trim().length > MAX_TITLE;
  const bodyTooLong = body.trim().length > MAX_BODY;
  const canPublish =
    boardSlug.length > 0 && title.trim().length > 0 && body.trim().length > 0 && !titleTooLong && !bodyTooLong;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PenSquare className="size-4" />
          {t("forum.newPost")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("forum.newPost")}</DialogTitle>
          <DialogDescription>{t("forum.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="forum-board">{t("forum.board")}</Label>
            <Select value={boardSlug} onValueChange={setBoardSlug}>
              <SelectTrigger id="forum-board" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => {
                  const emoji = boardEmoji(board);
                  return (
                    <SelectItem key={board.slug} value={board.slug}>
                      {emoji ? `${emoji} ` : ""}
                      {boardName(locale, board)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forum-title">{t("forum.postTitle")}</Label>
            <Input
              id="forum-title"
              value={title}
              maxLength={MAX_TITLE + 20}
              placeholder={t("forum.postTitlePlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={titleTooLong}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forum-body">{t("forum.postBody")}</Label>
            <Textarea
              id="forum-body"
              value={body}
              rows={7}
              placeholder={t("forum.postBodyPlaceholder")}
              onChange={(event) => setBody(event.target.value)}
              aria-invalid={bodyTooLong}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forum-city">{t("forum.postCity")}</Label>
            <Input
              id="forum-city"
              value={city}
              placeholder={t("forum.postCityPlaceholder")}
              onChange={(event) => setCity(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
            {t("forum.cancel")}
          </Button>
          <Button disabled={!canPublish || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {t("forum.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
