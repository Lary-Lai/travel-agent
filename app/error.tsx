"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 * Keeps a failure inside the page shell (header/footer survive) instead of
 * showing Next's default error screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="bg-destructive/10 text-destructive mb-5 flex size-14 items-center justify-center rounded-full">
        <AlertTriangle className="size-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{t("globals.errorPageTitle")}</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        {t("globals.errorPageBodyLead")}
        <code className="text-foreground">npm run db:start</code>
        {t("globals.errorPageBodyTail")}
      </p>
      {error.digest ? (
        <p className="text-muted-foreground mt-2 font-mono text-xs">digest: {error.digest}</p>
      ) : null}

      <div className="mt-6 flex gap-2">
        <Button onClick={reset} className="gap-2">
          <RefreshCw className="size-4" />
          {t("globals.retry")}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">{t("globals.backHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
