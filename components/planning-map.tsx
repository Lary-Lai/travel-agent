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
 * The visible window, and the tile canvas behind it — two different sizes.
 *
 * `WINDOW_SIZE` is what the user sees: 768px, which is what fits the wide column of
 * the page (measured ~795px) without the card clipping its own contents.
 *
 * The canvas is **two tiles larger in each direction** than the window, and that number
 * is forced by two constraints that pull against each other:
 *
 *  1. The canvas must be centred on the window, because the coordinate is centred in the
 *     canvas — otherwise the tiles and the markers disagree by half the difference.
 *  2. It must still cover the window, and the mosaic is shifted by a *sub-tile* offset
 *     of up to 256px to centre the coordinate instead of snapping to a tile boundary.
 *
 * With one spare tile the shift could exceed the margin and leave a bare band along the
 * right or bottom edge — measured on the first attempt: three columns left the whole
 * eastern half blank (Tokyo, Seoul, Sydney over white), and four left the bottom edge
 * uncovered whenever the fractional offset passed 128px, i.e. about half the time,
 * depending on where the cities happened to centre. Two spare tiles make both hold for
 * every coordinate.
 *
 * Only the tiles that actually intersect the window are rendered (see below), so the
 * extra canvas costs layout arithmetic, not network requests.
 */
const WINDOW_SIZE = 768;
const COLUMNS = Math.ceil(WINDOW_SIZE / 256) + 2;
const ROWS = Math.ceil(WINDOW_SIZE / 256) + 2;

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
    const width = WINDOW_SIZE;
    const height = WINDOW_SIZE;

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

  /** How far the larger tile canvas hangs over each edge of the visible window. */
  const overhang = (grid.width - WINDOW_SIZE) / 2;

  /**
   * Only the tiles that touch the window are rendered.
   *
   * The canvas is deliberately larger than the window (see COLUMNS above), so a third
   * of its tiles are always outside the clip. Skipping them saves the fetches while
   * keeping the arithmetic simple.
   */
  const layerLeft = grid.offsetX + overhang;
  const layerTop = grid.offsetY + overhang;
  const visibleTiles = grid.tiles.filter((tile) => {
    const left = tile.column * grid.tileSize - layerLeft;
    const top = tile.row * grid.tileSize - layerTop;
    return (
      left < WINDOW_SIZE &&
      top < WINDOW_SIZE &&
      left + grid.tileSize > 0 &&
      top + grid.tileSize > 0
    );
  });

  const allFailed = failed.size > 0 && visibleTiles.every((tile) => failed.has(tile.key));

  const place = (longitude: number, latitude: number) =>
    positionInGrid(
      longitude,
      latitude,
      view.zoom,
      view.longitude,
      view.latitude,
      WINDOW_SIZE,
      WINDOW_SIZE,
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
        style={{ width: WINDOW_SIZE, height: WINDOW_SIZE, maxWidth: "100%" }}
      >
        {/*
          The tile layer, pulled back by the sub-tile offset so the centre coordinate
          lands exactly in the middle.

          `width`/`height` are set explicitly and they are load-bearing. Tailwind's
          preflight applies `img { max-width: 100% }`, and `100%` of a zero-width
          absolutely positioned parent is **zero** — so every tile collapsed to 0x0 and
          the map rendered as a blank white panel while the images had loaded fine
          (9/9, `opacity: 1`, HTTP 200). A measured symptom of exactly that: the tiles'
          bounding boxes were `{ w: 0, h: 0 }`.
        */}
        <div
          className="absolute"
          style={{
            left: -(grid.offsetX + overhang),
            top: -(grid.offsetY + overhang),
            width: grid.width,
            height: grid.height,
          }}
        >
          {visibleTiles.map((tile) => (
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
              // Size in the inline style as well as the attributes: attributes give the
              // intrinsic size, but `max-width: 100%` from preflight can still clamp it
              // (see the layer's note), and an explicit width cannot be clamped away.
              style={{
                left: tile.column * grid.tileSize,
                top: tile.row * grid.tileSize,
                width: grid.tileSize,
                height: grid.tileSize,
              }}
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
