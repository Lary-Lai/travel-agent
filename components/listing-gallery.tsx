"use client";

import { ChevronLeft, ChevronRight, Grid2x2, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Airbnb-style gallery: one hero image plus a 2x2 grid, opening into a
 * keyboard-navigable lightbox.
 */
export function ListingGallery({ images, title }: { images: string[]; title: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const gallery = images.slice(0, 5);
  const open = lightboxIndex !== null;

  const go = (delta: number) => {
    if (lightboxIndex === null) return;
    const next = (lightboxIndex + delta + images.length) % images.length;
    setLightboxIndex(next);
  };

  return (
    <>
      <div className="relative grid grid-cols-1 gap-2 overflow-hidden rounded-2xl md:grid-cols-4 md:grid-rows-2">
        {gallery.map((src, index) => (
          <button
            key={`${src}-${index}`}
            type="button"
            onClick={() => setLightboxIndex(index)}
            className={`group relative overflow-hidden bg-muted ${
              index === 0
                ? "aspect-4/3 md:col-span-2 md:row-span-2 md:aspect-auto md:h-full"
                : "aspect-4/3 md:aspect-auto md:h-full"
            }`}
          >
            <Image
              src={src}
              alt={`${title} 图片 ${index + 1}`}
              fill
              sizes={index === 0 ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
              priority={index === 0}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          </button>
        ))}

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

      {/* ------------------------------------------------------------ lightbox */}
      <Dialog open={open} onOpenChange={(next) => setLightboxIndex(next ? (lightboxIndex ?? 0) : null)}>
        <DialogContent
          showCloseButton={false}
          className="max-w-5xl border-0 bg-transparent p-0 shadow-none sm:max-w-5xl"
        >
          <DialogTitle className="sr-only">{title} 图片浏览</DialogTitle>
          <div className="relative">
            <div className="relative aspect-3/2 w-full overflow-hidden rounded-2xl bg-black/60">
              {lightboxIndex !== null ? (
                <Image
                  src={images[lightboxIndex]}
                  alt={`${title} 图片 ${lightboxIndex + 1}`}
                  fill
                  sizes="90vw"
                  className="object-contain"
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
              <p className="mt-3 text-center text-sm text-white/90 tabular-nums">
                {lightboxIndex + 1} / {images.length}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- full grid overlay */}
      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
          <DialogTitle>{title} · 全部图片</DialogTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {images.map((src, index) => (
              <button
                key={`${src}-all-${index}`}
                type="button"
                onClick={() => {
                  setShowAll(false);
                  setLightboxIndex(index);
                }}
                className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted"
              >
                <Image
                  src={src}
                  alt={`${title} 图片 ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
