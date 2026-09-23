"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Info, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

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
        toast.success(`订单已取消，${formatCurrency(refund.amount)} 将退回${refund.methodLabel}`, {
          description: "退款处理中，预计 1-3 个工作日到账",
        });
      } else {
        toast.success("订单已取消，房源日期已释放");
      }
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      // Dates are free again, so search results may change.
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "取消失败，请稍后重试");
    },
  });

  const tierTone =
    quote?.tier === "FREE"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
      : quote?.tier === "PARTIAL"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-700"
        : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>取消这笔订单？</DialogTitle>
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
                    已支付 {formatCurrency(quote.totalPaid)}
                  </span>
                ) : null}
              </div>

              <p className="mt-2.5 text-sm leading-relaxed">{quote.description}</p>

              {quote.refundable ? (
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums">
                    {formatCurrency(quote.amount)}
                  </span>
                  <span className="text-xs opacity-80">将原路退回</span>
                </div>
              ) : null}
            </div>

            {/* --------------------------------------------------- breakdown */}
            {quote.totalPaid > 0 ? (
              <dl className="space-y-2 rounded-xl border p-4 text-sm">
                {[
                  ["房费退款", quote.roomRefund, booking?.roomPrice ?? 0],
                  ["清洁费退款", quote.cleaningRefund, booking?.cleaningFee ?? 0],
                  ["服务费退款", quote.serviceRefund, booking?.serviceFee ?? 0],
                ].map(([label, refunded, paid]) => (
                  <div key={label as string} className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{label as string}</dt>
                    <dd
                      className={cn(
                        "tabular-nums",
                        (refunded as number) === 0 && "text-muted-foreground line-through",
                      )}
                    >
                      {formatCurrency(refunded as number)}
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        / {formatCurrency(paid as number)}
                      </span>
                    </dd>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <dt>合计退款</dt>
                  <dd className="tabular-nums">{formatCurrency(quote.amount)}</dd>
                </div>
              </dl>
            ) : null}

            {/* ------------------------------------------------------ policy */}
            <details className="rounded-xl border p-4 text-sm">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                <Info className="size-3.5" />
                查看取消政策
                {quote.totalPaid > 0 && quote.daysUntilCheckIn >= 0 ? (
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    （距入住 {quote.daysUntilCheckIn} 天）
                  </span>
                ) : null}
              </summary>
              <table className="mt-3 w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-1.5 text-left font-normal">取消时间</th>
                    <th className="pb-1.5 text-right font-normal">房费</th>
                    <th className="pb-1.5 text-right font-normal">清洁费</th>
                    <th className="pb-1.5 text-right font-normal">服务费</th>
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
              取消后房源日期会立即释放，其他用户可以重新预订。
              {quote.refundable ? "退款为模拟流程，不会产生真实资金变动。" : null}
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            再想想
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
            {quote?.refundable ? `确认取消并退款 ${formatCurrency(quote.amount)}` : "确认取消订单"}
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
