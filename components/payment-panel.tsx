"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Check,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useLocale, useT } from "@/components/locale-provider";
import { propertyTypeLabel } from "@/lib/i18n/labels";
import { localizedLocation, localizedTitle } from "@/lib/i18n/listing-text";
import { PAYMENT_WINDOW_MINUTES } from "@/lib/payment";
import { QrPlaceholder } from "@/components/qr-placeholder";
import { SafeImage } from "@/components/safe-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, ApiClientError } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Translate, TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BookingDto, PaymentMethodValue } from "@/types";
import { PAYMENT_METHODS } from "@/types";

/**
 * Per-channel presentation. Styling and icons stay at module scope; the label
 * and hint are translation keys, resolved inside the component because
 * `Translate` is only reachable through the locale context there.
 */
const METHOD_META = {
  WECHAT: {
    labelKey: "payment.methodWechat",
    accent: "#07C160",
    soft: "bg-[#07C160]/10 text-[#07974a]",
    icon: MessageCircle,
    hintKey: "payment.hintWechat",
  },
  ALIPAY: {
    labelKey: "payment.methodAlipay",
    accent: "#1677FF",
    soft: "bg-[#1677FF]/10 text-[#1259c3]",
    icon: Wallet,
    hintKey: "payment.hintAlipay",
  },
  CARD: {
    labelKey: "payment.methodCard",
    accent: "#1F2937",
    soft: "bg-muted text-foreground",
    icon: CreditCard,
    hintKey: "payment.hintCard",
  },
} satisfies Record<
  PaymentMethodValue,
  {
    /** Typed as a key, not `string`, so it can be handed straight to `t()`. */
    labelKey: TranslationKey;
    accent: string;
    soft: string;
    icon: typeof Wallet;
    hintKey: TranslationKey;
  }
>;

/** `METHOD_META` with its keys resolved, as handed to the QR view. */
type ResolvedMethodMeta = Omit<(typeof METHOD_META)[PaymentMethodValue], "labelKey" | "hintKey"> & {
  label: string;
  hint: string;
};

// ------------------------------------------------------------------ card utils

const digitsOnly = (value: string) => value.replace(/\D/g, "");

function formatCardNumber(value: string): string {
  return digitsOnly(value).slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

/** Standard Luhn checksum — the same rule real card forms use client-side. */
function luhnValid(number: string): boolean {
  const digits = digitsOnly(number);
  if (digits.length < 13) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index--) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Card brand from the leading digits. VISA / Mastercard / AMEX are brand names
 * and stay as written; UnionPay alone is localised, because Chinese readers know
 * it as 银联 and everyone else as UnionPay.
 */
function detectBrand(number: string, t: Translate): { name: string; accent: string } | null {
  const digits = digitsOnly(number);
  if (/^4/.test(digits)) return { name: "VISA", accent: "#1A1F71" };
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return { name: "Mastercard", accent: "#EB001B" };
  if (/^62/.test(digits)) return { name: t("payment.brandUnionPay"), accent: "#E60012" };
  if (/^3[47]/.test(digits)) return { name: "AMEX", accent: "#2E77BC" };
  return null;
}

function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ------------------------------------------------------------------- component

export function PaymentPanel({ booking }: { booking: BookingDto }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { locale, t } = useLocale();

  const [method, setMethod] = useState<PaymentMethodValue>("WECHAT");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", holder: "" });
  const [cardError, setCardError] = useState<string | null>(null);
  const [paid, setPaid] = useState<BookingDto | null>(booking.isPaid ? booking : null);

  /**
   * Seconds until the server's deadline, not a local constant.
   *
   * Counting down from a fixed number in the component only *looked* like a
   * deadline: the server ignored it, so a payment could still succeed after the
   * timer hit zero, and the hold blocked its dates indefinitely. This reads the
   * deadline stored on the booking, so the timer and the enforcement agree.
   */
  const deadline = booking.paymentDueAt ? new Date(booking.paymentDueAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paid || deadline === null) return;
    // Ticking `now` rather than decrementing a counter keeps the display correct
    // across a background tab, where interval callbacks are throttled.
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [paid, deadline]);

  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const timedOut = secondsLeft !== null && secondsLeft <= 0;
  const expired = paid === null && (booking.paymentExpired || timedOut);

  /**
   * When the local countdown hits zero, ask the server to agree.
   *
   * The sweep runs on read, so the row is still PENDING in the database at the
   * moment the browser's timer stops. A router refresh re-runs the server
   * component, which reads the booking and therefore cancels the hold — so the
   * record, not just the display, reflects the deadline. (`router.refresh`, not
   * a query invalidation: this page is server-rendered and has no booking query
   * to invalidate.) Guarded on `paymentExpired` so it fires once, not every tick.
   */
  useEffect(() => {
    if (!timedOut || paid !== null || booking.paymentExpired) return;
    router.refresh();
  }, [timedOut, paid, booking.paymentExpired, router]);

  /**
   * The window this booking was given.
   *
   * Read from the shared constant, not re-derived from `paymentDueAt` minus
   * `createdAt`: the deadline is a field that can move (the test suite ages it,
   * and a future "extend my hold" feature would too), and deriving the *rule*
   * from a mutable value reported a nonsense "1 minute" window as soon as it
   * did. A constant cannot drift from itself.
   */
  const paymentWindowMinutes = PAYMENT_WINDOW_MINUTES;

  const meta = useMemo<ResolvedMethodMeta>(() => {
    const { labelKey, hintKey, ...rest } = METHOD_META[method];
    return { ...rest, label: t(labelKey), hint: t(hintKey) };
  }, [method, t]);
  const brand = useMemo(() => detectBrand(card.number, t), [card.number, t]);

  const pay = useMutation({
    mutationFn: () => api.payBooking(booking.id, method),
    onSuccess: (result) => {
      setPaid(result.booking);
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(t("payment.paySuccessToast"));
    },
    onError: (error) => {
      const message = error instanceof ApiClientError ? error.message : t("payment.payFailed");
      setCardError(message);
      toast.error(message);
    },
  });


  const validateCard = (): boolean => {
    if (digitsOnly(card.number).length < 13 || !luhnValid(card.number)) {
      setCardError(t("payment.cardErrorNumber"));
      return false;
    }
    const [month, year] = card.expiry.split("/");
    if (!month || !year || Number(month) < 1 || Number(month) > 12) {
      setCardError(t("payment.cardErrorExpiry"));
      return false;
    }
    if (digitsOnly(card.cvc).length < 3) {
      setCardError(t("payment.cardErrorCvc"));
      return false;
    }
    if (card.holder.trim().length < 2) {
      setCardError(t("payment.cardErrorHolder"));
      return false;
    }
    setCardError(null);
    return true;
  };

  const handlePay = () => {
    setCardError(null);
    if (method === "CARD" && !validateCard()) return;
    pay.mutate();
  };

  // ------------------------------------------------------------- paid state
  if (paid) {
    return (
      <div className="mx-auto max-w-lg space-y-6 rounded-2xl border p-8 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10">
          <BadgeCheck className="size-8 text-emerald-600" />
        </div>

        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("payment.successTitle")}</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{t("payment.successBody")}</p>
        </div>

        <p className="text-3xl font-semibold tabular-nums">{formatCurrency(paid.totalPrice)}</p>

        <dl className="space-y-2.5 rounded-xl border bg-muted/30 p-4 text-left text-sm">
          {(
            [
              ["payment.labelListing", localizedTitle(locale, paid.listing)],
              [
                "payment.labelStayDates",
                `${formatDate(paid.checkIn, locale)} – ${formatDate(paid.checkOut, locale)}`,
              ],
              [
                "payment.labelGuests",
                `${t("common.guests", { count: paid.guests })} · ${t("common.nights", { count: paid.nights })}`,
              ],
              ["payment.labelMethod", paid.paymentMethodLabel ?? "—"],
              ["payment.labelTradeNo", paid.paymentTradeNo ?? "—"],
              ["payment.labelPaidAt", paid.paidAt ? formatDate(paid.paidAt, locale) : "—"],
            ] as const
          ).map(([labelKey, value]) => (
            <div key={labelKey} className="flex justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">{t(labelKey)}</dt>
              <dd className="truncate font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/trips">{t("payment.viewTrips")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/search">{t("payment.browseMore")}</Link>
          </Button>
        </div>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" />
          {t("payment.successDemo")}
        </p>
      </div>
    );
  }

  // ----------------------------------------------------------- expired state
  /**
   * The deadline is a real rule, so running out of time is a terminal state, not
   * a prompt to try again: the server refuses the payment and has released the
   * dates. Showing the disabled checkout here (or a "refresh" button on the QR
   * code) would invite a click that can only fail, so the whole checkout is
   * replaced with the outcome and a route back to booking.
   */
  if (expired) {
    return (
      <div className="mx-auto max-w-lg space-y-6 rounded-2xl border p-8 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-500/10">
          <Clock className="size-8 text-amber-600" />
        </div>

        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t("payment.expiredTitle")}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {t("payment.expiredBody", { minutes: paymentWindowMinutes })}
          </p>
        </div>

        <dl className="space-y-2.5 rounded-xl border bg-muted/30 p-4 text-left text-sm">
          {(
            [
              ["payment.labelListing", localizedTitle(locale, booking.listing)],
              [
                "payment.labelStayDates",
                `${formatDate(booking.checkIn, locale)} – ${formatDate(booking.checkOut, locale)}`,
              ],
              ["payment.labelGuestCount", t("common.guests", { count: booking.guests })],
              ["payment.orderNo", booking.id.slice(-12).toUpperCase()],
            ] as const
          ).map(([labelKey, value]) => (
            <div key={labelKey} className="flex justify-between gap-4">
              <dt className="text-muted-foreground shrink-0">{t(labelKey)}</dt>
              <dd className="truncate font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href={`/listings/${booking.listing.id}`}>{t("payment.expiredRebook")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/trips">{t("payment.expiredTrips")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ checkout UI
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      {/* ------------------------------------------------------ left: methods */}
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("payment.chooseMethod")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("payment.orderNo")}{" "}
            <span className="tabular-nums">{booking.id.slice(-12).toUpperCase()}</span> ·{" "}
            {t("payment.payWithin", { minutes: paymentWindowMinutes })}
          </p>
        </div>

        {/* method tabs */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {PAYMENT_METHODS.map((option) => {
            const optionMeta = METHOD_META[option];
            const active = method === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setMethod(option);
                  setCardError(null);
                }}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all sm:flex-row sm:justify-center sm:p-4 sm:text-sm",
                  active
                    ? "border-transparent shadow-sm ring-2"
                    : "hover:border-foreground/25 hover:bg-accent/50",
                )}
                style={active ? { boxShadow: `0 0 0 2px ${optionMeta.accent}` } : undefined}
              >
                <optionMeta.icon
                  className="size-5 shrink-0"
                  style={{ color: active ? optionMeta.accent : undefined }}
                />
                {t(optionMeta.labelKey)}
              </button>
            );
          })}
        </div>

        {/* method body */}
        <div className="rounded-2xl border p-5 sm:p-6">
          {method === "CARD" ? (
            <CardForm
              card={card}
              setCard={setCard}
              brand={brand}
              error={cardError}
              onFillTestCard={() =>
                setCard({
                  number: "4242 4242 4242 4242",
                  expiry: "12/29",
                  cvc: "123",
                  holder: "ZHANG SAN",
                })
              }
            />
          ) : (
            <QrCheckout
              method={method}
              meta={meta}
              bookingId={booking.id}
              secondsLeft={secondsLeft ?? 0}
            />
          )}
        </div>

        {cardError && method === "CARD" ? (
          <p className="text-destructive text-sm" role="alert">
            {cardError}
          </p>
        ) : null}

        <Button
          size="lg"
          className="w-full gap-2"
          onClick={handlePay}
          disabled={pay.isPending}
          style={method !== "CARD" ? { backgroundColor: meta.accent } : undefined}
        >
          {pay.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("payment.payProcessing")}
            </>
          ) : method === "CARD" ? (
            <>
              <Lock className="size-4" />
              {t("payment.payAmount", { amount: formatCurrency(booking.totalPrice) })}
            </>
          ) : (
            <>
              <Check className="size-4" />
              {t("payment.payDoneDemo")}
            </>
          )}
        </Button>

        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" />
          {t("payment.demoNotice")}
        </p>
      </div>

      {/* ----------------------------------------------------- right: summary */}
      <aside>
        <div className="space-y-4 rounded-2xl border p-5 lg:sticky lg:top-24">
          <h2 className="text-sm font-semibold">{t("payment.orderSummary")}</h2>

          {/* Property photo, full width so the guest can confirm what they booked. */}
          <div className="relative aspect-16/9 w-full overflow-hidden rounded-xl bg-muted">
            <SafeImage
              src={booking.listing.image}
              alt={localizedTitle(locale, booking.listing)}
              sizes="(max-width: 1024px) 100vw, 380px"
            />
          </div>

          <div className="flex gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium">
                {localizedTitle(locale, booking.listing)}
              </p>
              <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">
                {localizedLocation(locale, booking.listing)}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {propertyTypeLabel(t, booking.listing.propertyType)}
              </p>
            </div>
          </div>

          <Separator />

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("payment.labelCheckIn")}</dt>
              <dd>{formatDate(booking.checkIn, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("payment.labelCheckOut")}</dt>
              <dd>{formatDate(booking.checkOut, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("payment.labelGuestCount")}</dt>
              <dd>
                {t("common.guests", { count: booking.guests })} ·{" "}
                {t("common.nights", { count: booking.nights })}
              </dd>
            </div>
          </dl>

          <Separator />

          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {t("payment.nightlyRate", {
                  price: formatCurrency(booking.roomPrice / Math.max(booking.nights, 1)),
                  nights: t("common.nights", { count: booking.nights }),
                })}
              </dt>
              <dd className="tabular-nums">{formatCurrency(booking.roomPrice)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("payment.cleaningFee")}</dt>
              <dd className="tabular-nums">{formatCurrency(booking.cleaningFee)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("payment.serviceFee")}</dt>
              <dd className="tabular-nums">{formatCurrency(booking.serviceFee)}</dd>
            </div>
            <Separator />
            <div className="flex items-baseline justify-between text-base font-semibold">
              <dt>{t("payment.totalDue")}</dt>
              <dd className="tabular-nums">{formatCurrency(booking.totalPrice)}</dd>
            </div>
          </dl>

          <p className="text-muted-foreground rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">
            {t("payment.holdNotice", { date: formatDate(booking.checkIn, locale) })}
          </p>
        </div>
      </aside>
    </div>
  );
}

// --------------------------------------------------------------- QR checkout

/**
 * The scan-to-pay view. It is only ever rendered while the hold is still live —
 * once the deadline passes the panel is replaced by the cancelled state, so this
 * component has no expiry of its own to handle.
 */
function QrCheckout({
  method,
  meta,
  bookingId,
  secondsLeft,
}: {
  method: PaymentMethodValue;
  meta: ResolvedMethodMeta;
  bookingId: string;
  secondsLeft: number;
}) {
  const t = useT();
  const MethodIcon = meta.icon;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium", meta.soft)}>
        <QrCode className="size-3.5" />
        {meta.label}
      </div>

      <div className="relative">
        <QrPlaceholder
          seed={`${method}:${bookingId}`}
          size={200}
          className="rounded-xl border p-2 shadow-sm transition-opacity"
        >
          <span
            className="flex size-8 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: meta.accent }}
          >
            <MethodIcon className="size-4" />
          </span>
        </QrPlaceholder>
      </div>

      <p className="text-muted-foreground max-w-xs text-sm">{meta.hint}</p>

      <p className="text-xs tabular-nums">
        {t("payment.qrCountdown", { time: formatCountdown(secondsLeft) })}
      </p>

      <p className="text-muted-foreground max-w-xs text-[11px] leading-relaxed">
        {t("payment.qrDemo")}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------- card form

function CardForm({
  card,
  setCard,
  brand,
  error,
  onFillTestCard,
}: {
  card: { number: string; expiry: string; cvc: string; holder: string };
  setCard: React.Dispatch<React.SetStateAction<{ number: string; expiry: string; cvc: string; holder: string }>>;
  brand: { name: string; accent: string } | null;
  error: string | null;
  onFillTestCard: () => void;
}) {
  const t = useT();

  return (
    <div className="space-y-5">
      {/* card preview */}
      <div
        className="relative h-44 w-full max-w-sm overflow-hidden rounded-2xl p-5 text-white shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${brand?.accent ?? "#1F2937"} 0%, #111827 100%)`,
        }}
      >
        <div className="flex items-start justify-between">
          <div className="h-8 w-11 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500/80" />
          <span className="text-sm font-semibold tracking-wider">
            {brand?.name ?? "BANK CARD"}
          </span>
        </div>

        <p className="mt-6 font-mono text-lg tracking-widest tabular-nums">
          {card.number || "•••• •••• •••• ••••"}
        </p>

        <div className="mt-5 flex items-end justify-between text-xs">
          <div>
            <p className="text-white/60">{t("payment.cardHolder")}</p>
            <p className="mt-0.5 font-medium uppercase">{card.holder || "YOUR NAME"}</p>
          </div>
          <div>
            <p className="text-white/60">{t("payment.cardExpiry")}</p>
            <p className="mt-0.5 font-medium tabular-nums">{card.expiry || "MM/YY"}</p>
          </div>
          <div className="text-right">
            <CreditCard className="ml-auto size-6 opacity-80" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="card-number">{t("payment.cardNumber")}</Label>
          <Input
            id="card-number"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            value={card.number}
            onChange={(event) =>
              setCard((previous) => ({ ...previous, number: formatCardNumber(event.target.value) }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="card-expiry">{t("payment.cardExpiry")}</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={card.expiry}
            onChange={(event) =>
              setCard((previous) => ({ ...previous, expiry: formatExpiry(event.target.value) }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="card-cvc">{t("payment.cardCvc")}</Label>
          <Input
            id="card-cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="CVC"
            maxLength={4}
            value={card.cvc}
            onChange={(event) =>
              setCard((previous) => ({ ...previous, cvc: digitsOnly(event.target.value).slice(0, 4) }))
            }
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="card-holder">{t("payment.cardHolderName")}</Label>
          <Input
            id="card-holder"
            autoComplete="cc-name"
            placeholder={t("payment.cardHolderPlaceholder")}
            value={card.holder}
            onChange={(event) =>
              setCard((previous) => ({ ...previous, holder: event.target.value.toUpperCase() }))
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
        <p className="text-muted-foreground text-xs">
          {brand
            ? t("payment.cardBrandDetected", { brand: brand.name })
            : t("payment.cardSupported")}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onFillTestCard}>
          {t("payment.cardFillTest")}
        </Button>
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Lock className="size-3.5" />
        {t("payment.secureCard")}
      </p>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
