"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();
  // Callers that have a more specific message pass it in already translated.
  const heading = title ?? t("globals.errorTitle");
  const body = description ?? t("globals.errorBody");

  return (
    <div
      className={cn(
        "border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center rounded-2xl border px-6 py-12 text-center",
        className,
      )}
    >
      <div className="bg-destructive/10 text-destructive mb-4 flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="text-base font-semibold">{heading}</h3>
      <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">{body}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5 gap-2" onClick={onRetry}>
          <RefreshCw className="size-4" />
          {t("globals.reload")}
        </Button>
      ) : null}
    </div>
  );
}
