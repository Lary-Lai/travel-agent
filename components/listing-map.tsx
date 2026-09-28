"use client";

import { ExternalLink, Loader2, MapPin, Minus, Plus } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  buildTileGrid,
  clampZoom,
  DEFAULT_MAP_ZOOM,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
} from "@/lib/tiles";

type Props = {
  latitude: number;
  longitude: number;
  /** Shown in the marker's caption and used for the "open elsewhere" link. */
  label: string;
  className?: string;
};

/**
 * Where the listing is, on a map.
 *
 * Tiles come from Esri's public World Street Map service, which needs no API key.
 * The other free providers (OpenStreetMap, Carto, Wikimedia, Stadia) were all
 * unreachable from the machine this was built on; Esri answered every tile across
 * every city and zoom, so it is the one that actually works rather than the one
 * that is most conventional.
 *
 * Two deliberate choices:
 *
 *  - **Plain `<img>`, not `next/image`.** Routing a third-party tile through the
 *    optimizer would add an upstream fetch on the critical path with a ~7s
 *    timeout — exactly the failure mode that made listing photos fall back to
 *    placeholders. Tiles are already small and cache-friendly.
 *  - **A tile mosaic rather than a mapping library.** No dependency, no CSS
 *    import, and the geometry is a pure function (`lib/tiles.ts`) with real unit
 *    tests. The trade-off is no drag-to-pan; zoom buttons and an "open in maps"
 *    link cover the actual need for a listing location.
 */
export function ListingMap({ latitude, longitude, label, className }: Props) {
  const [zoom, setZoom] = useState(DEFAULT_MAP_ZOOM);
  const [loadedTiles, setLoadedTiles] = useState<Set<string>>(new Set());
  const [failedTiles, setFailedTiles] = useState<Set<string>>(new Set());

  const grid = buildTileGrid(longitude, latitude, zoom, 3, 2);
  const allFailed = failedTiles.size >= grid.tiles.length;
  const anyLoaded = loadedTiles.size > 0;

  const tileUrl = (x: number, y: number, z: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;

  const openInMaps = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=${zoom}/${latitude}/${longitude}`;

  return (
    <div className={cn("overflow-hidden rounded-2xl border", className)}>
      <div className="relative" style={{ height: grid.height }}>
        {/* Tile layer, pulled back by the sub-tile offset so the coordinate is
            centred. `key` includes the zoom so switching zoom remounts the tiles
            and the load/failure bookkeeping resets with them. */}
        <div
          key={zoom}
          className="absolute inset-0"
          style={{ transform: `translate(${-grid.offsetX}px, ${-grid.offsetY}px)` }}
        >
          {grid.tiles.map((tile) => (
            /* Deliberately a plain <img>: routing third-party tiles through the
               Next image optimizer would add an upstream fetch with a ~7s
               timeout on the critical path — the exact failure that made listing
               photos fall back to placeholders. Tiles are already small. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={tile.key}
              src={tileUrl(tile.x, tile.y, tile.zoom)}
              alt=""
              width={grid.tileSize}
              height={grid.tileSize}
              // Tiles are fetched directly from the provider; no optimizer.
              loading="eager"
              decoding="async"
              className={cn(
                "absolute transition-opacity duration-500",
                loadedTiles.has(tile.key) ? "opacity-100" : "opacity-0",
              )}
              style={{
                left: tile.column * grid.tileSize,
                top: tile.row * grid.tileSize,
              }}
              onLoad={() =>
                setLoadedTiles((previous) => new Set(previous).add(tile.key))
              }
              onError={() =>
                setFailedTiles((previous) => new Set(previous).add(tile.key))
              }
            />
          ))}
        </div>

        {/* Marker: always the mosaic's centre, by construction of the grid. */}
        {!allFailed ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative -translate-y-1/2">
              <MapPin className="text-primary size-8 drop-shadow-md" strokeWidth={2.2} />
              <span className="bg-primary/20 absolute inset-0 -z-10 animate-ping rounded-full" />
            </div>
          </div>
        ) : null}

        {/* Tile provider unreachable: say so plainly rather than showing grey. */}
        {allFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-neutral-200 p-4 text-center dark:bg-neutral-800">
            <MapPin className="text-muted-foreground size-6" />
            <p className="text-sm font-medium">地图暂时无法加载</p>
            <p className="text-muted-foreground text-xs">
              坐标 {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </p>
          </div>
        ) : null}

        {!anyLoaded && !allFailed ? (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-900">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">正在加载地图…</span>
          </div>
        ) : null}

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 flex flex-col overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur">
          <button
            type="button"
            onClick={() => setZoom((current) => clampZoom(current + 1))}
            disabled={zoom >= MAX_MAP_ZOOM}
            aria-label="放大地图"
            className="hover:bg-accent flex size-8 items-center justify-center transition-colors disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
          <span className="bg-border h-px" />
          <button
            type="button"
            onClick={() => setZoom((current) => clampZoom(current - 1))}
            disabled={zoom <= MIN_MAP_ZOOM}
            aria-label="缩小地图"
            className="hover:bg-accent flex size-8 items-center justify-center transition-colors disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
        </div>

        {/* Locality caption */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          <MapPin className="text-primary size-3.5" />
          {label}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <p className="text-muted-foreground text-[11px]">
          地图数据 © Esri · 缩放级别 {zoom}
        </p>
        <a
          href={openInMaps}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          在地图中打开
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}
