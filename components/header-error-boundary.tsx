"use client";

/**
 * Keeps a crash in the header from taking the whole app down with it.
 *
 * This exists because it already happened: a half-applied edit left
 * `site-header.tsx` referencing an icon before its import (`icon: MessagesSquare`
 * in a module-level array), so the module threw while being evaluated — and the
 * header lives in the root layout and owns every navigation link, so the visible
 * result was not "a broken header" but an app where **nothing was clickable**,
 * with a dev indicator claiming it was still rendering. The page body was fine
 * and completely unreachable.
 *
 * ## What this does and does not cover (measured, not assumed)
 *
 *  - **A client module that fails to load on a fresh document: covered.** Breaking
 *    the header import on purpose and loading `/` and `/profile` produced the
 *    fallback header below with 1 link, while the page body rendered in full —
 *    including on a route the user would have been stuck on.
 *  - **An already-mounted tree whose module is hot-replaced with a broken one: NOT
 *    covered.** That is the path the incident actually took (Fast Refresh pushed
 *    the bad module into an open tab); the failure surfaces through the HMR
 *    runtime rather than through a React render, so no boundary on the client can
 *    intercept it. For that case the only correct recovery is a reload, which is
 *    why the fallback leads with one.
 *
 * A class component, because that is still the only way to define an error
 * boundary in React — there is no hook. It renders the fallback as a separate
 * function component so the copy can go through `useLocale()` like every other
 * string in the app (a class cannot call hooks).
 */
import { Compass, RotateCw } from "lucide-react";
import Link from "next/link";
import { Component, type ReactNode } from "react";

import { useLocale } from "@/components/locale-provider";

/** Minimal but functional header: brand, a way home, and a way out. */
function HeaderFallback() {
  const { t } = useLocale();

  return (
    <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Compass className="size-4" />
          </span>
          <span className="text-base font-semibold tracking-tight">{t("globals.brand")}</span>
        </Link>

        <div className="flex-1" />

        {/* A hard reload rather than a client navigation: whatever broke the
            header may also be wrong in the client tree, and only a fresh
            document is guaranteed to agree with the server. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium"
        >
          <RotateCw className="size-4" />
          {t("globals.reload")}
        </button>
      </div>
    </header>
  );
}

export class HeaderErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Logged rather than swallowed: the app stays usable, but the failure is not
    // hidden from whoever is developing it.
    console.error("[header] navigation crashed:", error);
  }

  render() {
    return this.state.failed ? <HeaderFallback /> : this.props.children;
  }
}
