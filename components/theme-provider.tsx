"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Dark mode.
 *
 * `attribute="class"` toggles the `.dark` class on <html>, which is what
 * `app/globals.css` defines its dark tokens against (`@custom-variant dark`).
 * `defaultTheme="system"` means a visitor on a dark OS gets dark mode with no
 * action, and an explicit choice is persisted in localStorage.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
