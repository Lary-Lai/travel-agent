"use client";

import { useMutation } from "@tanstack/react-query";
import { CalendarIcon, Loader2, Minus, Plus, ShieldCheck, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

import { HouseRulesPanel } from "@/components/house-rules-panel";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { api, ApiClientError } from "@/lib/api";
import { formatCurrency, formatDateShort, parseDateOnly, toDateOnlyString, todayUtc } from "@/lib/format";
import { calculatePrice } from "@/lib/pricing";
import type { ListingDetail } from "@/types";

/**
 * Booking panel.
 *
 * The displayed breakdown is produced by `calculatePrice` — the exact same
 * module the Booking service uses — so what the user sees always equals what
 * gets stored. The server still recomputes and ignores any client totals.
 */
export function BookingWidget({ listing }: { listing: ListingDetail }) {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  const [range, setRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState(Math.min(2, listing.maxGuests));
  const [datesOpen, setDatesOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const today = useMemo(() => todayUtc(), []);

  const checkIn = range?.from ? toDateOnlyString(range.from) : "";
  const checkOut = range?.to ? toDateOnlyString(range.to) : "";

  const nights =
    checkIn && checkOut
      ? Math.max(
          0,
          Math.round((parseDateOnly(checkOut).getTime() - parseDateOnly(checkIn).getTime()) / 86_400_000),
        )
      : 0;

  const price = useMemo(
    () => calculatePrice(listing.pricePerNight, nights),
    [listing.pricePerNight, nights],
  );

  const booking = useMutation({
    mutationFn: () => api.createBooking({ listingId: listing.id, checkIn, checkOut, guests }),
    onSuccess: (result) => {
      toast.success("房源已为你保留，请完成支付", {
        description: `${result.booking.nights} 晚 · 待支付 ${formatCurrency(result.booking.totalPrice)}`,
      });
      // Hand off to checkout; the booking stays PENDING until it is paid.
      router.push(`/payment/${result.booking.id}`);
    },
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : "预订失败，请稍后重试";
      setErrorMessage(message);
      toast.error(message);
    },
  });

  const handleReserve = () => {
    setErrorMessage(null);

    if (!sessionLoading && !user) {
      toast.error("请先登录后再预订");
      router.push(`/login?redirect=${encodeURIComponent(`/listings/${listing.id}`)}`);
      return;
    }

    if (!checkIn || !checkOut || nights < 1) {
      setErrorMessage("请先选择入住与退房日期");
      return;
    }
    if (guests > listing.maxGuests) {
      setErrorMessage(`该房源最多可住 ${listing.maxGuests} 人`);
      return;
    }

    booking.mutate();
  };

  return (
    <div className="rounded-2xl border p-5 shadow-lg shadow-black/5">
      <div className="flex items-baseline justify-between">
        <p className="text-xl font-semibold">
          {formatCurrency(listing.pricePerNight)}
          <span className="text-muted-foreground text-sm font-normal"> / 晚</span>
        </p>
        <span className="flex items-center gap-1 text-sm">
          <Star className="size-3.5 fill-current" />
          {listing.rating.toFixed(1)}
          <span className="text-muted-foreground">· {listing.reviewCount} 条评价</span>
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border">
        {/* Dates */}
        <Popover open={datesOpen} onOpenChange={setDatesOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="hover:bg-accent/60 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
            >
              <CalendarIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="grid flex-1 grid-cols-2 gap-2 text-sm">
                <span>
                  <span className="text-muted-foreground block text-[11px] font-semibold">入住</span>
                  <span className={checkIn ? "" : "text-muted-foreground"}>
                    {checkIn ? formatDateShort(checkIn) : "选择日期"}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground block text-[11px] font-semibold">退房</span>
                  <span className={checkOut ? "" : "text-muted-foreground"}>
                    {checkOut ? formatDateShort(checkOut) : "选择日期"}
                  </span>
                </span>
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
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
                {nights > 0 ? `共 ${nights} 晚` : "请选择入住与退房日期"}
              </span>
              <Button
                size="sm"
                disabled={nights < 1}
                onClick={() => setDatesOpen(false)}
                type="button"
              >
                确定
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Separator />

        {/* Guests */}
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold">房客</p>
            <p className="text-sm">
              {guests} 位 · 最多 {listing.maxGuests} 人
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setGuests((value) => Math.max(1, value - 1))}
              disabled={guests <= 1}
              aria-label="减少人数"
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => setGuests((value) => Math.min(listing.maxGuests, value + 1))}
              disabled={guests >= listing.maxGuests}
              aria-label="增加人数"
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={handleReserve}
        disabled={booking.isPending}
      >
        {booking.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            正在预订…
          </>
        ) : nights > 0 ? (
          "确认预订"
        ) : (
          "选择日期后预订"
        )}
      </Button>

      {errorMessage ? (
        <p className="text-destructive mt-2 text-center text-xs">{errorMessage}</p>
      ) : (
        <p className="text-muted-foreground mt-2 text-center text-xs">
          演示项目，不会产生真实扣款
        </p>
      )}

      {/* Price breakdown */}
      {nights > 0 ? (
        <div className="mt-5 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground underline decoration-dotted">
              {formatCurrency(listing.pricePerNight)} × {nights} 晚
            </span>
            <span className="tabular-nums">{formatCurrency(price.roomPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground underline decoration-dotted">清洁费</span>
            <span className="tabular-nums">{formatCurrency(price.cleaningFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground underline decoration-dotted">服务费</span>
            <span className="tabular-nums">{formatCurrency(price.serviceFee)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>总价</span>
            <span className="tabular-nums">{formatCurrency(price.totalPrice)}</span>
          </div>
        </div>
      ) : null}

      <p className="text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-xs">
        <ShieldCheck className="size-3.5" />
        价格由服务端重新计算，保证安全
      </p>

      {/* Check-in logistics live here so they are reachable at the moment of
          deciding, without pushing the price breakdown off the panel. */}
      <div className="mt-3">
        <HouseRulesPanel rules={listing.houseRules} title={listing.title} variant="inline" />
      </div>
    </div>
  );
}
