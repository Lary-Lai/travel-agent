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
          "group/heart inline-flex items-center justify-center transition-all active:scale-90",
          // The overlay sits on top of an arbitrary photo, so it has to carry its
          // own contrast instead of relying on the image behind it. The previous
          // 25%-black disc with a 30%-black heart read as "there is no button
          // here" on bright photos. A 45% disc plus a hairline white ring and a
          // shadow stays legible on light and dark images alike, and the saved
          // state flips to a white disc with a red heart so the two states are
          // unmistakable at a glance.
          variant === "overlay" && [
            "absolute top-3 right-3 z-10 size-9 rounded-full ring-1 backdrop-blur-md",
            "duration-200",
            saved
              ? "bg-white/95 ring-black/10 shadow-md hover:bg-white"
              : "bg-black/45 ring-white/25 shadow-sm hover:bg-black/65",
          ],
          className,
        )}
      >
        <Heart
          className={cn(
            "size-[18px] transition-colors",
            saved
              ? "fill-primary text-primary"
              : variant === "overlay"
                ? "fill-white/30 text-white"
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
