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
import { ListingGallery } from "@/components/listing-gallery";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { WeatherCard } from "@/components/weather-card";
import { formatCount, formatDate, formatRating } from "@/lib/format";
import { ApiError } from "@/lib/http";
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
    return { title: "房源详情" };
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
  const weather = await getCityWeather(listing.city);

  const highlights = [
    { icon: Users, label: `可住 ${listing.maxGuests} 人` },
    { icon: Building2, label: `${listing.bedrooms} 间卧室` },
    { icon: BedDouble, label: `${listing.beds} 张床` },
    { icon: Bath, label: `${listing.bathrooms} 间卫生间` },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href="/search"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        返回搜索结果
      </Link>

      {/* ------------------------------------------------------------- header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{listing.title}</h1>
          <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1">
              <Star className="size-3.5 fill-current" />
              <span className="text-foreground font-medium">{formatRating(listing.rating)}</span>
              <span>· {formatCount(listing.reviewCount)} 条评价</span>
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              {listing.location} · {listing.countryLabel}
            </span>
            <Badge variant="secondary">{listing.propertyTypeLabel}</Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FavoriteButton
            listingId={listing.id}
            listingTitle={listing.title}
            variant="plain"
            className="hover:bg-accent size-9 rounded-full border"
          />
          <button
            type="button"
            className="hover:bg-accent text-muted-foreground inline-flex size-9 items-center justify-center rounded-full border transition-colors"
            aria-label="分享"
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------ gallery */}
      <ListingGallery gallery={listing.gallery} title={listing.title} />

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
                <p className="text-sm font-medium">房东 · {listing.host.name}</p>
                <p className="text-muted-foreground text-xs">
                  共 {listing.host.listingCount} 套房源 · 加入于 {formatDate(listing.host.joinedAt)}
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
            <h2 className="text-base font-semibold">房源介绍</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{listing.description}</p>
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <CalendarDays className="size-3.5" />
              发布于 {formatDate(listing.createdAt)}
            </p>
          </section>

          <Separator />

          {/* amenities */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold">房源设施</h2>
            <AmenityList
              amenities={listing.amenities}
              cityLabel={listing.cityLabel}
              cityListingCount={listing.cityListingCount}
            />
          </section>

          <Separator />

          {/* location */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">位置信息</h2>
            <div className="text-muted-foreground space-y-1 text-sm">
              <p>
                {listing.cityLabel} · {listing.location}
              </p>
              <p className="text-xs tabular-nums">
                经纬度 {listing.latitude.toFixed(4)}, {listing.longitude.toFixed(4)}
              </p>
            </div>
          </section>

          {/* weather in the destination city */}
          {weather ? (
            <>
              <Separator />
              <section className="space-y-3">
                <h2 className="text-base font-semibold">当地天气</h2>
                <WeatherCard weather={weather} />
              </section>
            </>
          ) : null}
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
