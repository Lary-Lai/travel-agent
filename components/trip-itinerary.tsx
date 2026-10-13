"use client";

import { CalendarDays, Minus, Plus, X } from "lucide-react";
import Link from "next/link";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { MAX_PLAN_DAY } from "@/lib/plan-limits";
import { cn } from "@/lib/utils";
import type { PlanItemDto } from "@/types";

/**
 * The itinerary: which listing belongs to which day.
 *
 * ## Days, not dates
 *
 * The day control is a plain "day N" stepper rather than a date picker, matching the
 * data model. People plan a trip before they know the dates, and a plan that shifts by a
 * day should not need every item moved by hand.
 *
 * ## Why the empty state spells out the action
 *
 * "No itinerary yet" tells the user nothing about how to make one. The empty state names
 * the control that does it ("the plus next to a place") and the day it will land in, so
 * the next step is not a guess.
 *
 * ## Why the plan is read from the server, not local state
 *
 * The same plan is written by two actors — the user clicking, and the assistant calling
 * `addToPlan` — so the server is the only place that knows the truth. Every mutation
 * returns the whole plan and the caller replaces its cache with it.
 */
type Props = {
  items: PlanItemDto[];
  days: number;
  selectedDay: number;
  onSelectDay: (day: number) => void;
  onRemove: (item: PlanItemDto) => void;
  pending: boolean;
  /** Signed-out visitors can look, but the plan needs an account. */
  isAuthenticated: boolean;
};

export function TripItinerary({
  items,
  days,
  selectedDay,
  onSelectDay,
  onRemove,
  pending,
  isAuthenticated,
}: Props) {
  const t = useT();

  const byDay = new Map<number, PlanItemDto[]>();
  for (const item of items) {
    const list = byDay.get(item.day) ?? [];
    list.push(item);
    byDay.set(item.day, list);
  }
  // Days with nothing in them are shown anyway around the selected one, so the shape of
  // the trip stays visible while it is being built rather than collapsing as you edit.
  const dayNumbers = [...new Set([1, ...byDay.keys(), selectedDay])].sort((a, b) => a - b);

  return (
    <section className="space-y-4 rounded-2xl border p-5" data-trip-itinerary="">
      <div className="flex items-center gap-2">
        <CalendarDays className="text-primary size-4" />
        <h2 className="text-sm font-semibold">{t("plan.itinerary")}</h2>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {items.length > 0 ? t("plan.planCount", { count: items.length, days }) : ""}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{t("plan.itineraryHint")}</p>

      {/* Which day the next added listing lands in. */}
      <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-xl px-3 py-2">
        <span className="text-xs">{t("plan.planning")}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t("plan.day", { day: Math.max(1, selectedDay - 1) })}
            disabled={selectedDay <= 1}
            onClick={() => onSelectDay(selectedDay - 1)}
          >
            <Minus className="size-3" />
          </Button>
          <span className="min-w-16 text-center text-xs font-medium">
            {t("plan.day", { day: selectedDay })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t("plan.day", { day: Math.min(MAX_PLAN_DAY, selectedDay + 1) })}
            disabled={selectedDay >= MAX_PLAN_DAY}
            onClick={() => onSelectDay(selectedDay + 1)}
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </div>

      {!isAuthenticated ? (
        <p className="text-muted-foreground text-xs">{t("plan.planLogin")}</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("plan.planEmpty", { day: selectedDay })}</p>
      ) : (
        <ul className="space-y-3">
          {dayNumbers.map((day) => {
            const entries = byDay.get(day) ?? [];
            return (
              <li key={day} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={cn(
                    "text-xs font-medium transition-colors",
                    day === selectedDay ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t("plan.day", { day })}
                </button>

                {entries.length === 0 ? (
                  <p className="text-muted-foreground pl-3 text-xs">{t("plan.dayEmpty")}</p>
                ) : (
                  <ul className="space-y-1">
                    {entries.map((item) => (
                      <li key={item.id} className="group flex items-start gap-2 rounded-lg pl-3">
                        <span className="bg-primary/60 mt-1.5 size-1.5 shrink-0 rounded-full" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/listings/${item.listing.id}`}
                            className="hover:text-primary line-clamp-1 text-xs transition-colors"
                          >
                            {item.listing.title}
                          </Link>
                          <span className="text-muted-foreground text-[11px] tabular-nums">
                            {item.listing.location} · {formatPrice(item.listing.pricePerNight)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={`${t("plan.removeFromPlan")} ${item.listing.title}`}
                          disabled={pending}
                          onClick={() => onRemove(item)}
                        >
                          <X className="size-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
