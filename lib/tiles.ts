/**
 * Slippy-map tile maths (the standard Web Mercator scheme).
 *
 * Kept as pure functions so the numbers can be verified against known reference
 * points rather than eyeballed in a screenshot — getting the y axis flipped, or
 * the mosaic aligned wrongly, still produces a plausible-looking map of the
 * wrong place or with the marker hanging off the edge.
 *
 * Reference: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 */

/** Zoom used when the map opens. 14 shows streets and landmarks around a listing. */
export const DEFAULT_MAP_ZOOM = 14;

export const MIN_MAP_ZOOM = 3;
export const MAX_MAP_ZOOM = 18;

/** Web Mercator is only defined within this latitude. */
const MAX_LATITUDE = 85.05112878;

const clampLatitude = (latitude: number) =>
  Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));

/** Longitude -> tile column at `zoom`, wrapped into [0, 2^zoom). */
export function longitudeToTileX(longitude: number, zoom: number): number {
  const scale = 2 ** zoom;
  const raw = Math.floor(((longitude + 180) / 360) * scale);
  return ((raw % scale) + scale) % scale;
}

/** Latitude -> tile row at `zoom`, clamped (the projection diverges at the poles). */
export function latitudeToTileY(latitude: number, zoom: number): number {
  const scale = 2 ** zoom;
  const radians = (clampLatitude(latitude) * Math.PI) / 180;
  const raw = Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * scale,
  );
  return Math.max(0, Math.min(scale - 1, raw));
}

/** Position of a coordinate on the whole world image, in pixels at `zoom`. */
export function worldPixelPosition(
  longitude: number,
  latitude: number,
  zoom: number,
  tileSize = 256,
): { x: number; y: number; worldSize: number } {
  const worldSize = 2 ** zoom * tileSize;
  const radians = (clampLatitude(latitude) * Math.PI) / 180;

  return {
    x: ((longitude + 180) / 360) * worldSize,
    y:
      ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * worldSize,
    worldSize,
  };
}

export type MapTile = {
  key: string;
  zoom: number;
  x: number;
  y: number;
  /** Position of this tile inside the mosaic, in tile units. */
  column: number;
  row: number;
};

export type MapGrid = {
  tiles: MapTile[];
  /** Translate the tile layer by this much so the coordinate lands dead centre. */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  tileSize: number;
};

/**
 * A `columns` x `rows` mosaic of tiles **centred on the coordinate**.
 *
 * The coordinate is placed at the exact middle of the mosaic and the tile grid is
 * shifted by a sub-tile offset, rather than snapping the grid to whole tiles.
 * Snapping looks fine in theory but puts the marker wherever the coordinate
 * happens to fall inside its tile — measured at 97% down the mosaic for Tokyo,
 * i.e. a pin hanging off the bottom edge. Centring makes the marker's position a
 * property of the layout, not of the coordinate's luck.
 */
export function buildTileGrid(
  longitude: number,
  latitude: number,
  zoom: number,
  columns = 3,
  rows = 2,
  tileSize = 256,
): MapGrid {
  const scale = 2 ** zoom;
  const width = columns * tileSize;
  const height = rows * tileSize;

  const world = worldPixelPosition(longitude, latitude, zoom, tileSize);
  const topLeftX = world.x - width / 2;
  const topLeftY = world.y - height / 2;

  // The tile containing the mosaic's top-left corner, plus the remainder that the
  // layer must be pulled back by.
  const firstX = Math.floor(topLeftX / tileSize);
  const firstY = Math.floor(topLeftY / tileSize);
  const offsetX = topLeftX - firstX * tileSize;
  const offsetY = topLeftY - firstY * tileSize;

  const tiles: MapTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // Wrap in x (the world is round), clamp in y (nothing exists past the pole).
      const x = (((firstX + column) % scale) + scale) % scale;
      const y = Math.max(0, Math.min(scale - 1, firstY + row));
      tiles.push({ key: `${zoom}/${x}/${y}`, zoom, x, y, column, row });
    }
  }

  return { tiles, offsetX, offsetY, width, height, columns, rows, tileSize };
}

/** Clamp a zoom level into the range the UI offers. */
export function clampZoom(zoom: number): number {
  return Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, Math.round(zoom)));
}

/** Lowest zoom the planner is willing to draw: below 3 the world repeats oddly. */
export const MIN_FIT_ZOOM = 2;

export type MapBounds = {
  minLongitude: number;
  maxLongitude: number;
  minLatitude: number;
  maxLatitude: number;
};

/** Bounding box of a set of coordinates, or null when there are none. */
export function boundsOf(points: Array<{ longitude: number; latitude: number }>): MapBounds | null {
  if (points.length === 0) return null;

  return points.reduce<MapBounds>(
    (bounds, point) => ({
      minLongitude: Math.min(bounds.minLongitude, point.longitude),
      maxLongitude: Math.max(bounds.maxLongitude, point.longitude),
      minLatitude: Math.min(bounds.minLatitude, point.latitude),
      maxLatitude: Math.max(bounds.maxLatitude, point.latitude),
    }),
    {
      minLongitude: points[0].longitude,
      maxLongitude: points[0].longitude,
      minLatitude: points[0].latitude,
      maxLatitude: points[0].latitude,
    },
  );
}

/**
 * The largest zoom at which `bounds` still fits inside a `width` x `height` view.
 *
 * Needed because the planner opens showing *every* city: the listings span New York
 * to Sydney, and a fixed "world" zoom either cuts half of them off or wastes the
 * viewport. The span is measured **through the projection** rather than by treating
 * latitude as linear — Mercator stretches the poles, so a naive degrees-per-pixel
 * calculation puts the southern rows off-screen.
 *
 * Returns an integer zoom; the caller pads the bounds if it wants a margin.
 */
export function fitZoom(bounds: MapBounds, width: number, height: number, tileSize = 256): number {
  // At zoom 0 the whole world is exactly one tile, so the pixel distance between
  // two coordinates at zoom 0 is the fraction of the world they span.
  const topLeft = worldPixelPosition(bounds.minLongitude, bounds.maxLatitude, 0, tileSize);
  const bottomRight = worldPixelPosition(bounds.maxLongitude, bounds.minLatitude, 0, tileSize);
  const spanX = Math.max(1e-9, bottomRight.x - topLeft.x);
  const spanY = Math.max(1e-9, bottomRight.y - topLeft.y);

  const zoom = Math.log2(Math.min(width / spanX, height / spanY));
  if (!Number.isFinite(zoom)) return MIN_FIT_ZOOM;

  return Math.max(MIN_FIT_ZOOM, Math.min(MAX_MAP_ZOOM, Math.floor(zoom)));
}

/**
 * Position of a coordinate inside a mosaic built by `buildTileGrid`, in pixels
 * from the mosaic's top-left corner. `null` when it falls outside the mosaic.
 */
export function positionInGrid(
  longitude: number,
  latitude: number,
  zoom: number,
  centerLongitude: number,
  centerLatitude: number,
  width: number,
  height: number,
  tileSize = 256,
): { x: number; y: number; inside: boolean } {
  const point = worldPixelPosition(longitude, latitude, zoom, tileSize);
  const center = worldPixelPosition(centerLongitude, centerLatitude, zoom, tileSize);

  const x = point.x - center.x + width / 2;
  const y = point.y - center.y + height / 2;

  return { x, y, inside: x >= 0 && x <= width && y >= 0 && y <= height };
}
