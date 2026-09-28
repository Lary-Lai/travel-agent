import type { Metadata } from "next";
import { Compass, Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Server Component: the locale comes from the request cookie, so both the title
 * and the body render in the visitor's language on the first paint.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("globals.notFoundMetaTitle") };
}

export default async function NotFound() {
  const { t } = await getTranslator();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="bg-muted text-muted-foreground mb-5 flex size-14 items-center justify-center rounded-full">
        <Compass className="size-6" />
      </div>
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">{t("globals.notFoundTitle")}</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        {t("globals.notFoundBody")}
      </p>

      <div className="mt-6 flex gap-2">
        <Button asChild className="gap-2">
          <Link href="/search">
            <Search className="size-4" />
            {t("globals.goSearch")}
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">{t("globals.backHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
