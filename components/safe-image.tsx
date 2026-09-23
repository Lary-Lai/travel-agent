"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * `next/image` that degrades gracefully.
 *
 * When a photo fails to load, the browser renders the alt text wherever the
 * element happens to sit — with `fill` + `object-cover` that ends up stranded at
 * the top of the box. Instead we swap in a centred placeholder, so a broken
 * image looks deliberate rather than broken.
 *
 * Must be placed inside a positioned (`relative`) container, same as `fill`.
 */
export function SafeImage({
  src,
  alt,
  sizes,
  priority = false,
  className,
  fallbackClassName,
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={cn(
          "bg-muted text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center",
          fallbackClassName,
        )}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="size-5 shrink-0 opacity-50" aria-hidden />
        <span className="line-clamp-3 text-[11px] leading-snug">{alt}</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
