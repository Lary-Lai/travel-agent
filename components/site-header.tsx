"use client";

import { Compass, ChevronDown, Heart, Loader2, LogOut, Menu, MessagesSquare, Route, Search, Sparkles, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
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
  { href: "/forum", key: "nav.forum", icon: MessagesSquare },
  { href: "/friends", key: "nav.friends", icon: Users },
] as const;

/**
 * How long the pointer may be away from the trigger *and* the menu before the
 * menu closes.
 *
 * This delay is the whole trick of a hover card. The menu is portalled to the
 * body and offset from the avatar, so travelling from one to the other briefly
 * leaves both — closing on the first `pointerleave` would make the menu
 * impossible to reach. 250ms is long enough for that trip and short enough not
 * to feel sticky.
 *
 * (A "bridge" element — transparent padding bridging the gap — is the other
 * common fix, but it cannot work here: the content is portalled, so a padding
 * div inside the trigger is not an ancestor of the menu and never receives the
 * pointer. The 4px offset takes ~10ms to cross at normal pointer speed, which
 * the delay covers by a wide margin.)
 */
const HOVER_CLOSE_DELAY = 250;

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
   * Account menu: hover opens it, with a delayed close (see HOVER_CLOSE_DELAY).
   *
   * The menu is *controlled* because hover has to drive it, and two details are
   * easy to get wrong:
   *
   *  - `hoveringAccount` is a ref, not state: it is read inside an event handler
   *    that decides whether to honour a close request, and storing it in state
   *    would mean the handler closes over a stale value.
   *  - a mouse user clicking the avatar while the menu is already open would
   *    otherwise toggle it shut and then leave it shut, because no new
   *    `pointerenter` fires while the pointer has not moved. So a close request
   *    that arrives *while the pointer is inside* is ignored — for mouse users
   *    the pointer leaving is what closes it. Touch and keyboard are unaffected,
   *    so tapping still toggles and Escape still works.
   */
  const [accountOpen, setAccountOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringAccount = useRef(false);
  const lastPointerType = useRef<string>("mouse");
  /** Set when the close is intentional (a menu item was chosen), not hover. */
  const bypassHoverGuard = useRef(false);

  const cancelAccountClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openAccount = useCallback(
    (pointerType: string) => {
      lastPointerType.current = pointerType;
      cancelAccountClose();
      setAccountOpen(true);
    },
    [cancelAccountClose],
  );

  const scheduleAccountClose = useCallback(() => {
    cancelAccountClose();
    closeTimerRef.current = setTimeout(() => setAccountOpen(false), HOVER_CLOSE_DELAY);
  }, [cancelAccountClose]);

  // A pending timer must not fire after unmount.
  useEffect(() => cancelAccountClose, [cancelAccountClose]);

  const handleAccountOpenChange = useCallback(
    (next: boolean) => {
      cancelAccountClose();
      if (
        !next &&
        hoveringAccount.current &&
        lastPointerType.current === "mouse" &&
        !bypassHoverGuard.current
      ) {
        return;
      }
      bypassHoverGuard.current = false;
      setAccountOpen(next);
    },
    [cancelAccountClose],
  );

  /** Close the menu for real, e.g. right before navigating from a menu item. */
  const closeAccountNow = useCallback(() => {
    bypassHoverGuard.current = true;
    setAccountOpen(false);
  }, []);

  /** Shared by the trigger area and the portalled content. */
  const accountHoverHandlers = {
    onPointerEnter: (event: React.PointerEvent) => {
      hoveringAccount.current = true;
      openAccount(event.pointerType);
    },
    onPointerLeave: () => {
      hoveringAccount.current = false;
      scheduleAccountClose();
    },
  };

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
          <DropdownMenu open={accountOpen} onOpenChange={handleAccountOpenChange}>
            {/* The hover area is the avatar *and* the chevron, so the affordance
                and the trigger are the same target. */}
            <div {...accountHoverHandlers} className="flex items-center">
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
                      accountOpen && "rotate-180",
                    )}
                  />
                </button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent
              align="end"
              className="w-60"
              {...accountHoverHandlers}
              // Escape is an explicit "close this" from the keyboard, so it must
              // not be vetoed by the hover guard below — otherwise a keyboard user
              // whose pointer happens to rest on the avatar cannot close the menu
              // at all. Radix calls this before it requests the close.
              onEscapeKeyDown={() => {
                bypassHoverGuard.current = true;
              }}
              // Items close the menu on select; the hover guard would otherwise
              // veto that and leave the menu sitting open after navigating.
              onPointerDownOutside={cancelAccountClose}
            >
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
              <DropdownMenuItem asChild onSelect={closeAccountNow}>
                <Link href="/profile" className="cursor-pointer">
                  <User className="size-4" />
                  {t("common.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={closeAccountNow}>
                <Link href="/wishlist" className="cursor-pointer">
                  <Heart className="size-4" />
                  {t("nav.wishlist")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={closeAccountNow}>
                <Link href="/trips" className="cursor-pointer">
                  <Route className="size-4" />
                  {t("nav.trips")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild onSelect={closeAccountNow}>
                <Link href="/friends" className="cursor-pointer">
                  <Users className="size-4" />
                  {t("nav.friends")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault();
                  closeAccountNow();
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
