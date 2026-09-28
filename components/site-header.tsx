"use client";

import { Compass, Heart, Loader2, LogOut, Menu, Route, Search, Settings, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { useT } from "@/components/locale-provider";
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
  { href: "/", key: "nav.home", icon: Compass },
  { href: "/search", key: "nav.search", icon: Search },
  { href: "/wishlist", key: "nav.wishlist", icon: Heart },
  { href: "/trips", key: "nav.trips", icon: Route },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading, refresh } = useSession();
  const t = useT();
  const openAgent = useAgentStore((state) => state.setOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await api.logout();
      queryClient.clear();
      await refresh();
      toast.success(t("common.logout"));
      router.push("/");
      router.refresh();
    } catch {
      toast.error(t("common.logout"));
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
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label={t("common.menu")}
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-6">
            <SheetTitle className="sr-only">{t("common.navigation")}</SheetTitle>
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
                  {t(item.key)}
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
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Language */}
        <LocaleSwitcher />

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
          <span className="hidden sm:inline">{t("nav.aiAgent")}</span>
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
                aria-label={t("common.account")}
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
                  {t("nav.wishlist")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/trips" className="cursor-pointer">
                  <Route className="size-4" />
                  {t("nav.trips")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/profile" className="cursor-pointer">
                  <Settings className="size-4" />
                  {t("common.profile")}
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
                {t("common.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/login">
                <User className="size-4" />
                {t("common.login")}
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">{t("common.register")}</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
