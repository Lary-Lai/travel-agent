"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { useSavedStore } from "@/lib/store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  listingTitle: string;
};

/**
 * Choose which wishlist(s) hold a listing.
 * Membership is derived from the wishlist query itself, so the checkboxes are
 * always consistent with the server after each mutation.
 */
export function SaveToWishlistDialog({ open, onOpenChange, listingId, listingTitle }: Props) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const markSaved = useSavedStore((state) => state.markSaved);
  const markRemoved = useSavedStore((state) => state.markRemoved);

  const { data, isLoading } = useQuery({
    queryKey: ["wishlists"],
    queryFn: api.listWishlists,
    enabled: open,
  });

  const wishlists = data?.wishlists ?? [];
  const containingIds = new Set(
    wishlists.filter((w) => w.items.some((item) => item.listingId === listingId)).map((w) => w.id),
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["wishlists"] });
    void queryClient.invalidateQueries({ queryKey: ["saved"] });
  };

  const onError = (error: unknown) => {
    toast.error(error instanceof ApiClientError ? error.message : "操作失败，请稍后重试");
    invalidate();
  };

  const addMutation = useMutation({
    mutationFn: (wishlistId: string) => api.addToWishlist(wishlistId, listingId),
    onSuccess: (result) => {
      toast.success(`已加入「${result.wishlist.name}」`);
      markSaved(listingId);
      invalidate();
    },
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: (wishlistId: string) => api.removeFromWishlist(wishlistId, listingId),
    onSuccess: (result) => {
      toast.success(`已从「${result.wishlist.name}」移除`);
      invalidate();
    },
    onError,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createWishlist(name),
    onSuccess: (result) => {
      setNewName("");
      toast.success(`已创建「${result.wishlist.name}」，正在加入房源`);
      addMutation.mutate(result.wishlist.id);
    },
    onError,
  });

  const isPending = addMutation.isPending || removeMutation.isPending || createMutation.isPending;

  const handleToggle = (wishlistId: string) => {
    if (containingIds.has(wishlistId)) {
      markRemoved(listingId);
      removeMutation.mutate(wishlistId);
    } else {
      markSaved(listingId);
      addMutation.mutate(wishlistId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>保存到心愿单</DialogTitle>
          <DialogDescription className="line-clamp-2">{listingTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : wishlists.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
              还没有心愿单，先创建一个吧
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {wishlists.map((wishlist) => {
                const checked = containingIds.has(wishlist.id);
                return (
                  <li key={wishlist.id}>
                    <button
                      type="button"
                      onClick={() => handleToggle(wishlist.id)}
                      disabled={isPending}
                      className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-60"
                    >
                      <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                      <Bookmark className="text-muted-foreground size-4 shrink-0" />
                      <span className="flex-1 truncate text-sm font-medium">{wishlist.name}</span>
                      <span className="text-muted-foreground text-xs">{wishlist.itemCount} 个房源</span>
                      {isPending && <Loader2 className="size-3.5 animate-spin" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

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
              placeholder="新建心愿单，例如「东京旅行」"
              maxLength={60}
            />
            <Button type="submit" variant="outline" disabled={!newName.trim() || isPending}>
              <Plus className="size-4" />
              创建
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
