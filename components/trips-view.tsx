"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LogIn, MapPin, Route, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { formatCurrency, formatDate, todayUtc } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TripsView() {
  const queryClient = useQueryClient();
  const { user, isLoading: sessionLoading } = useSession();
  const [pendingCancel, setPendingCancel] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["bookings"],
    queryFn: api.listBookings,
    enabled: Boolean(user),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelBooking(id),
    onSuccess: () => {
      toast.success("订单已取消");
      setPendingCancel(null);
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      // The dates are free again, so search results may change.
      void queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? error.message : "取消失败，请稍后重试");
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
        description="完成预订后，行程会显示在这里，包含房源、日期、人数与订单状态。"
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的行程</h1>
        <p className="text-muted-foreground mt-1 text-sm">管理你的预订，查看入住信息与订单状态</p>
      </div>

      {/* stats */}
      {stats && stats.total > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "全部订单", value: String(stats.total) },
            { label: "即将出行", value: String(stats.upcoming) },
            { label: "累计晚数", value: `${stats.totalNights} 晚` },
            { label: "总支出", value: formatCurrency(stats.totalSpend) },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border p-4">
              <p className="text-muted-foreground text-xs">{item.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
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
            const isPast = new Date(booking.checkIn) < todayUtc();

            return (
              <article
                key={booking.id}
                className={cn(
                  "grid gap-5 rounded-2xl border p-4 sm:grid-cols-[220px_1fr]",
                  isCancelled && "opacity-60",
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
                    className="object-cover"
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

                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={isCancelled ? "outline" : isPast ? "secondary" : "default"}>
                        {isCancelled ? "已取消" : isPast ? "已完成" : booking.statusLabel}
                      </Badge>
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

                    {!isCancelled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPendingCancel({ id: booking.id, title: booking.listing.title })
                        }
                      >
                        取消订单
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(pendingCancel)} onOpenChange={(open) => !open && setPendingCancel(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>取消这笔订单？</DialogTitle>
            <DialogDescription>
              将取消「{pendingCancel?.title}」的预订，取消后日期会重新开放预订。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCancel(null)}>
              再想想
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => pendingCancel && cancelMutation.mutate(pendingCancel.id)}
            >
              确认取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
