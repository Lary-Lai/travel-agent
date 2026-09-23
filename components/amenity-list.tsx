"use client";

import { Building2, Check, ChevronRight, TrendingUp } from "lucide-react";
import { useState } from "react";

import { AmenityIcon } from "@/components/amenity-icon";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ListingAmenityDetail } from "@/types";

/**
 * Amenities as tappable rows.
 *
 * Each one opens an explanation of what the amenity actually means, plus how
 * common it is in this city — computed from real listings rather than a
 * marketing line.
 */
export function AmenityList({
  amenities,
  cityLabel,
  cityListingCount,
}: {
  amenities: ListingAmenityDetail[];
  cityLabel: string;
  cityListingCount: number;
}) {
  const [selected, setSelected] = useState<ListingAmenityDetail | null>(null);

  if (amenities.length === 0) {
    return <p className="text-muted-foreground text-sm">该房源暂未登记设施信息。</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {amenities.map((amenity) => (
          <button
            key={amenity.name}
            type="button"
            onClick={() => setSelected(amenity)}
            className="group hover:border-primary/40 hover:bg-accent/50 flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors"
          >
            <AmenityIcon name={amenity.icon} className="text-muted-foreground size-4 shrink-0" />
            <span className="flex-1 text-sm">{amenity.name}</span>
            <ChevronRight className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>

      <p className="text-muted-foreground mt-3 text-xs">点击任意设施可查看说明与当地普及度</p>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                    <AmenityIcon name={selected.icon} className="size-5" />
                  </span>
                  <div className="min-w-0 text-left">
                    <DialogTitle>{selected.name}</DialogTitle>
                    {selected.category ? (
                      <DialogDescription className="mt-0.5">
                        分类：{selected.category}
                      </DialogDescription>
                    ) : null}
                  </div>
                </div>
              </DialogHeader>

              <p className="text-sm leading-relaxed">
                {selected.description ?? "该设施已包含在房源中。"}
              </p>

              <div className="bg-muted/50 flex items-center gap-2 rounded-lg p-3 text-sm">
                <Check className="size-4 shrink-0 text-emerald-600" />
                <span>本房源提供此项设施</span>
              </div>

              <Separator />

              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp className="size-3.5" />
                    {cityLabel}当地的普及度
                  </span>
                  <span className="font-medium tabular-nums">
                    {selected.cityUsage} / {cityListingCount} 套
                  </span>
                </div>

                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{
                      width: `${
                        cityListingCount > 0
                          ? Math.round((selected.cityUsage / cityListingCount) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
                  <Building2 className="mt-0.5 size-3.5 shrink-0" />
                  {cityLabel}共有 {cityListingCount} 套房源，其中 {selected.cityUsage} 套提供「
                  {selected.name}」。
                  {selected.cityUsage <= cityListingCount * 0.4
                    ? "属于相对少见的设施。"
                    : selected.cityUsage >= cityListingCount * 0.8
                      ? "属于当地相当普遍的设施。"
                      : "属于当地较为常见的设施。"}
                </p>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact non-interactive variant, used where a dialog would be overkill. */
export function AmenityChips({ names, className }: { names: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {names.map((name) => (
        <Badge key={name} variant="secondary" className="font-normal">
          {name}
        </Badge>
      ))}
    </div>
  );
}
