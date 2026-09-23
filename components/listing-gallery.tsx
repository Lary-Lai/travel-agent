"use client";

import { ChevronLeft, ChevronRight, Grid2x2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SafeImage } from "@/components/safe-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ListingGalleryImage } from "@/types";

/**
 * Airbnb-style gallery: one hero plus a 2x2 grid on desktop, opening into a
 * keyboard-navigable lightbox with a thumbnail strip.
 *
 * Layout note: the desktop grid uses an explicit container height. Combining
 * `grid-rows-2` (which is `repeat(2, minmax(0,1fr))`) with cells that had
 * `aspect-auto h-full` collapsed every row to zero height — the images loaded
 * fine but had nowhere to render.
 */
export function ListingGallery({
  gallery = [],
  title,
}: {
  gallery?: ListingGalleryImage[];
  title: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const images = gallery.length > 0 ? gallery : [{ url: "", caption: null }];
  const hero = images.slice(0, 5);
  const open = lightboxIndex !== null;

  const go = useCallback(
    (delta: number) => {
      setLightboxIndex((current) => {
        if (current === null) return current;
        return (current + delta + images.length) % images.length;
      });
    },
    [images.length],
  );

  // Arrow-key navigation while the lightbox is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  return (
    <>
      {/* ------------------------------------------------------------ grid */}
      <div className="relative">
        <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-2xl md:h-[26rem] md:grid-cols-4 md:grid-rows-2 lg:h-[30rem]">
          {hero.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setLightboxIndex(index)}
              aria-label={`查看 ${image.caption ?? `图片 ${index + 1}`}`}
              className={cn(
                "group relative overflow-hidden bg-muted",
                index === 0
                  ? // Hero: full width on mobile, 2x2 on desktop.
                    "aspect-4/3 md:col-span-2 md:row-span-2 md:aspect-auto"
                  : // Secondary angles are desktop-only; mobile uses "view all".
                    "hidden md:block md:aspect-auto",
              )}
            >
              <SafeImage
                src={image.url}
                alt={`${title} — ${image.caption ?? `图片 ${index + 1}`}`}
                sizes={
                  index === 0 ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"
                }
                priority={index === 0}
                className="transition-transform duration-500 group-hover:scale-[1.04]"
              />

              {image.caption ? (
                <span className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  {image.caption}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAll(true)}
          className="absolute right-3 bottom-3 gap-2 shadow-sm"
        >
          <Grid2x2 className="size-3.5" />
          查看全部 {images.length} 张
        </Button>
      </div>

      {/* -------------------------------------------------------- lightbox */}
      <Dialog
        open={open}
        onOpenChange={(next) => setLightboxIndex(next ? (lightboxIndex ?? 0) : null)}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-5xl border-0 bg-transparent p-0 shadow-none sm:max-w-5xl"
        >
          <DialogTitle className="sr-only">{title} 图片浏览</DialogTitle>

          <div className="relative">
            <div className="relative aspect-3/2 w-full overflow-hidden rounded-2xl bg-black/60">
              {lightboxIndex !== null ? (
                <SafeImage
                  src={images[lightboxIndex].url}
                  alt={`${title} — ${images[lightboxIndex].caption ?? `图片 ${lightboxIndex + 1}`}`}
                  sizes="90vw"
                  className="object-contain"
                  priority
                />
              ) : null}
            </div>

            <Button
              variant="secondary"
              size="icon"
              className="absolute top-3 right-3 rounded-full"
              onClick={() => setLightboxIndex(null)}
              aria-label="关闭"
            >
              <X className="size-4" />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full"
              onClick={() => go(-1)}
              aria-label="上一张"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full"
              onClick={() => go(1)}
              aria-label="下一张"
            >
              <ChevronRight className="size-4" />
            </Button>

            {lightboxIndex !== null ? (
              <p className="mt-3 text-center text-sm text-white/90">
                {images[lightboxIndex].caption ? (
                  <span className="font-medium">{images[lightboxIndex].caption}</span>
                ) : null}
                <span className="text-white/70 tabular-nums">
                  {images[lightboxIndex].caption ? " · " : ""}
                  {lightboxIndex + 1} / {images.length}
                </span>
              </p>
            ) : null}
          </div>

          {/* Thumbnail strip — jump straight to an angle. */}
          <div className="mt-3 flex justify-center gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={`thumb-${image.url}-${index}`}
                type="button"
                onClick={() => setLightboxIndex(index)}
                aria-label={image.caption ?? `图片 ${index + 1}`}
                className={cn(
                  "relative size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all sm:size-16",
                  index === lightboxIndex
                    ? "border-white opacity-100"
                    : "border-transparent opacity-55 hover:opacity-90",
                )}
              >
                <SafeImage src={image.url} alt="" sizes="64px" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------ full grid overlay */}
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
          <DialogTitle>
            {title} · 全部 {images.length} 张
          </DialogTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {images.map((image, index) => (
              <button
                key={`all-${image.url}-${index}`}
                type="button"
                onClick={() => {
                  setShowAll(false);
                  setLightboxIndex(index);
                }}
                className="group relative aspect-4/3 overflow-hidden rounded-xl bg-muted"
              >
                <SafeImage
                  src={image.url}
                  alt={`${title} — ${image.caption ?? `图片 ${index + 1}`}`}
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="transition-transform duration-500 group-hover:scale-[1.04]"
                />
                {image.caption ? (
                  <span className="absolute bottom-2.5 left-2.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                    {image.caption}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
