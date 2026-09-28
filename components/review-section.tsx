"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquareQuote, Pencil, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewDto } from "@/types";

const MAX_COMMENT = 600;

/** Interactive 1-5 star picker. */
function StarPicker({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange?: (next: number) => void;
  size?: "sm" | "md";
}) {
  const dimension = size === "sm" ? "size-3.5" : "size-6";

  return (
    <div className="flex items-center gap-0.5" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        const className = cn(
          dimension,
          filled ? "fill-primary text-primary" : "text-muted-foreground/40",
          onChange && "transition-transform hover:scale-110",
        );

        return onChange ? (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} 星`}
            onClick={() => onChange(star)}
          >
            <Star className={className} />
          </button>
        ) : (
          <Star key={star} className={className} />
        );
      })}
    </div>
  );
}

/** Read-only distribution bars. */
function Distribution({ data }: { data: Array<{ stars: number; count: number }> }) {
  const total = data.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="min-w-52 space-y-1.5">
      {data.map((entry) => (
        <div key={entry.stars} className="flex items-center gap-2">
          <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
            {entry.stars} 星
          </span>
          <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <span
              className="bg-primary block h-full rounded-full transition-[width] duration-500"
              style={{ width: total > 0 ? `${(entry.count / total) * 100}%` : "0%" }}
            />
          </span>
          <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
            {entry.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  onEdit,
  onDelete,
  deleting,
}: {
  review: ReviewDto;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <article className="space-y-2.5 rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-9 border">
          {review.author.avatar ? (
            <AvatarImage src={review.author.avatar} alt={review.author.name} />
          ) : null}
          <AvatarFallback className="text-xs">
            {review.author.name.slice(0, 1) || "?"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium">{review.author.name}</p>
            {review.isMine ? (
              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium">
                我的评价
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StarPicker value={review.rating} size="sm" />
            <span className="text-muted-foreground text-xs">{formatDate(review.createdAt)}</span>
          </div>
        </div>

        {review.isMine && onEdit && onDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label="编辑评价">
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive size-7"
              onClick={onDelete}
              disabled={deleting}
              aria-label="删除评价"
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed whitespace-pre-wrap">{review.comment}</p>
    </article>
  );
}

/**
 * Reviews for a listing.
 *
 * Persistence is the point: the server stores one row per (listing, user), so a
 * review is still here on the next login and on another device. The form is the
 * same for writing and editing, because the API upserts.
 */
export function ReviewSection({ listingId }: { listingId: string }) {
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [composing, setComposing] = useState(false);

  const queryKey = ["reviews", listingId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.listReviews(listingId),
  });

  const saveMutation = useMutation({
    mutationFn: () => api.saveReview(listingId, { rating, comment }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result.summary);
      setComposing(false);
      setComment("");
      toast.success(result.review.isMine ? "评价已保存" : "评价已提交", {
        description: "下次登录依然可以看到你的评价。",
      });
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : "提交失败，请稍后重试"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteReview(listingId),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result.summary);
      setComposing(false);
      setComment("");
      toast.success("评价已删除");
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : "删除失败，请稍后重试"),
  });

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </section>
    );
  }

  const summary = data;
  const reviews = summary?.reviews ?? [];
  const mine = summary?.myReview ?? null;
  const storedCount = summary?.count ?? 0;

  const startEdit = () => {
    if (!mine) return;
    setRating(mine.rating);
    setComment(mine.comment);
    setComposing(true);
  };

  const tooShort = comment.trim().length < 4;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <MessageSquareQuote className="text-primary size-4" />
        <h2 className="text-lg font-semibold tracking-tight">房客评价</h2>
        {summary?.average !== null && summary?.average !== undefined ? (
          <span className="text-muted-foreground text-sm">
            {summary.average.toFixed(1)} 分 · {storedCount} 条
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">暂无评价</span>
        )}
      </div>

      {/* Summary panel */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-2xl border p-4">
        <div>
          <p className="text-3xl font-semibold">
            {summary?.average !== null && summary?.average !== undefined
              ? summary.average.toFixed(1)
              : "—"}
          </p>
          <StarPicker value={Math.round(summary?.average ?? 0)} size="sm" />
          <p className="text-muted-foreground mt-1 text-xs">{storedCount} 条本站评价</p>
        </div>

        <Distribution data={summary?.distribution ?? []} />

        {summary && summary.seededCount > 0 ? (
          <p className="text-muted-foreground max-w-56 text-xs leading-relaxed">
            房源历史评分 {summary.seededRating.toFixed(2)} 分，来自 {summary.seededCount} 条早期评价
            （演示数据，无逐条记录）。
          </p>
        ) : null}
      </div>

      {/* Write / edit */}
      {!user ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
          <p className="text-sm">登录后可以发表评价，评价会保存到账号里。</p>
          <Button
            size="sm"
            onClick={() =>
              router.push(`/login?redirect=${encodeURIComponent(`/listings/${listingId}`)}`)
            }
          >
            去登录
          </Button>
        </div>
      ) : mine && !composing ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
          <p className="text-sm">你已经评价过这套房源。</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={startEdit}>
            <Pencil className="size-3.5" />
            编辑我的评价
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border p-4">
          <p className="text-sm font-medium">{mine ? "编辑我的评价" : "写下你的评价"}</p>

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs">评分</span>
            <StarPicker value={rating} onChange={setRating} />
            <span className="text-muted-foreground text-xs">{rating} 星</span>
          </div>

          <Textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT))}
            rows={4}
            placeholder="住得怎么样？位置、卫生、房东沟通、周边环境……"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs tabular-nums">
              {comment.trim().length} / {MAX_COMMENT}
            </span>
            <div className="flex items-center gap-2">
              {composing ? (
                <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
                  取消
                </Button>
              ) : null}
              <Button
                size="sm"
                className="gap-2"
                disabled={tooShort || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {mine ? "保存修改" : "提交评价"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* List */}
      {reviews.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          还没有人评价这套房源，来写第一条吧。
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              deleting={deleteMutation.isPending}
              onEdit={review.isMine ? startEdit : undefined}
              onDelete={review.isMine ? () => deleteMutation.mutate() : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
