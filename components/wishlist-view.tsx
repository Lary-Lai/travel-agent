"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Heart, Loader2, LogIn, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListingCard, ListingGridSkeleton } from "@/components/listing-card";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";

export function WishlistView() {
  const queryClient = useQueryClient();
  const { user, isLoading: sessionLoading } = useSession();

  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["wishlists"],
    queryFn: api.listWishlists,
    enabled: Boolean(user),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["wishlists"] });
    void queryClient.invalidateQueries({ queryKey: ["saved"] });
  };

  const onError = (error: unknown) => {
    toast.error(error instanceof ApiClientError ? error.message : "操作失败，请稍后重试");
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createWishlist(name),
    onSuccess: (result) => {
      setNewName("");
      toast.success(`已创建「${result.wishlist.name}」`);
      invalidate();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWishlist(id),
    onSuccess: () => {
      toast.success("心愿单已删除");
      setPendingDelete(null);
      invalidate();
    },
    onError,
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ wishlistId, listingId }: { wishlistId: string; listingId: string }) =>
      api.removeFromWishlist(wishlistId, listingId),
    onSuccess: (result) => {
      toast.success(`已从「${result.wishlist.name}」移除`);
      invalidate();
    },
    onError,
  });

  // ------------------------------------------------------------- signed out
  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <ListingGridSkeleton count={4} />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon={Heart}
        title="登录后查看你的心愿单"
        description="把喜欢的房源收藏起来，按「东京旅行」「欧洲之旅」这样的主题分组管理。"
        action={
          <Button asChild className="gap-2">
            <Link href="/login?redirect=%2Fwishlist">
              <LogIn className="size-4" />
              去登录
            </Link>
          </Button>
        }
      />
    );
  }

  const wishlists = data?.wishlists ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">我的心愿单</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {wishlists.length > 0
              ? `共 ${wishlists.length} 个心愿单 · ${wishlists.reduce((sum, w) => sum + w.itemCount, 0)} 个房源`
              : "把喜欢的房源收藏起来，方便之后比较和预订"}
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (!name) return;
            createMutation.mutate(name);
          }}
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="新建心愿单名称"
            maxLength={60}
            className="w-48"
          />
          <Button type="submit" className="gap-2" disabled={!newName.trim() || createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            创建
          </Button>
        </form>
      </div>

      {isError ? (
        <ErrorState
          title="心愿单加载失败"
          description="无法获取你的心愿单，请稍后重试。"
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <ListingGridSkeleton count={4} />
      ) : wishlists.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="还没有任何心愿单"
          description="创建一个心愿单，例如「东京旅行」，然后在房源卡片上点击爱心即可收藏。"
          action={
            <Button asChild variant="outline">
              <Link href="/search">去搜索房源</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-12">
          {wishlists.map((wishlist) => (
            <section key={wishlist.id} className="space-y-4">
              <div className="flex items-center justify-between gap-3 border-b pb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Bookmark className="text-muted-foreground size-4 shrink-0" />
                  <h2 className="truncate text-lg font-semibold tracking-tight">{wishlist.name}</h2>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    {wishlist.itemCount} 个房源
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive gap-1.5"
                  onClick={() => setPendingDelete({ id: wishlist.id, name: wishlist.name })}
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
              </div>

              {wishlist.items.length === 0 ? (
                <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
                  这个心愿单还是空的，去房源页点击爱心添加吧
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {wishlist.items.map((item) => (
                    <div key={item.id} className="relative">
                      <ListingCard listing={item.listing} />
                      <button
                        type="button"
                        aria-label={`从「${wishlist.name}」移除`}
                        onClick={() =>
                          removeItemMutation.mutate({
                            wishlistId: wishlist.id,
                            listingId: item.listingId,
                          })
                        }
                        disabled={removeItemMutation.isPending}
                        className="bg-background/90 hover:bg-destructive hover:text-white absolute top-3 left-3 z-10 inline-flex size-8 items-center justify-center rounded-full text-xs shadow-sm backdrop-blur transition-colors"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除心愿单？</DialogTitle>
            <DialogDescription>
              将删除「{pendingDelete?.name}」以及其中的全部收藏，此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
