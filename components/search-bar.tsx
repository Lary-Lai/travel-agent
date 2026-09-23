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
import { formatDateShort, parseDateOnly, toDateOnlyString, todayUtc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSearchDraftStore, type SearchDraft } from "@/lib/store";

export type SearchBarDestination = { city: string; cityLabel: string };

type Props = {
  variant?: "hero" | "compact";
  className?: string;
  destinations?: SearchBarDestination[];
  initial?: Partial<SearchDraft>;
  /** When provided, the bar calls this instead of navigating. */
  onSearch?: (draft: SearchDraft) => void;
};

const MIN_GUESTS = 1;
const MAX_GUESTS = 16;

export function SearchBar({
  variant = "hero",
  className,
  destinations = [],
  initial,
  onSearch,
}: Props) {
  const router = useRouter();
  const setDraft = useSearchDraftStore((state) => state.setDraft);

  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (!initial?.checkIn) return undefined;
    return {
      from: parseDateOnly(initial.checkIn),
      to: initial.checkOut ? parseDateOnly(initial.checkOut) : undefined,
    };
  });
  const [guests, setGuests] = useState(initial?.guests ?? 2);

  const [openPanel, setOpenPanel] = useState<"destination" | "dates" | "guests" | null>(null);

  const today = useMemo(() => todayUtc(), []);
  const checkIn = range?.from ? toDateOnlyString(range.from) : "";
  const checkOut = range?.to ? toDateOnlyString(range.to) : "";

  const submit = () => {
    const draft: SearchDraft = { destination: destination.trim(), checkIn, checkOut, guests };
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
        "bg-background border-border flex w-full flex-col gap-2 border p-2 shadow-lg shadow-black/5 md:flex-row md:items-center md:gap-0 md:rounded-full",
        isHero ? "rounded-3xl" : "rounded-2xl",
        className,
      )}
    >
      {/* Destination */}
      <Popover
        open={openPanel === "destination"}
        onOpenChange={(open) => setOpenPanel(open ? "destination" : null)}
      >
        <PopoverTrigger asChild>
          <button type="button" className={cn(segmentClass, "flex-1")}>
            <span className={labelClass}>目的地</span>
            <span className={cn(valueClass, !destination && "text-muted-foreground")}>
              {destination || "想去哪里？"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              autoFocus
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setOpenPanel(null);
                }
              }}
              placeholder="输入城市，例如 东京 / Tokyo"
              className="pl-9"
            />
          </div>
          {destinations.length > 0 && (
            <div className="mt-3">
              <p className="text-muted-foreground mb-1.5 px-1 text-xs font-medium">热门目的地</p>
              <div className="grid grid-cols-2 gap-1">
                {destinations.map((item) => (
                  <button
                    key={item.city}
                    type="button"
                    onClick={() => {
                      setDestination(item.city);
                      setOpenPanel(null);
                    }}
                    className="hover:bg-accent rounded-lg px-3 py-2 text-left text-sm transition-colors"
                  >
                    {item.cityLabel}
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
            <span className={labelClass}>入住 / 退房</span>
            <span className={cn(valueClass, !checkIn && "text-muted-foreground")}>
              {checkIn
                ? `${formatDateShort(checkIn)}${checkOut ? ` – ${formatDateShort(checkOut)}` : " – 选择退房日"}`
                : "选择日期"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0" collisionPadding={16}>
          <Calendar
            mode="range"
            required={false}
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            disabled={{ before: today }}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <span className="text-muted-foreground text-xs">
              {checkIn && checkOut
                ? `${formatDateShort(checkIn)} – ${formatDateShort(checkOut)}`
                : "请选择入住与退房日期"}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setRange(undefined)}>
                清除
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!checkIn || !checkOut}
                onClick={() => setOpenPanel(null)}
              >
                确定
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
            <span className={labelClass}>入住人数</span>
            <span className={valueClass}>{guests} 位房客</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground size-4" />
              <span className="text-sm font-medium">房客</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setGuests((value) => Math.max(MIN_GUESTS, value - 1))}
                disabled={guests <= MIN_GUESTS}
                aria-label="减少人数"
              >
                <Minus className="size-3.5" />
              </Button>
              <span className="w-8 text-center text-sm font-medium tabular-nums">{guests}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setGuests((value) => Math.min(MAX_GUESTS, value + 1))}
                disabled={guests >= MAX_GUESTS}
                aria-label="增加人数"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">最多支持 {MAX_GUESTS} 位房客</p>
        </PopoverContent>
      </Popover>

      <div className={cn("md:pl-2", isHero ? "md:pr-1" : "md:pr-0")}>
        <Button
          type="submit"
          size={isHero ? "lg" : "default"}
          className={cn("w-full gap-2 md:w-auto", isHero && "h-12 rounded-2xl px-6 md:rounded-full")}
        >
          <Search className="size-4" />
          搜索
        </Button>
      </div>

      {/* Compact hint about selected dates, visible on mobile too */}
      {!isHero && !checkIn && (
        <p className="text-muted-foreground flex items-center gap-1.5 px-2 pb-1 text-xs md:hidden">
          <CalendarIcon className="size-3.5" />
          未选择日期时展示全部可订房源
        </p>
      )}
    </form>
  );
}
