"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TranslationKey } from "@/lib/i18n";

/** `value` stays the next-themes key; only the visible label is translated. */
const OPTIONS: { value: "light" | "dark" | "system"; label: TranslationKey; icon: typeof Sun }[] = [
  { value: "light", label: "globals.themeLight", icon: Sun },
  { value: "dark", label: "globals.themeDark", icon: Moon },
  { value: "system", label: "globals.themeSystem", icon: Monitor },
];

/**
 * Theme switcher.
 *
 * The trigger shows both icons and lets CSS pick one, rather than reading
 * `resolvedTheme` in render. The theme is unknown during SSR, so a
 * mounted-guard would be needed otherwise — and calling setState from an effect
 * is exactly what the React lint rules forbid. Pure CSS avoids both problems
 * and there is no hydration mismatch.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useT();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("globals.themeToggle")}>
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => setTheme(option.value)}
            className="cursor-pointer gap-2"
          >
            <option.icon className="size-4" />
            {t(option.label)}
            {theme === option.value ? (
              <span className="bg-primary ml-auto size-1.5 rounded-full" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
