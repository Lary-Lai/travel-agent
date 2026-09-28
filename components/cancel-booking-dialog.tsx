"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Info, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { useT } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { formatCurrency, formatDateRange } from "@/lib/format";
import type { TranslationKey } from "@/lib/i18n";
import { POLICY_TABLE } from "@/lib/refund";
import { cn } from "@/lib/utils";
import type { BookingDto } from "@/types";

/**
 * Cancellation confirmation.
 *
 * Fetches a real refund quote from the server before showing anything, so the
 * amount the user agrees to is exactly what the cancellation will record. The
 * policy table is always visible — no surprises.
 */
export function CancelBookingDialog({
  booking,
  onOpenChange,
}: {
  booking: BookingDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const open = Boolean(booking);

  const { data, isLoading } = useQuery({
    queryKey: ["refund-quote", booking?.id],
    queryFn: () => api.getRefundQuote(booking!.id),
    enabled: open,
    staleTime: 0,
  });

  const quote = data?.quote;

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelBooking(booking!.id),
    onSuccess: (result) => {
      const refund = result.booking.refund;
      if (refund && refund.amount > 0) {
        toast.success(
          t("trips.cancelSuccessRefund", {
            amount: formatCurrency(refund.amount),
            method: refund.methodLabel,
          }),
          {
            description: t("trips.cancelSuccessRefundBody"),
          },
        );
      } else {
        toast.success(t("trips.cancelSuccess"));
      }
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      // Dates are free again, so search results may change.
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : t("trips.cancelFailed"));
    },
  });

  const tierTone =
    quote?.tier === "FREE"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
      : quote?.tier === "PARTIAL"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-700"
        : "border-destructive/30 bg-destructive/10 text-destructive";

  // Built here (not in the JSX) so each row keeps a typed translation key.
  const breakdown: Array<[TranslationKey, number, number]> = [
    ["trips.refundRoom", quote?.roomRefund ?? 0, booking?.roomPrice ?? 0],
    ["trips.refundCleaning", quote?.cleaningRefund ?? 0, booking?.cleaningFee ?? 0],
    ["trips.refundService", quote?.serviceRefund ?? 0, booking?.serviceFee ?? 0],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("trips.cancelTitle")}</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {booking?.listing.title}
            {booking ? ` · ${formatDateRange(booking.checkIn, booking.checkOut)}` : null}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !quote ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* ------------------------------------------------- refund summary */}
            <div className={cn("rounded-xl border p-4", tierTone)}>
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className="border-current bg-transparent text-current">
                  {quote.tierLabel}
                </Badge>
                {quote.totalPaid > 0 ? (
                  <span className="text-xs opacity-80">
                    {t("trips.paidAmount", { amount: formatCurrency(quote.totalPaid) })}
                  </span>
                ) : null}
              </div>

              <p className="mt-2.5 text-sm leading-relaxed">{quote.description}</p>

              {quote.refundable ? (
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatCurrency(quote.amount)}
                  </span>
                  <span className="text-xs opacity-80">{t("trips.refundOriginalChannel")}</span>
                </div>
              ) : null}
            </div>

            {/* --------------------------------------------------- breakdown */}
            {quote.totalPaid > 0 ? (
              <dl className="space-y-2 rounded-xl border p-4 text-sm">
                {breakdown.map(([label, refunded, paid]) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{t(label)}</dt>
                    <dd
                      className={cn(
                        "tabular-nums",
                        refunded === 0 && "text-muted-foreground line-through",
                      )}
                    >
                      {formatCurrency(refunded)}
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        / {formatCurrency(paid)}
                      </span>
                    </dd>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <dt>{t("trips.refundTotal")}</dt>
                  <dd className="tabular-nums">{formatCurrency(quote.amount)}</dd>
                </div>
              </dl>
            ) : null}

            {/* ------------------------------------------------------ policy */}
            <details className="rounded-xl border p-4 text-sm">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                <Info className="size-3.5" />
                {t("trips.viewPolicy")}
                {quote.totalPaid > 0 && quote.daysUntilCheckIn >= 0 ? (
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    {t("trips.daysUntilCheckIn", { days: quote.daysUntilCheckIn })}
                  </span>
                ) : null}
              </summary>
              <table className="mt-3 w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-1.5 text-left font-normal">{t("trips.policyWindow")}</th>
                    <th className="pb-1.5 text-right font-normal">{t("trips.policyRoom")}</th>
                    <th className="pb-1.5 text-right font-normal">{t("trips.policyCleaning")}</th>
                    <th className="pb-1.5 text-right font-normal">{t("trips.policyService")}</th>
                  </tr>
                </thead>
                <tbody>
                  {POLICY_TABLE.map((row) => (
                    <tr key={row.window} className="border-t">
                      <td className="py-1.5">{row.window}</td>
                      <td className="py-1.5 text-right">{row.room}</td>
                      <td className="py-1.5 text-right">{row.cleaning}</td>
                      <td className="py-1.5 text-right">{row.service}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>

            <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t("trips.cancelNotice")}
              {quote.refundable ? t("trips.cancelNoticeSimulated") : null}
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("trips.keepBooking")}
          </Button>
          <Button
            variant={quote?.refundable ? "destructive" : "default"}
            disabled={cancelMutation.isPending || isLoading}
            onClick={() => cancelMutation.mutate()}
            className="gap-1.5"
          >
            {cancelMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Undo2 className="size-4" />
            )}
            {quote?.refundable
              ? t("trips.confirmCancelRefund", { amount: formatCurrency(quote.amount) })
              : t("trips.confirmCancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small helper so callers can render a "→" affordance in the card. */
export function RefundArrow() {
  return <ArrowRight className="size-3.5" />;
}
