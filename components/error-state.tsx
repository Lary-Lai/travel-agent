"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "出了点问题",
  description = "数据加载失败，请稍后重试。",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
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
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1.5 max-w-md text-sm leading-relaxed">{description}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5 gap-2" onClick={onRetry}>
          <RefreshCw className="size-4" />
          重新加载
        </Button>
      ) : null}
    </div>
  );
}
