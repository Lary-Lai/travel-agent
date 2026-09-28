import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  MapPin,
  Share2,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AmenityList } from "@/components/amenity-list";
import { BookingWidget } from "@/components/booking-widget";
import { FavoriteButton } from "@/components/favorite-button";
import { HouseRulesPanel } from "@/components/house-rules-panel";
import { ListingGallery } from "@/components/listing-gallery";
import { ListingMap } from "@/components/listing-map";
import { ReviewSection } from "@/components/review-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { WeatherCard } from "@/components/weather-card";
import { formatDate, formatRating } from "@/lib/format";
import { ApiError } from "@/lib/http";
import { getTranslator } from "@/lib/i18n/server";
import { propertyTypeLabel } from "@/lib/i18n/labels";
import { localizedLocation, localizedTitle } from "@/lib/i18n/listing-text";
import { cityName, countryName } from "@/lib/i18n/cities";
import { getListingDetail } from "@/server/listing.service";
import { getCityWeather } from "@/server/weather.service";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const listing = await getListingDetail(id);
    return {
      title: listing.title,
      description: listing.description.slice(0, 140),
    };
  } catch {
    // A separate function, so it needs its own translator.
    const { t } = await getTranslator();
    return { title: t("listing.detailTitle") };
  }
}

export default async function ListingDetailPage({ params }: Props) {
  await connection();
  const { id } = await params;

  let listing;
  try {
    listing = await getListingDetail(id);
  } catch (error) {
    // A missing listing is a genuine 404 page, not a crash.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  // Weather for the city this listing sits in. Resolves to null (card hidden)
  // if the provider is unreachable, so it can never break the page.
  const { locale, t } = await getTranslator();
  const weather = await getCityWeather(listing.city);

  const highlights = [
    { icon: Users, label: t("listing.maxGuests", { count: listing.maxGuests }) },
    { icon: Building2, label: t("listing.bedrooms", { count: listing.bedrooms }) },
    { icon: BedDouble, label: t("listing.beds", { count: listing.beds }) },
    { icon: Bath, label: t("listing.bathrooms", { count: listing.bathrooms }) },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/search"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        {t("listing.backToResults")}
      </Link>

      {/* ------------------------------------------------------------- header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {localizedTitle(locale, listing)}
          </h1>
          <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-current" />
              <span className="text-foreground font-medium">{formatRating(listing.rating)}</span>
              <span>· {t("common.reviews", { count: listing.reviewCount })}</span>
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {localizedLocation(locale, listing)} · {countryName(locale, listing.country)}
            </span>
            <Badge variant="secondary">{propertyTypeLabel(t, listing.propertyType)}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FavoriteButton
            listingId={listing.id}
            listingTitle={localizedTitle(locale, listing)}
            variant="plain"
            className="hover:bg-accent size-9 rounded-full border"
          />
          <button
            type="button"
            className="hover:bg-accent text-muted-foreground inline-flex size-9 items-center justify-center rounded-full border transition-colors"
            aria-label={t("listing.share")}
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------ gallery */}
      <ListingGallery gallery={listing.gallery} title={localizedTitle(locale, listing)} />

      {/* -------------------------------------------------------------- body */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          {/* host + highlights */}
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12 border">
                {listing.host.avatar ? (
                  <AvatarImage src={listing.host.avatar} alt={listing.host.name} />
                ) : null}
                <AvatarFallback>{listing.host.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{t("listing.host")} · {listing.host.name}</p>
                <p className="text-muted-foreground text-xs">
                  {t("listing.hostStats", {
                    count: listing.host.listingCount,
                    date: formatDate(listing.host.joinedAt, locale),
                  })}
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* key facts */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {highlights.map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-xl border p-3">
                <item.icon className="text-muted-foreground size-4 shrink-0" />
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </section>

          <Separator />

          {/* description */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">{t("listing.intro")}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{listing.description}</p>
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CalendarDays className="size-3.5" />
              {t("listing.published", { date: formatDate(listing.createdAt, locale) })}
            </p>
          </section>

          <Separator />

          {/* amenities */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold">{t("listing.amenities")}</h2>
            <AmenityList
              amenities={listing.amenities}
              cityLabel={cityName(locale, listing.city)}
              cityListingCount={listing.cityListingCount}
            />
          </section>

          <Separator />

          {/* location */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">{t("listing.location")}</h2>
            <div className="text-muted-foreground space-y-1 text-sm">
              <p>
                {cityName(locale, listing.city)} · {localizedLocation(locale, listing)}
              </p>
            </div>
            <ListingMap
              latitude={listing.latitude}
              longitude={listing.longitude}
              label={localizedLocation(locale, listing)}
            />
            <p className="text-muted-foreground text-xs tabular-nums">
              {t("listing.coordinates", {
                lat: listing.latitude.toFixed(4),
                lng: listing.longitude.toFixed(4),
              })}{" "}
              · {t("listing.locationPrivacy")}
            </p>
          </section>

          {/* house rules */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">{t("houseRules.title")}</h2>
            <HouseRulesPanel
              rules={listing.houseRules}
              title={localizedTitle(locale, listing)}
              variant="inline"
            />
          </section>

          {/* weather in the destination city */}
          {weather ? (
            <>
              <Separator />
              <section className="space-y-3">
                <h2 className="text-base font-semibold">{t("weather.title")}</h2>
                <WeatherCard weather={weather} />
              </section>
            </>
          ) : null}

          <Separator />

          {/* reviews */}
          <ReviewSection listingId={listing.id} />
        </div>

        {/* ---------------------------------------------------- booking panel */}
        <aside>
          <div className="lg:sticky lg:top-24">
            <BookingWidget listing={listing} />
          </div>
        </aside>
      </div>
    </div>
  );
}
