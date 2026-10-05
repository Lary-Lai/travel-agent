import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { HeaderErrorBoundary } from "@/components/header-error-boundary";
import { LocaleProvider } from "@/components/locale-provider";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LOCALE_META } from "@/lib/i18n/locales";
import { getLocale, getTranslator } from "@/lib/i18n/server";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadata is request-scoped: the locale lives in a cookie, so the <title> and
 * description follow the visitor's language like the rest of the page. The
 * product name itself is a brand and stays the same in every locale.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  const brand = t("globals.brand");

  return {
    title: {
      default: `${brand} · ${t("globals.metaTitle")}`,
      template: `%s · ${brand}`,
    },
    description: t("globals.metaDescription"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read the locale on the server so the first paint is already in the right
  // language — no flash of Chinese before a client-side switch.
  const locale = await getLocale();

  return (
    <html
      lang={LOCALE_META[locale].htmlLang}
      // next-themes writes the theme class onto <html> before hydration.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <LocaleProvider initialLocale={locale}>
          <Providers>
            {/* Scoped to the header only: `children` sit outside it, so a crash
                in the navigation can never make the page below unreachable. */}
            <HeaderErrorBoundary>
              <SiteHeader />
            </HeaderErrorBoundary>
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
