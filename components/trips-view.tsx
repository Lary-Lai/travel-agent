"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CreditCard,
  LogIn,
  MapPin,
  Route,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { CancelBookingDialog } from "@/components/cancel-booking-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { formatCurrency, formatDate, todayUtc } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BookingDto } from "@/types";

export function TripsView() {
  const queryClient = useQueryClient();
  const { user, isLoading: sessionLoading } = useSession();
  const [cancelling, setCancelling] = useState<BookingDto | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bookings"],
    queryFn: api.listBookings,
    enabled: Boolean(user),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    void queryClient.invalidateQueries({ queryKey: ["listings"] });
  };

  const settleMutation = useMutation({
    mutationFn: (refundId: string) => api.settleRefund(refundId),
    onSuccess: (result) => {
      toast.success(`退款 ${formatCurrency(result.refund.amount)} 已到账`, {
        description: "演示环境：模拟支付渠道完成退款",
      });
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "操作失败，请稍后重试");
    },
  });

  if (sessionLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon={Route}
        title="登录后查看你的行程"
        description="完成预订后，行程会显示在这里，包含房源、日期、人数、订单状态与退款进度。"
        action={
          <Button asChild className="gap-2">
            <Link href="/login?redirect=%2Ftrips">
              <LogIn className="size-4" />
              去登录
            </Link>
          </Button>
        }
      />
    );
  }

  const bookings = data?.bookings ?? [];
  const stats = data?.stats;

  // Refund tiles only appear once there is something to report.
  const statTiles = stats
    ? [
        { label: "全部订单", value: String(stats.total), show: true },
        { label: "待支付", value: String(stats.pending), show: true },
        { label: "即将出行", value: String(stats.upcoming), show: true },
        { label: "累计晚数", value: `${stats.totalNights} 晚`, show: true },
        { label: "总支出", value: formatCurrency(stats.totalSpend), show: true },
        {
          label: "退款处理中",
          value: formatCurrency(stats.refunding),
          show: stats.refunding > 0,
        },
        { label: "已退款", value: formatCurrency(stats.refunded), show: stats.refunded > 0 },
      ].filter((tile) => tile.show)
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的行程</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          管理你的预订，查看入住信息、订单状态与退款进度
        </p>
      </div>

      {statTiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {statTiles.map((tile) => (
            <div key={tile.label} className="rounded-2xl border p-4">
              <p className="text-muted-foreground text-xs">{tile.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{tile.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {isError ? (
        <ErrorState
          title="行程加载失败"
          description="无法获取订单信息，请稍后重试。"
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={Route}
          title="还没有任何行程"
          description="找到一个喜欢的房源，选择日期和人数后即可完成预订。"
          action={
            <Button asChild variant="outline">
              <Link href="/search">去搜索房源</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {bookings.map((booking) => {
            const isCancelled = booking.status === "CANCELLED";
            const isPending = booking.status === "PENDING";
            const isPast = new Date(booking.checkIn) < todayUtc();
            const refund = booking.refund;
            const refundProcessing = refund?.status === "PROCESSING";

            return (
              <article
                key={booking.id}
                className={cn(
                  "grid gap-5 rounded-2xl border p-4 sm:grid-cols-[220px_1fr]",
                  // Muted rather than faded, so refund details stay readable.
                  isCancelled && "bg-muted/30 border-dashed",
                )}
              >
                <Link
                  href={`/listings/${booking.listing.id}`}
                  className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted sm:aspect-square"
                >
                  <Image
                    src={booking.listing.image}
                    alt={booking.listing.title}
                    fill
                    sizes="220px"
                    className={cn("object-cover", isCancelled && "opacity-70 grayscale")}
                  />
                </Link>

                <div className="flex min-w-0 flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/listings/${booking.listing.id}`}
                        className="hover:text-primary line-clamp-1 text-base font-semibold transition-colors"
                      >
                        {booking.listing.title}
                      </Link>
                      <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                        <MapPin className="size-3" />
                        {booking.listing.location} · {booking.listing.propertyTypeLabel}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge
                        variant={isCancelled ? "outline" : isPending || isPast ? "secondary" : "default"}
                        className={cn(
                          isPending && "border-amber-500/30 bg-amber-500/15 text-amber-700",
                        )}
                      >
                        {isCancelled
                          ? "已取消"
                          : isPending
                            ? "待支付"
                            : isPast
                              ? "已完成"
                              : booking.statusLabel}
                      </Badge>
                      {booking.isPaid && booking.paymentMethodLabel ? (
                        <span className="text-muted-foreground text-[11px]">
                          已通过 {booking.paymentMethodLabel} 支付
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-3.5" />
                      {formatDate(booking.checkIn)} – {formatDate(booking.checkOut)}（{booking.nights} 晚）
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" />
                      {booking.guests} 位房客
                    </span>
                  </div>

                  <Separator />

                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <dl className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                      <div>
                        <dt>房费</dt>
                        <dd className="text-foreground tabular-nums">
                          {formatCurrency(booking.roomPrice)}
                        </dd>
                      </div>
                      <div>
                        <dt>清洁费</dt>
                        <dd className="text-foreground tabular-nums">
                          {formatCurrency(booking.cleaningFee)}
                        </dd>
                      </div>
                      <div>
                        <dt>服务费</dt>
                        <dd className="text-foreground tabular-nums">
                          {formatCurrency(booking.serviceFee)}
                        </dd>
                      </div>
                      <div>
                        <dt>总价</dt>
                        <dd className="text-foreground font-semibold tabular-nums">
                          {formatCurrency(booking.totalPrice)}
                        </dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap items-center gap-2">
                      {isPending ? (
                        <Button size="sm" asChild className="gap-1.5">
                          <Link href={`/payment/${booking.id}`}>
                            <CreditCard className="size-3.5" />
                            去支付
                          </Link>
                        </Button>
                      ) : null}

                      {!isCancelled ? (
                        <Button variant="outline" size="sm" onClick={() => setCancelling(booking)}>
                          取消订单
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* ------------------------------------------- refund status */}
                  {isCancelled ? (
                    <div className="rounded-xl border bg-background p-3">
                      {refund ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  refund.status === "SUCCEEDED" &&
                                    "border-emerald-500/30 bg-emerald-500/15 text-emerald-700",
                                  refundProcessing &&
                                    "border-amber-500/30 bg-amber-500/15 text-amber-700",
                                  refund.status === "FAILED" &&
                                    "border-destructive/30 bg-destructive/10 text-destructive",
                                )}
                              >
                                {refund.statusLabel}
                              </Badge>
                              <span className="text-sm font-semibold tabular-nums">
                                {formatCurrency(refund.amount)}
                              </span>
                              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                <Wallet className="size-3" />
                                退回{refund.methodLabel}
                              </span>
                            </div>

                            <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
                              {refund.tierLabel} · {refund.note}
                            </p>
                            <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
                              退款单号 {refund.tradeNo}
                              {refund.completedAt
                                ? ` · 到账于 ${formatDate(refund.completedAt)}`
                                : " · 预计 1-3 个工作日到账"}
                            </p>
                          </div>

                          {refundProcessing ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={settleMutation.isPending}
                              onClick={() => settleMutation.mutate(refund.id)}
                            >
                              <Undo2 className="size-3.5" />
                              模拟退款到账
                            </Button>
                          ) : null}
                        </div>
                      ) : booking.isPaid ? (
                        <p className="text-muted-foreground text-xs">
                          该订单在取消时已超出可退款期，按取消政策无可退款金额。
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          该订单未支付，取消后无需退款，房源日期已释放。
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <CancelBookingDialog
        booking={cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
      />
    </div>
  );
}
