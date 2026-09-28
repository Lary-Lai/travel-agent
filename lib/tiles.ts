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
