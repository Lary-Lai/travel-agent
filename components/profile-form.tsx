"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarDays, Check, Loader2, LogIn, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { useSession } from "@/components/session-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError } from "@/lib/api";
import { PRESET_AVATARS } from "@/lib/avatars";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SessionUserDto } from "@/types";

/**
 * Preset avatars, bundled locally (see lib/avatars.ts). They used to come from
 * i.pravatar.cc, which now 403s every request — most of the grid showed as
 * broken images.
 */
const AVATAR_PRESETS = PRESET_AVATARS;

/**
 * Profile page.
 *
 * Splits session handling from the editor so the editor can initialise its form
 * state directly from the resolved user. Seeding state from a prop via
 * useEffect would cause a cascading render (and is flagged by the React lint
 * rules); `key` remounts the editor if the account changes.
 */
export function ProfileForm() {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon={LogIn}
        title="登录后编辑个人主页"
        description="修改昵称与头像、查看账号信息、修改密码。"
        action={
          <Button asChild className="gap-2">
            <Link href="/login?redirect=%2Fprofile">
              <LogIn className="size-4" />
              去登录
            </Link>
          </Button>
        }
      />
    );
  }

  return <ProfileEditor key={user.id} user={user} />;
}

function ProfileEditor({ user }: { user: SessionUserDto }) {
  const { refresh } = useSession();

  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar ?? "");
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const { data: wishlists } = useQuery({ queryKey: ["wishlists"], queryFn: api.listWishlists });
  const { data: trips } = useQuery({ queryKey: ["bookings"], queryFn: api.listBookings });

  const profileMutation = useMutation({
    mutationFn: () => api.updateProfile({ name: name.trim(), avatar }),
    onSuccess: async (result) => {
      await refresh();
      toast.success("资料已更新", { description: `昵称：${result.user.name}` });
    },
    onError: (error) =>
      toast.error(error instanceof ApiClientError ? error.message : "保存失败，请稍后重试"),
  });

  const passwordMutation = useMutation({
    mutationFn: () => api.changePassword(passwords),
    onSuccess: () => {
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("密码已修改", { description: "下次登录请使用新密码" });
    },
    onError: (error) => {
      const details = (error as ApiClientError)?.details as
        | Array<{ path: string; message: string }>
        | undefined;
      toast.error(
        details?.[0]?.message ??
          (error instanceof ApiClientError ? error.message : "修改失败，请稍后重试"),
      );
    },
  });

  const dirty = name.trim() !== user.name || avatar !== (user.avatar ?? "");
  const passwordReady =
    passwords.currentPassword.length > 0 &&
    passwords.newPassword.length >= 8 &&
    passwords.newPassword === passwords.confirmPassword;

  const favouriteCount =
    wishlists?.wishlists.reduce((sum, wishlist) => sum + wishlist.itemCount, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">个人主页</h1>
        <p className="text-muted-foreground mt-1 text-sm">管理你的公开资料与账号安全</p>
      </div>

      {/* ------------------------------------------------------- account meta */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "心愿单", value: `${wishlists?.wishlists.length ?? "—"} 个` },
          { label: "收藏房源", value: `${wishlists ? favouriteCount : "—"} 个` },
          { label: "行程订单", value: `${trips?.bookings.length ?? "—"} 笔` },
          { label: "注册时间", value: formatDate(user.createdAt) },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border p-4">
            <p className="text-muted-foreground text-xs">{tile.label}</p>
            <p className="mt-1 text-sm font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* -------------------------------------------------------- profile */}
        <section className="space-y-5 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <BadgeCheck className="text-primary size-4" />
            <h2 className="text-sm font-semibold">公开资料</h2>
          </div>

          <div className="flex items-center gap-4">
            <Avatar className="size-16 border">
              {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
              <AvatarFallback className="text-lg">{name.slice(0, 1) || "?"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 text-sm">
              <p className="font-medium">{name || "未填写昵称"}</p>
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                <Mail className="size-3" />
                {user.email}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>选择头像</Label>
              <span className="text-muted-foreground text-xs">
                {AVATAR_PRESETS.length} 个预设
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAvatar(preset)}
                  aria-label="使用该头像"
                  aria-pressed={avatar === preset}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-full border-2 transition-all",
                    avatar === preset ? "border-primary" : "border-transparent hover:opacity-80",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preset} alt="" className="size-full object-cover" loading="lazy" />
                  {avatar === preset ? (
                    <span className="bg-primary text-primary-foreground absolute inset-0 flex items-center justify-center">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">昵称</Label>
            <Input
              id="name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="怎么称呼你？"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar">头像地址（可选）</Label>
            <Input
              id="avatar"
              value={avatar}
              onChange={(event) => setAvatar(event.target.value)}
              placeholder="https://… 留空则使用默认头像"
            />
            <p className="text-muted-foreground text-xs">
              也可以直接粘贴任意图片链接，或清空后使用昵称首字的默认头像。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => profileMutation.mutate()}
              disabled={!name.trim() || !dirty || profileMutation.isPending}
              className="gap-2"
            >
              {profileMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              保存资料
            </Button>
            {dirty ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setName(user.name);
                  setAvatar(user.avatar ?? "");
                }}
              >
                撤销修改
              </Button>
            ) : null}
          </div>

          <Separator />

          <div className="text-muted-foreground space-y-1.5 text-xs">
            <p className="flex items-center gap-1.5">
              <Mail className="size-3.5" />
              登录邮箱 <span className="text-foreground">{user.email}</span> 不可修改
            </p>
            <p className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              加入于 {formatDate(user.createdAt)}
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- password */}
        <section className="space-y-5 rounded-2xl border p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary size-4" />
            <h2 className="text-sm font-semibold">账号安全</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currentPassword">当前密码</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, currentPassword: event.target.value }))
              }
              placeholder="请输入当前密码"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">新密码</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, newPassword: event.target.value }))
              }
              placeholder="至少 8 位字符"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认新密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={passwords.confirmPassword}
              onChange={(event) =>
                setPasswords((prev) => ({ ...prev, confirmPassword: event.target.value }))
              }
              placeholder="再次输入新密码"
            />
            {passwords.confirmPassword.length > 0 &&
            passwords.newPassword !== passwords.confirmPassword ? (
              <p className="text-destructive text-xs">两次输入的新密码不一致</p>
            ) : null}
          </div>

          <Button
            variant="outline"
            onClick={() => passwordMutation.mutate()}
            disabled={!passwordReady || passwordMutation.isPending}
            className="gap-2"
          >
            {passwordMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            修改密码
          </Button>

          <p className="text-muted-foreground text-xs leading-relaxed">
            修改密码需要验证当前密码，即使登录状态（Cookie）泄露，他人也无法直接改掉你的密码。
            本项目的会话使用 HttpOnly Cookie，有效期 30 天，因此下次访问无需重新登录。
          </p>
        </section>
      </div>
    </div>
  );
}
