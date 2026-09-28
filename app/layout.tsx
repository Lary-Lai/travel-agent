import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { LocaleProvider } from "@/components/locale-provider";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LOCALE_META } from "@/lib/i18n/locales";
import { getLocale } from "@/lib/i18n/server";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "旅居 Agent · AI 旅游住宿平台",
    template: "%s · 旅居 Agent",
  },
  description:
    "AI 驱动的旅游住宿平台：搜索真实房源、收藏心愿单、完成预订，并用自然语言让 AI Agent 帮你找房、比较与下单。",
};

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
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
