"use client";

import { Compass, ChevronDown, Heart, Loader2, LogOut, Menu, MessagesSquare, Route, Search, Settings, Sparkles, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { NotificationBell } from "@/components/notification-bell";
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
import { useHoverMenu } from "@/lib/use-hover-menu";
import { useAgentStore } from "@/lib/store";

const NAV = [
  { href: "/", key: "nav.home", icon: Compass },
  { href: "/search", key: "nav.search", icon: Search },
  { href: "/wishlist", key: "nav.wishlist", icon: Heart },
  { href: "/trips", key: "nav.trips", icon: Route },
  { href: "/forum", key: "nav.forum", icon: MessagesSquare },
  { href: "/friends", key: "nav.friends", icon: Users },
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

  /**
   * Hover-opened account menu. The mechanics — the 250ms close delay, the hover
   * guard that stops a click from toggling a hover-opened menu shut, and the
   * Escape bypass — live in `useHoverMenu`, shared with the language and theme
   * pickers rather than copied into each.
   */
  const accountMenu = useHoverMenu();

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

        {/* Notifications. Signed-in visitors only: the endpoint needs a session,
            and an anonymous bell would be a button that only ever 401s. */}
        {user ? <NotificationBell /> : null}

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
          /*
           * `modal={false}` is required, not a preference.
           *
           * Radix's DropdownMenu is modal by default, and a modal menu sets
           * `pointer-events: none` on the rest of the page while it is open. That
           * breaks a *hover*-triggered menu in a loop: the avatar stops receiving
           * pointer events, so the browser fires `pointerleave` on it, the delayed
           * close fires, the menu closes, pointer events come back, `pointerenter`
           * fires again and it reopens — measured as `bodyPointer` cycling
           * none/none/auto on a ~300ms period, which is the flicker a user sees.
           *
           * It is also the correct semantics for a hover card: the rest of the page
           * must stay live, so that moving the pointer anywhere else behaves like
           * moving a pointer, not like dismissing a modal.
           */
          <DropdownMenu
            modal={false}
            open={accountMenu.open}
            onOpenChange={accountMenu.onOpenChange}
          >
            {/* The hover area is the avatar *and* the chevron, so the affordance
                and the trigger are the same target. */}
            <div {...accountMenu.triggerProps} className="flex items-center">
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group/account ring-offset-background focus-visible:ring-ring flex items-center gap-1 rounded-full transition-shadow focus-visible:ring-2 focus-visible:ring-offset-2"
                  aria-label={t("common.account")}
                >
                  <Avatar className="size-9 border">
                    {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                    <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {/* Says "this opens something" without needing a hover to find out.
                      Sized and coloured to actually be noticed: at 14px of muted grey
                      it was measurable but easy to miss, which defeats an affordance. */}
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground group-hover/account:text-foreground size-4 shrink-0 transition-transform duration-200",
                      accountMenu.open && "rotate-180",
                    )}
                  />
                </button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent align="end" className="w-60" {...accountMenu.contentProps}>
              <DropdownMenuLabel className="flex items-center gap-2 py-2">
                <Avatar className="size-8 border">
                  {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                  <AvatarFallback className="text-xs">
                    {user.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs font-normal">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild onSelect={accountMenu.closeNow}>
                <Link href="/profile" className="cursor-pointer">
                  <User className="size-4" />
                  {t("common.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={accountMenu.closeNow}>
                <Link href="/wishlist" className="cursor-pointer">
                  <Heart className="size-4" />
                  {t("nav.wishlist")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={accountMenu.closeNow}>
                <Link href="/trips" className="cursor-pointer">
                  <Route className="size-4" />
                  {t("nav.trips")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={accountMenu.closeNow}>
                <Link href="/friends" className="cursor-pointer">
                  <Users className="size-4" />
                  {t("nav.friends")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={accountMenu.closeNow}>
                <Link href="/settings" className="cursor-pointer">
                  <Settings className="size-4" />
                  {t("account.settingsTitle")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  accountMenu.closeNow();
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
