"use client";

import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A delete control with a confirm step, in place.
 *
 * Deliberately not a modal: the thing being deleted is directly above the button,
 * and a dialog would cover it exactly when the user wants to check they picked
 * the right row. First click arms it, and the confirm/cancel pair then replaces
 * the label — so the destructive action is always the *second* click.
 */
export function ConfirmDeleteButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
  className,
  size = "sm",
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "icon";
}) {
  const t = useT();
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={size}
        disabled={disabled}
        onClick={() => setArmed(true)}
        className={cn("text-muted-foreground hover:text-destructive gap-1.5", className)}
      >
        <Trash2 className="size-3.5" />
        {label}
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{confirmLabel}</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className="h-7 gap-1 px-2 text-xs"
      >
        <Check className="size-3.5" />
        {t("forum.delete")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setArmed(false)}
        className="h-7 gap-1 px-2 text-xs"
      >
        <X className="size-3.5" />
        {t("forum.cancel")}
      </Button>
    </span>
  );
}
