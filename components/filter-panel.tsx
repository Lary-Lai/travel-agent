"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Minus, Plus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ListingSearchInput, PropertyTypeValue } from "@/types";
import { PROPERTY_TYPE_LABELS } from "@/types";

const PROPERTY_TYPES: PropertyTypeValue[] = [
  "APARTMENT",
  "HOUSE",
  "HOTEL",
  "VILLA",
  "LOFT",
  "GUESTHOUSE",
];

/** Amenities surfaced as quick filters (the long tail stays on the detail page). */
const QUICK_AMENITIES = [
  "地铁附近",
  "无线网络",
  "厨房",
  "空调",
  "洗衣机",
  "免费停车",
  "游泳池",
  "含早餐",
  "专用办公区",
  "可带宠物",
];

type Props = {
  value: ListingSearchInput;
  onChange: (patch: Partial<ListingSearchInput>) => void;
  onReset: () => void;
  className?: string;
};

export function FilterPanel({ value, onChange, onReset, className }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["meta"],
    queryFn: api.getMeta,
    staleTime: 5 * 60_000,
  });

  const bounds = data?.priceBounds ?? { min: 0, max: 3000 };
  const amenityNames = new Set(
    (data?.amenities ?? []).flatMap((group) => group.items.map((item) => item.name)),
  );

  const min = value.priceMin ?? bounds.min;
  const max = value.priceMax ?? bounds.max;

  const toggleAmenity = (name: string) => {
    const current = value.amenities ?? [];
    const next = current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name];
    onChange({ amenities: next.length > 0 ? next : undefined });
  };

  const guests = value.guests ?? 0;

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">筛选条件</h2>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          重置
        </Button>
      </div>

      {/* ---------------------------------------------------------- price */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">每晚价格</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatPrice(min)} – {formatPrice(max)}
            {max >= bounds.max ? "+" : ""}
          </span>
        </div>

        {isLoading ? (
          <Skeleton className="h-2 w-full" />
        ) : (
          <Slider
            min={bounds.min}
            max={bounds.max}
            step={10}
            value={[min, max]}
            onValueChange={([nextMin, nextMax]) =>
              onChange({
                priceMin: nextMin <= bounds.min ? undefined : nextMin,
                priceMax: nextMax >= bounds.max ? undefined : nextMax,
              })
            }
            className="py-2"
          />
        )}

        <div className="text-muted-foreground flex justify-between text-[11px] tabular-nums">
          <span>{formatPrice(bounds.min)}</span>
          <span>{formatPrice(bounds.max)}</span>
        </div>
      </section>

      <Separator />

      {/* --------------------------------------------------------- guests */}
      <section className="space-y-3">
        <Label className="text-sm font-medium">入住人数</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onChange({ guests: guests <= 3 ? undefined : guests - 1 })}
            disabled={guests === 0}
            aria-label="减少人数"
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="min-w-16 text-center text-sm tabular-nums">
            {guests === 0 ? "不限" : `${guests} 位`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onChange({ guests: guests === 0 ? 2 : Math.min(16, guests + 1) })}
            disabled={guests >= 16}
            aria-label="增加人数"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </section>

      <Separator />

      {/* -------------------------------------------------- property type */}
      <section className="space-y-3">
        <Label className="text-sm font-medium">房源类型</Label>
        <div className="flex flex-wrap gap-2">
          {PROPERTY_TYPES.map((type) => {
            const active = value.propertyType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ propertyType: active ? undefined : type })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:border-primary/40 hover:bg-accent",
                )}
              >
                {PROPERTY_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ------------------------------------------------------ amenities */}
      <section className="space-y-3">
        <Label className="text-sm font-medium">设施与服务</Label>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {QUICK_AMENITIES.filter((name) => amenityNames.has(name)).map((name) => {
              const checked = value.amenities?.includes(name) ?? false;
              return (
                <div key={name} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`amenity-${name}`}
                    checked={checked}
                    onCheckedChange={() => toggleAmenity(name)}
                  />
                  <Label
                    htmlFor={`amenity-${name}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {name}
                  </Label>
                </div>
              );
            })}
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
          </div>
        )}
      </section>
    </div>
  );
}
