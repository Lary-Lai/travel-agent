"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/components/locale-provider";
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
  const t = useT();
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
    toast.error(error instanceof ApiClientError ? error.message : t("wishlist.actionFailed"));
    invalidate();
  };

  const addMutation = useMutation({
    mutationFn: (wishlistId: string) => api.addToWishlist(wishlistId, listingId),
    onSuccess: (result) => {
      toast.success(t("wishlist.added", { name: result.wishlist.name }));
      markSaved(listingId);
      invalidate();
    },
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: (wishlistId: string) => api.removeFromWishlist(wishlistId, listingId),
    onSuccess: (result) => {
      toast.success(t("wishlist.removedFrom", { name: result.wishlist.name }));
      invalidate();
    },
    onError,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createWishlist(name),
    onSuccess: (result) => {
      setNewName("");
      toast.success(t("wishlist.createdAndAdding", { name: result.wishlist.name }));
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
          <DialogTitle>{t("wishlist.dialogTitle")}</DialogTitle>
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
              {t("wishlist.noLists")}
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
                      <span className="text-muted-foreground text-xs">
                        {t("wishlist.itemCount", { count: wishlist.itemCount })}
                      </span>
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
              placeholder={t("wishlist.createPlaceholder")}
              maxLength={60}
            />
            <Button type="submit" variant="outline" disabled={!newName.trim() || isPending}>
              <Plus className="size-4" />
              {t("wishlist.createCta")}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
