"use client";

import { Loader2, MapPin, Minus, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import {
  buildTileGrid,
  boundsOf,
  fitZoom,
  MAX_MAP_ZOOM,
  MIN_FIT_ZOOM,
  positionInGrid,
} from "@/lib/tiles";
import { cn } from "@/lib/utils";
import type { MapCityDto, MapListingDto } from "@/types";

/**
 * The trip-planning map.
 *
 * Two levels, and the zoom is the navigation between them:
 *
 *  - **All cities** — fitted to the viewport by `fitZoom`, one marker per city
 *    carrying its listing count. Clicking one zooms into it.
 *  - **One city** — its listings at their real coordinates, so the neighbourhood
 *    differences the catalogue only hints at ("银座", "卡姆登") become visible.
 *
 * Rendering is a mosaic of third-party tiles rather than a map library, reusing
 * `lib/tiles.ts` — the same pure geometry the listing page already uses and which
 * `verify-tiles.ts` checks against known reference points. No dependency, no CSS
 * import, and the projection is testable.
 *
 * Every coordinate is placed with `positionInGrid`, which is the *same* maths that
 * centres the mosaic. Using anything else is how markers end up half an ocean from
 * the city they name.
 */
type Props = {
  cities: MapCityDto[];
  listings: MapListingDto[];
  selectedCity: string | null;
  onSelectCity: (city: string | null) => void;
};

const TILE_URL = (x: number, y: number, zoom: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${y}/${x}`;

/*
 * 3 x 3 tiles = 768px square.
 *
 * Measured, not guessed: the map sits in the wide column of a `max-w-7xl` page, and
 * a 4-column mosaic came out 1024px wide against a ~795px column. `maxWidth: 100%`
 * then clipped the right-hand tiles *and* left the marker maths laying out for a box
 * that was no longer there — the kind of mismatch that shows up as pins drifting off
 * the city they name. 768px fits the column, so nothing is cut.
 */
const COLUMNS = 3;
const ROWS = 3;

export function PlanningMap({ cities, listings, selectedCity, onSelectCity }: Props) {
  const t = useT();
  const [zoomOffset, setZoomOffset] = useState(0);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const selected = cities.find((city) => city.city === selectedCity) ?? null;
  const cityListings = useMemo(
    () => (selected ? listings.filter((listing) => listing.city === selected.city) : []),
    [listings, selected],
  );

  /**
   * What the map is centred on, and at what zoom.
   *
   * The world view is fitted to all cities plus a little padding, because the
   * catalogue spans New York to Sydney; without the fit, half the markers sit
   * outside the viewport. A selected city zooms to a level where individual streets
   * and separate listings are distinguishable.
   */
  const view = useMemo(() => {
    const width = COLUMNS * 256;
    const height = ROWS * 256;

    if (selected) {
      return { longitude: selected.longitude, latitude: selected.latitude, zoom: 12 + zoomOffset };
    }

    const bounds = boundsOf(cities);
    if (!bounds) return { longitude: 0, latitude: 20, zoom: MIN_FIT_ZOOM };

    // Pad the box by 15% so markers are not flush against the edge.
    const padLng = Math.max(4, (bounds.maxLongitude - bounds.minLongitude) * 0.15);
    const padLat = Math.max(3, (bounds.maxLatitude - bounds.minLatitude) * 0.15);
    const padded = {
      minLongitude: bounds.minLongitude - padLng,
      maxLongitude: bounds.maxLongitude + padLng,
      minLatitude: bounds.minLatitude - padLat,
      maxLatitude: bounds.maxLatitude + padLat,
    };

    return {
      longitude: (padded.minLongitude + padded.maxLongitude) / 2,
      latitude: (padded.minLatitude + padded.maxLatitude) / 2,
      /*
       * Deliberately *not* `clampZoom` here.
       *
       * `clampZoom` floors at the UI's MIN_MAP_ZOOM (3), which is right for the
       * listing page but wrong for a whole-catalogue view: measured, the fit asked
       * for zoom 2 and the floor pushed it to 3, so New York and Sydney — the two
       * ends of the catalogue — were drawn off the mosaic. Six of ten city markers
       * appeared and nothing said the other four existed.
       *
       * `fitZoom` respects its own floor (MIN_FIT_ZOOM), so clamping a second time
       * can only make the view wrong.
       */
      zoom: Math.max(
        MIN_FIT_ZOOM,
        Math.min(MAX_MAP_ZOOM, fitZoom(padded, width, height) + zoomOffset),
      ),
    };
  }, [cities, selected, zoomOffset]);

  const grid = useMemo(
    () => buildTileGrid(view.longitude, view.latitude, view.zoom, COLUMNS, ROWS),
    [view],
  );

  const allFailed = failed.size >= grid.tiles.length;

  const place = (longitude: number, latitude: number) =>
    positionInGrid(
      longitude,
      latitude,
      view.zoom,
      view.longitude,
      view.latitude,
      grid.width,
      grid.height,
    );

  /** City markers, with the selected one emphasised. */
  const cityMarkers = cities
    .map((city) => ({ city, point: place(city.longitude, city.latitude) }))
    .filter(({ point }) => point.inside);

  const listingMarkers = cityListings
    .map((listing) => ({ listing, point: place(listing.longitude, listing.latitude) }))
    .filter(({ point }) => point.inside);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {selected ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onSelectCity(null)}>
              <X className="size-3.5" />
              {t("plan.allCities")}
            </Button>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {selected
              ? t("plan.cityListings", { city: selected.city, count: cityListings.length })
              : t("plan.hintAllCities", { count: cities.length })}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            aria-label={t("plan.zoomOut")}
            onClick={() => setZoomOffset((value) => Math.max(-2, value - 1))}
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="text-muted-foreground w-10 text-center text-xs tabular-nums">
            z{view.zoom}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            aria-label={t("plan.zoomIn")}
            onClick={() => setZoomOffset((value) => Math.min(3, value + 1))}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <div
        // Stable hook for the checks: "is this marker inside the map" needs the map
        // element, and the sidebar next to it also links to listings.
        data-plan-map=""
        className="relative overflow-hidden rounded-2xl border"
        style={{ width: grid.width, height: grid.height, maxWidth: "100%" }}
      >
        {/* Tile layer, pulled back by the sub-tile offset so the centre coordinate
            lands exactly in the middle. */}
        <div className="absolute" style={{ left: -grid.offsetX, top: -grid.offsetY }}>
          {grid.tiles.map((tile) => (
            /* A plain <img>: routing third-party tiles through next/image would make
               the optimiser fetch and re-encode somebody else's map. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              src={TILE_URL(tile.x, tile.y, tile.zoom)}
              alt=""
              width={grid.tileSize}
              height={grid.tileSize}
              className={cn(
                "absolute transition-opacity duration-300 select-none",
                loaded.has(tile.key) ? "opacity-100" : "opacity-0",
              )}
              style={{ left: tile.column * grid.tileSize, top: tile.row * grid.tileSize }}
              onLoad={() => setLoaded((previous) => new Set(previous).add(tile.key))}
              onError={() => setFailed((previous) => new Set(previous).add(tile.key))}
              loading="lazy"
              draggable={false}
            />
          ))}
        </div>

        {allFailed ? (
          <p className="text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center text-xs">
            {t("plan.tilesUnavailable")}
          </p>
        ) : null}

        {/* City markers */}
        {cityMarkers.map(({ city, point }) => {
          const active = city.city === selectedCity;
          return (
            <button
              key={city.city}
              type="button"
              onClick={() => onSelectCity(city.city)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-full rounded-full px-2 py-1 text-[11px] font-medium whitespace-nowrap shadow-sm transition-transform hover:scale-105",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/90 text-foreground ring-1 ring-black/10",
              )}
              style={{ left: point.x, top: point.y }}
              aria-label={t("plan.cityListings", { city: city.city, count: city.listingCount })}
            >
              {city.city}
              <span className="text-muted-foreground ml-1 tabular-nums">{city.listingCount}</span>
            </button>
          );
        })}

        {/* Listing markers, only inside a city */}
        {listingMarkers.map(({ listing, point }) => (
          <a
            key={listing.id}
            href={`/listings/${listing.id}`}
            className="bg-primary ring-background absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 transition-transform hover:scale-150"
            style={{ left: point.x, top: point.y }}
            title={`${listing.title} · ${formatPrice(listing.pricePerNight)}`}
            aria-label={`${listing.title} · ${formatPrice(listing.pricePerNight)}`}
          />
        ))}

        {!allFailed && loaded.size === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : null}
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <MapPin className="size-3.5" />
        {selected ? t("plan.hintListingPin") : t("plan.hintCityPin")}
      </p>
    </div>
  );
}
