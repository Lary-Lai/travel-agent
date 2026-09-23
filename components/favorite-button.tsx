"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { SaveToWishlistDialog } from "@/components/save-to-wishlist-dialog";
import { useSession } from "@/components/session-provider";
import { cn } from "@/lib/utils";
import { useSavedStore } from "@/lib/store";

type Props = {
  listingId: string;
  listingTitle: string;
  /** `overlay` renders the floating white circle used on listing cards. */
  variant?: "overlay" | "plain";
  className?: string;
};

export function FavoriteButton({ listingId, listingTitle, variant = "overlay", className }: Props) {
  const { user, isLoading } = useSession();
  const saved = useSavedStore((state) => state.ids.has(listingId));
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = (event: React.MouseEvent) => {
    // Cards are wrapped in a Link — never navigate when toggling the heart.
    event.preventDefault();
    event.stopPropagation();

    if (isLoading) return;

    if (!user) {
      toast.error("请先登录后再收藏房源", {
        action: {
          label: "去登录",
          onClick: () => router.push(`/login?redirect=${encodeURIComponent(pathname)}`),
        },
      });
      return;
    }

    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={saved ? "管理收藏" : "收藏房源"}
        aria-pressed={saved}
        className={cn(
          "group/heart inline-flex items-center justify-center transition-transform active:scale-90",
          variant === "overlay" &&
            "absolute top-3 right-3 z-10 size-8 rounded-full bg-black/25 backdrop-blur-sm hover:bg-black/40",
          className,
        )}
      >
        <Heart
          className={cn(
            "size-4 transition-colors",
            saved
              ? "fill-primary text-primary"
              : variant === "overlay"
                ? "fill-black/30 text-white"
                : "text-muted-foreground",
          )}
        />
      </button>

      {user && (
        <SaveToWishlistDialog
          open={open}
          onOpenChange={setOpen}
          listingId={listingId}
          listingTitle={listingTitle}
        />
      )}
    </>
  );
}
