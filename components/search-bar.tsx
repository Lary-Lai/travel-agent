"use client";

import { CalendarIcon, MapPin, Minus, Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useLocale } from "@/components/locale-provider";
import { cityName } from "@/lib/i18n/cities";
import { formatDateShort, parseDateOnly, toDateOnlyString, todayUtc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSearchDraftStore, type SearchDraft } from "@/lib/store";

export type SearchBarDestination = { city: string; cityLabel: string };

type Props = {
  variant?: "hero" | "compact";
  className?: string;
  /** Inline style escape hatch — the sticky wrapper drives width/border-radius. */
  style?: React.CSSProperties;
  destinations?: SearchBarDestination[];
  initial?: Partial<SearchDraft>;
  /** When provided, the bar calls this instead of navigating. */
  onSearch?: (draft: SearchDraft) => void;
  /**
   * Controlled mode. The home page renders the same draft in two places — the
   * hero bar and the compact bar that appears once the hero scrolls away — and
   * they must agree, so the owner holds the state and both instances mirror it.
   * Without this each instance would keep its own private copy.
   */
  value?: Partial<SearchDraft>;
  onChange?: (draft: SearchDraft) => void;
};

const MIN_GUESTS = 1;
const MAX_GUESTS = 16;

export function SearchBar({
  variant = "hero",
  className,
  style,
  destinations = [],
  initial,
  onSearch,
  value,
  onChange,
}: Props) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const setDraft = useSearchDraftStore((state) => state.setDraft);

  const [localDestination, setDestination] = useState(initial?.destination ?? "");
  const [localRange, setLocalRange] = useState<DateRange | undefined>(() => {
    if (!initial?.checkIn) return undefined;
    return {
      from: parseDateOnly(initial.checkIn),
      to: initial.checkOut ? parseDateOnly(initial.checkOut) : undefined,
    };
  });
  const [localGuests, setLocalGuests] = useState(initial?.guests ?? 2);

  // In controlled mode the owner's value wins; otherwise the local copy does.
  const controlled = value !== undefined;
  const destination = controlled ? (value.destination ?? "") : localDestination;
  const guests = controlled ? (value.guests ?? 2) : localGuests;
  const range: DateRange | undefined = controlled
    ? value.checkIn
      ? {
          from: parseDateOnly(value.checkIn),
          to: value.checkOut ? parseDateOnly(value.checkOut) : undefined,
        }
      : undefined
    : localRange;

  const draft: SearchDraft = {
    destination,
    checkIn: range?.from ? toDateOnlyString(range.from) : "",
    checkOut: range?.to ? toDateOnlyString(range.to) : "",
    guests,
  };

  /** Single funnel for every edit, so both modes stay in step. */
  const update = (patch: Partial<SearchDraft>) => {
    const next = { ...draft, ...patch };
    if (controlled) onChange?.(next);
    else {
      if (patch.destination !== undefined) setDestination(patch.destination);
      if (patch.guests !== undefined) setLocalGuests(patch.guests);
      if (patch.checkIn !== undefined || patch.checkOut !== undefined) {
        setLocalRange(
          patch.checkIn
            ? {
                from: parseDateOnly(patch.checkIn),
                to: patch.checkOut ? parseDateOnly(patch.checkOut) : undefined,
              }
            : undefined,
        );
      }
    }
  };

  const [openPanel, setOpenPanel] = useState<"destination" | "dates" | "guests" | null>(null);

  const today = useMemo(() => todayUtc(), []);
  const checkIn = draft.checkIn;
  const checkOut = draft.checkOut;

  const submit = () => {
    setDraft(draft);

    if (onSearch) {
      onSearch(draft);
      setOpenPanel(null);
      return;
    }

    const params = new URLSearchParams();
    if (draft.destination) params.set("location", draft.destination);
    if (draft.checkIn) params.set("checkIn", draft.checkIn);
    if (draft.checkOut) params.set("checkOut", draft.checkOut);
    params.set("guests", String(draft.guests));
    router.push(`/search?${params.toString()}`);
  };

  const isHero = variant === "hero";

  const segmentClass = cn(
    "flex flex-col justify-center gap-0.5 rounded-2xl px-4 py-2.5 text-left transition-colors hover:bg-accent/60",
    isHero ? "min-h-[56px]" : "min-h-[48px]",
  );

  const labelClass = "text-[11px] font-semibold tracking-wide text-muted-foreground";
  const valueClass = "truncate text-sm";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn(
        "bg-background border-border flex w-full flex-col gap-2 border p-2 md:flex-row md:items-center md:gap-0 md:rounded-full",
        // The hero variant sits on a gradient, so it needs its own lift. In dark
        // mode the hero's warm glow makes the backdrop behind the card *lighter*
        // than the neutral background, so stepping only to `card` left the two
        // nearly equal. `secondary` (0.269) clears the glow's tinted backdrop,
        // and the ring gives the edge a defined line.
        isHero
          ? "edge-light rounded-3xl shadow-xl shadow-black/10 ring-1 ring-black/5 dark:bg-secondary dark:shadow-black/50 dark:ring-white/20"
          : "rounded-2xl shadow-lg shadow-black/5",
        className,
      )}
      style={style}
    >
      {/* Destination */}
      <Popover
        open={openPanel === "destination"}
        onOpenChange={(open) => setOpenPanel(open ? "destination" : null)}
      >
        <PopoverTrigger asChild>
          <button type="button" className={cn(segmentClass, "flex-1")}>
            <span className={labelClass}>{t("searchBar.destination")}</span>
            <span className={cn(valueClass, !destination && "text-muted-foreground")}>
              {destination || t("searchBar.destinationPlaceholder")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={destination}
              onChange={(event) => update({ destination: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setOpenPanel(null);
                }
              }}
              placeholder={t("searchBar.destinationInput")}
              className="pl-9"
            />
          </div>
          {destinations.length > 0 && (
            <div className="mt-3">
              <p className="text-muted-foreground mb-1.5 px-1 text-xs font-medium">
                {t("searchBar.popular")}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {destinations.map((item) => (
                  <button
                    key={item.city}
                    type="button"
                    onClick={() => {
                      update({ destination: item.city });
                      setOpenPanel(null);
                    }}
                    className="hover:bg-accent rounded-lg px-3 py-2 text-left text-sm transition-colors"
                  >
                    {cityName(locale, item.city)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="hidden h-8 md:block" />

      {/* Dates */}
      <Popover
        open={openPanel === "dates"}
        onOpenChange={(open) => setOpenPanel(open ? "dates" : null)}
      >
        <PopoverTrigger asChild>
          <button type="button" className={cn(segmentClass, "flex-1")}>
            <span className={labelClass}>{t("searchBar.dates")}</span>
            <span className={cn(valueClass, !checkIn && "text-muted-foreground")}>
              {checkIn
                ? `${formatDateShort(checkIn, locale)}${checkOut ? ` – ${formatDateShort(checkOut, locale)}` : ` – ${t("searchBar.selectCheckout")}`}`
                : t("searchBar.datesPlaceholder")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0" collisionPadding={16}>
          <Calendar
            mode="range"
            required={false}
            selected={range}
            onSelect={(next) =>
              update({
                checkIn: next?.from ? toDateOnlyString(next.from) : "",
                checkOut: next?.to ? toDateOnlyString(next.to) : "",
              })
            }
            numberOfMonths={1}
            disabled={{ before: today }}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <span className="text-muted-foreground text-xs">
              {checkIn && checkOut
                ? `${formatDateShort(checkIn, locale)} – ${formatDateShort(checkOut, locale)}`
                : t("searchBar.datePrompt")}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update({ checkIn: "", checkOut: "" })}
              >
                {t("searchBar.clearDates")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!checkIn || !checkOut}
                onClick={() => setOpenPanel(null)}
              >
                {t("common.confirm")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="hidden h-8 md:block" />

      {/* Guests */}
      <Popover
        open={openPanel === "guests"}
        onOpenChange={(open) => setOpenPanel(open ? "guests" : null)}
      >
        <PopoverTrigger asChild>
          <button type="button" className={cn(segmentClass, "md:w-44")}>
            <span className={labelClass}>{t("searchBar.guests")}</span>
            <span className={valueClass}>{t("common.guests", { count: guests })}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground size-4" />
              <span className="text-sm font-medium">{t("searchBar.guests")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => update({ guests: Math.max(MIN_GUESTS, guests - 1) })}
                disabled={guests <= MIN_GUESTS}
                aria-label={t("filters.decrease")}
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-8 text-center text-sm font-medium tabular-nums">{guests}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => update({ guests: Math.min(MAX_GUESTS, guests + 1) })}
                disabled={guests >= MAX_GUESTS}
                aria-label={t("filters.increase")}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">{t("auth.maxGuestsHint", { max: MAX_GUESTS })}</p>
        </PopoverContent>
      </Popover>

      <div className={cn("md:pl-2", isHero ? "md:pr-1" : "md:pr-0")}>
        <Button
          type="submit"
          size={isHero ? "lg" : "default"}
          className={cn("w-full gap-2 md:w-auto", isHero && "h-12 rounded-2xl px-6 md:rounded-full")}
        >
          <Search className="size-4" />
          {t("common.search")}
        </Button>
      </div>

      {/* Compact hint about selected dates, visible on mobile too */}
      {!isHero && !checkIn && (
        <p className="text-muted-foreground flex items-center gap-1.5 px-2 pb-1 text-xs md:hidden">
          <CalendarIcon className="size-3.5" />
          {t("searchBar.noDatesHint")}
        </p>
      )}
    </form>
  );
}
