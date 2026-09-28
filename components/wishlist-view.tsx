"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Heart, Loader2, LogIn, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListingCard, ListingGridSkeleton } from "@/components/listing-card";
import { useT } from "@/components/locale-provider";
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
  const t = useT();
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
    toast.error(error instanceof ApiClientError ? error.message : t("wishlist.actionFailed"));
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createWishlist(name),
    onSuccess: (result) => {
      setNewName("");
      toast.success(t("wishlist.created", { name: result.wishlist.name }));
      invalidate();
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWishlist(id),
    onSuccess: () => {
      toast.success(t("wishlist.deleted"));
      setPendingDelete(null);
      invalidate();
    },
    onError,
  });

  const removeItemMutation = useMutation({
    mutationFn: ({ wishlistId, listingId }: { wishlistId: string; listingId: string }) =>
      api.removeFromWishlist(wishlistId, listingId),
    onSuccess: (result) => {
      toast.success(t("wishlist.removedFrom", { name: result.wishlist.name }));
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
        title={t("wishlist.signInTitle")}
        description={t("wishlist.signInBody")}
        action={
          <Button asChild className="gap-2">
            <Link href="/login?redirect=%2Fwishlist">
              <LogIn className="size-4" />
              {t("wishlist.signInCta")}
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
          <h1 className="text-2xl font-semibold tracking-tight">{t("wishlist.pageTitle")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {wishlists.length > 0
              ? t("wishlist.countLine", {
                  lists: wishlists.length,
                  items: wishlists.reduce((sum, w) => sum + w.itemCount, 0),
                })
              : t("wishlist.subtitle")}
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
            placeholder={t("wishlist.newListPlaceholder")}
            maxLength={60}
            className="w-48"
          />
          <Button type="submit" className="gap-2" disabled={!newName.trim() || createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {t("wishlist.createCta")}
          </Button>
        </form>
      </div>

      {isError ? (
        <ErrorState
          title={t("wishlist.loadFailedTitle")}
          description={t("wishlist.loadFailedBody")}
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <ListingGridSkeleton count={4} />
      ) : wishlists.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={t("wishlist.emptyTitle")}
          description={t("wishlist.emptyBody")}
          action={
            <Button asChild variant="outline">
              <Link href="/search">{t("wishlist.browseListings")}</Link>
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
                    {t("wishlist.itemCount", { count: wishlist.itemCount })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive gap-1.5"
                  onClick={() => setPendingDelete({ id: wishlist.id, name: wishlist.name })}
                >
                  <Trash2 className="size-3.5" />
                  {t("common.delete")}
                </Button>
              </div>

              {wishlist.items.length === 0 ? (
                <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
                  {t("wishlist.listEmpty")}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {wishlist.items.map((item) => (
                    <div key={item.id} className="relative">
                      <ListingCard listing={item.listing} />
                      <button
                        type="button"
                        aria-label={t("wishlist.removeAria", { name: wishlist.name })}
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
            <DialogTitle>{t("wishlist.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("wishlist.deleteDialogBody", { name: pendingDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("wishlist.deleteConfirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
