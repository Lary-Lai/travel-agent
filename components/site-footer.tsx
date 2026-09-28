import Link from "next/link";
import { Compass } from "lucide-react";

import type { TranslationKey } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Column layout is data, so the labels are stored as translation keys and
 * resolved inside the component — the footer is a Server Component and can
 * therefore await the translator instead of using the client hook.
 */
const COLUMNS: {
  title: TranslationKey;
  links: { label: TranslationKey; href: string }[];
}[] = [
  {
    title: "globals.footerExplore",
    links: [
      { label: "globals.footerCityTokyo", href: "/search?location=tokyo" },
      { label: "globals.footerCityParis", href: "/search?location=paris" },
      { label: "globals.footerCityLondon", href: "/search?location=london" },
      { label: "globals.footerCityNewYork", href: "/search?location=new%20york" },
    ],
  },
  {
    title: "globals.footerMySpace",
    links: [
      { label: "nav.wishlist", href: "/wishlist" },
      { label: "nav.trips", href: "/trips" },
      { label: "common.login", href: "/login" },
      { label: "common.register", href: "/register" },
    ],
  },
  {
    title: "footer.about",
    links: [
      { label: "globals.footerGuide", href: "/#agent" },
      { label: "nav.search", href: "/search" },
    ],
  },
];

export async function SiteFooter() {
  const { t } = await getTranslator();

  return (
    <footer className="border-border mt-16 border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
              <Compass className="size-4" />
            </span>
            <span className="text-base font-semibold">{t("globals.brand")}</span>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("globals.footerBlurb")}
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title} className="space-y-3">
            <h3 className="text-sm font-semibold">{t(column.title)}</h3>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {t("globals.brand")} · {t("globals.footerDisclaimer")}
          </p>
          <p>Next.js · Prisma · PostgreSQL · AI SDK</p>
        </div>
      </div>
    </footer>
  );
}
