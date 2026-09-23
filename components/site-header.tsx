"use client";

import { Compass, Heart, Loader2, LogOut, Menu, Route, Search, Settings, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/lib/store";

const NAV = [
  { href: "/", label: "首页", icon: Compass },
  { href: "/search", label: "搜索房源", icon: Search },
  { href: "/wishlist", label: "心愿单", icon: Heart },
  { href: "/trips", label: "我的行程", icon: Route },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading, refresh } = useSession();
  const openAgent = useAgentStore((state) => state.setOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await api.logout();
      queryClient.clear();
      await refresh();
      toast.success("已退出登录");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("退出登录失败，请重试");
    } finally {
      setSigningOut(false);
    }
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Mobile nav */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="打开菜单">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-6">
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className="mb-6 flex items-center gap-2"
            >
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
                <Compass className="size-4" />
              </span>
              <span className="font-semibold">旅居 Agent</span>
            </Link>
            <nav className="space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive(item.href) ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Compass className="size-4" />
          </span>
          <span className="hidden text-base font-semibold tracking-tight sm:inline">旅居 Agent</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Night mode */}
        <ThemeToggle />

        {/* AI Agent entry point */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => openAgent(true)}
          className="border-primary/30 text-primary hover:bg-primary/5 gap-1.5"
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">AI 助手</span>
        </Button>

        {/* Account */}
        {isLoading ? (
          <div className="flex size-9 items-center justify-center">
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          </div>
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ring-offset-background focus-visible:ring-ring rounded-full transition-shadow focus-visible:ring-2 focus-visible:ring-offset-2"
                aria-label="账户菜单"
              >
                <Avatar className="size-9 border">
                  {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                  <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs font-normal">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/wishlist" className="cursor-pointer">
                  <Heart className="size-4" />
                  我的心愿单
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/trips" className="cursor-pointer">
                  <Route className="size-4" />
                  我的行程
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/profile" className="cursor-pointer">
                  <Settings className="size-4" />
                  个人主页
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void handleSignOut();
                }}
                disabled={signingOut}
                className="cursor-pointer"
              >
                {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/login">
                <User className="size-4" />
                登录
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">注册</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
