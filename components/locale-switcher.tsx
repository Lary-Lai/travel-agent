"use client";

import { Check, Languages, Loader2 } from "lucide-react";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_META, LOCALES } from "@/lib/i18n/locales";
import { useHoverMenu } from "@/lib/use-hover-menu";
import { cn } from "@/lib/utils";

/**
 * Language picker.
 *
 * Each entry is labelled in its own language with its code, so someone who
 * cannot read the current interface language can still find theirs. The check
 * mark and `aria-checked` make the active one unambiguous.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t, isSwitching } = useLocale();
  const menu = useHoverMenu();

  return (
    // `modal={false}` is required by `useHoverMenu` — see its docs.
    <DropdownMenu modal={false} open={menu.open} onOpenChange={menu.onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-1.5 px-2", className)}
          aria-label={t("locale.label")}
          disabled={isSwitching}
          {...menu.triggerProps}
        >
          {isSwitching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Languages className="size-4" />
          )}
          <span className="text-xs font-medium">{LOCALE_META[locale].nativeLabel}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44" {...menu.contentProps}>
        <DropdownMenuLabel className="text-xs">{t("locale.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALES.map((code) => {
          const meta = LOCALE_META[code];
          const active = code === locale;
          return (
            <DropdownMenuItem
              key={code}
              onSelect={() => {
                setLocale(code);
                menu.closeNow();
              }}
              aria-checked={active}
              role="menuitemradio"
              className="justify-between gap-2"
            >
              <span className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "w-6 shrink-0 text-center text-[10px] font-semibold tracking-wide",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {meta.short}
                </span>
                <span className={cn("text-sm", active && "font-medium")}>{meta.nativeLabel}</span>
              </span>
              {active ? <Check className="text-primary size-3.5 shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
