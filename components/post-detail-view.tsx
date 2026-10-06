"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, LogIn, MapPin, MessageSquare, Pin, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDeleteButton } from "@/components/forum/confirm-delete-button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useLocale } from "@/components/locale-provider";
import { useSession } from "@/components/session-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cityName } from "@/lib/i18n/cities";
import type { ReplyDto } from "@/types";

const MAX_REPLY = 2000;

/** Reply box, or the reason you cannot use one yet. */
function ReplyBox({ postId, onPosted }: { postId: string; onPosted: (reply: ReplyDto) => void }) {
  const { t } = useLocale();
  const { user, isLoading } = useSession();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");

  const reply = useMutation({
    mutationFn: () => api.createReply(postId, body.trim()),
    onSuccess: (result) => {
      toast.success(t("forum.replyPosted"));
      onPosted(result.reply);
      setBody("");
      // The board list shows this post's reply count, so it is now stale.
      void queryClient.invalidateQueries({ queryKey: ["forum", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["forum", "boards"] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : t("globals.errorBody")),
  });

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-2xl" />;
  }

  if (!user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
        <span className="text-muted-foreground text-sm">{t("forum.loginToPost")}</span>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/login?redirect=${encodeURIComponent(`/forum/${postId}`)}`}>
            <LogIn className="size-3.5" />
            {t("forum.loginAction")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        rows={3}
        placeholder={t("forum.replyPlaceholder")}
        aria-label={t("forum.reply")}
        maxLength={MAX_REPLY}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex items-center justify-end gap-2">
        {body.trim().length > 0 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {body.trim().length} / {MAX_REPLY}
          </span>
        ) : null}
        <Button
          size="sm"
          className="gap-1.5"
          disabled={body.trim().length === 0 || reply.isPending}
          onClick={() => reply.mutate()}
        >
          {reply.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          {t("forum.reply")}
        </Button>
      </div>
    </div>
  );
}

/**
 * One post and its replies.
 *
 * The thread reads oldest-first, the way a conversation happened, so a reply is
 * appended at the end rather than prepended — replying is joining a discussion,
 * not starting a feed item.
 */
export function PostDetailView({ postId }: { postId: string }) {
  const { locale, t } = useLocale();
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["forum", "post", postId],
    queryFn: () => api.getPost(postId),
  });

  const removePost = useMutation({
    mutationFn: () => api.deletePost(postId),
    onSuccess: () => {
      toast.success(t("forum.deleted"));
      void queryClient.invalidateQueries({ queryKey: ["forum", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["forum", "boards"] });
      router.replace("/forum");
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : t("globals.errorBody")),
  });

  const removeReply = useMutation({
    mutationFn: (replyId: string) => api.deleteReply(replyId),
    onSuccess: () => {
      toast.success(t("forum.deleted"));
      void queryClient.invalidateQueries({ queryKey: ["forum", "post", postId] });
      void queryClient.invalidateQueries({ queryKey: ["forum", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["forum", "boards"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : t("globals.errorBody")),
  });

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="gap-1.5">
      <Link href="/forum">
        <ArrowLeft className="size-4" />
        {t("forum.backToForum")}
      </Link>
    </Button>
  );

  // A deleted post is gone for good, so a 404 here is a normal outcome, not a
  // failure: it gets the same "back to the forum" exit as a missing page.
  const missing =
    error instanceof ApiClientError && (error.status === 404 || error.code === "NOT_FOUND");

  if (missing) {
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState
          icon={MessageSquare}
          title={t("forum.noPosts")}
          description={t("globals.notFoundBody")}
          action={
            <Button asChild variant="outline">
              <Link href="/forum">{t("forum.backToForum")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t("globals.errorTitle")}
        description={t("globals.errorBody")}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        {backLink}
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  const { post, replies } = data;

  const replyHeader = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{t("forum.replies", { count: replies.length })}</h2>
      {/* The denormalised counter is what the list shows; if the two ever
          disagreed, saying so here beats quietly displaying one of them. */}
      {post.replyCount !== replies.length ? (
        <span className="text-muted-foreground text-xs">
          {t("forum.replyCountLabel", { count: post.replyCount })}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {backLink}

      <article className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {post.pinned ? (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              <Pin className="size-3" />
              {t("forum.pinned")}
            </Badge>
          ) : null}
          <Badge variant="outline" className="text-[11px]">
            {post.boardName}
          </Badge>
          {post.city ? (
            <Badge variant="outline" className="gap-1 text-[11px]">
              <MapPin className="size-3" />
              {cityName(locale, post.city)}
            </Badge>
          ) : null}
          {post.isMine ? (
            <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
              {t("forum.myPost")}
            </span>
          ) : null}
        </div>

        <h1 className="text-2xl leading-tight font-semibold tracking-tight">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/u/${post.author.id}`} className="flex items-center gap-2 hover:underline">
            <Avatar className="size-8 border">
              {post.author.avatar ? (
                <AvatarImage src={post.author.avatar} alt={post.author.name} />
              ) : null}
              <AvatarFallback className="text-xs">
                {post.author.name.slice(0, 1) || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{post.author.name}</span>
          </Link>

          <span className="text-muted-foreground text-xs">
            {t("forum.postedAt", { date: formatDate(post.createdAt, locale) })}
          </span>

          {post.isMine && user ? (
            <span className="ml-auto">
              <ConfirmDeleteButton
                label={t("forum.deletePost")}
                confirmLabel={t("forum.deleteConfirm")}
                disabled={removePost.isPending}
                onConfirm={() => removePost.mutate()}
              />
            </span>
          ) : null}
        </div>

        <Separator />

        {/* Authored text: line breaks are the author's, so they are preserved. */}
        <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{post.body}</div>
      </article>

      <Separator />

      <section className="space-y-4">
        {replyHeader}

        <ReplyBox
          postId={postId}
          onPosted={() => {
            void queryClient.invalidateQueries({ queryKey: ["forum", "post", postId] });
          }}
        />

        {replies.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t("forum.noReplies")}</p>
        ) : (
          <ul className="space-y-3">
            {replies.map((reply) => (
              <li key={reply.id} className="rounded-2xl border p-4">
                <div className="flex items-start gap-3">
                  <Link href={`/u/${reply.author.id}`} className="shrink-0">
                    <Avatar className="size-8 border">
                      {reply.author.avatar ? (
                        <AvatarImage src={reply.author.avatar} alt={reply.author.name} />
                      ) : null}
                      <AvatarFallback className="text-xs">
                        {reply.author.name.slice(0, 1) || "?"}
                      </AvatarFallback>
                    </Avatar>
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/u/${reply.author.id}`} className="text-sm font-medium hover:underline">
                        {reply.author.name}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {formatDate(reply.createdAt, locale)}
                      </span>
                      {reply.isMine ? (
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
                          {t("forum.myReply")}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {reply.body}
                    </p>

                    {reply.isMine && user ? (
                      <div className="mt-2">
                        <ConfirmDeleteButton
                          label={t("forum.deleteReply")}
                          confirmLabel={t("forum.deleteConfirm")}
                          disabled={removeReply.isPending}
                          onConfirm={() => removeReply.mutate(reply.id)}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
