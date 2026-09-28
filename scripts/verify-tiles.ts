/**
 * Slippy-map tile maths.
 *
 * Getting this wrong still renders a map — just of the wrong place — so the
 * checks here are invariants that an incorrect implementation cannot satisfy,
 * rather than snapshots of whatever the code currently prints.
 *
 *     npx tsx scripts/verify-tiles.ts
 */
import {
  buildTileGrid,
  clampZoom,
  latitudeToTileY,
  longitudeToTileX,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  worldPixelPosition,
} from "../lib/tiles";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n— known reference points");

// At zoom 0 the whole world is a single tile.
check("zoom 0 is a single tile for London", longitudeToTileX(-0.1278, 0) === 0 && latitudeToTileY(51.5074, 0) === 0);
check("zoom 0 is a single tile for Sydney", longitudeToTileX(151.2093, 0) === 0 && latitudeToTileY(-33.8688, 0) === 0);

// Null Island sits exactly on the boundary of all four zoom-1 tiles.
check("equator/prime meridian at zoom 1 -> (1,1)", longitudeToTileX(0, 1) === 1 && latitudeToTileY(0, 1) === 1);
check("equator/prime meridian at zoom 2 -> (2,2)", longitudeToTileX(0, 2) === 2 && latitudeToTileY(0, 2) === 2);

// Western hemisphere west, northern hemisphere north.
check("London is west/north at zoom 1 -> (0,0)", longitudeToTileX(-0.1278, 1) === 0 && latitudeToTileY(51.5074, 1) === 0);
check("Sydney is east/south at zoom 1 -> (1,1)", longitudeToTileX(151.2093, 1) === 1 && latitudeToTileY(-33.8688, 1) === 1);

console.log("\n— the y axis is not flipped");

// A northern city must have a SMALLER tile row than a southern one at the same
// zoom. Reversing the sign is the classic bug, and it still looks like a map.
const north = latitudeToTileY(48.8566, 10); // Paris
const south = latitudeToTileY(-33.8688, 10); // Sydney
check("Paris is above Sydney on the y axis", north < south, `paris=${north} sydney=${south}`);
check("the north pole clamps to row 0", latitudeToTileY(89, 6) === 0);
check(
  "the south pole clamps to the last row",
  latitudeToTileY(-89, 6) === 2 ** 6 - 1,
  String(latitudeToTileY(-89, 6)),
);

console.log("\n— ranges and wrapping");

let inRange = true;
for (let zoom = MIN_MAP_ZOOM; zoom <= MAX_MAP_ZOOM; zoom++) {
  const scale = 2 ** zoom;
  for (let longitude = -180; longitude <= 180; longitude += 7.5) {
    for (const latitude of [-85, -45, 0, 30, 51.5, 85]) {
      const x = longitudeToTileX(longitude, zoom);
      const y = latitudeToTileY(latitude, zoom);
      if (!Number.isInteger(x) || x < 0 || x >= scale) inRange = false;
      if (!Number.isInteger(y) || y < 0 || y >= scale) inRange = false;
    }
  }
}
check("every tile index is an integer inside [0, 2^zoom)", inRange);

// Longitudes past the antimeridian wrap rather than producing invalid tiles.
check("longitude 200 wraps into range", longitudeToTileX(200, 8) < 2 ** 8 && longitudeToTileX(200, 8) >= 0);

console.log("\n— the zoom doubling invariant");

// Zooming in one level splits a tile into four: the child is either 2x or 2x+1.
let doublingHolds = true;
for (let zoom = 6; zoom < 14; zoom++) {
  const x = longitudeToTileX(139.6503, zoom);
  const y = latitudeToTileY(35.6762, zoom);
  const childX = longitudeToTileX(139.6503, zoom + 1);
  const childY = latitudeToTileY(35.6762, zoom + 1);
  if (childX !== x * 2 && childX !== x * 2 + 1) doublingHolds = false;
  if (childY !== y * 2 && childY !== y * 2 + 1) doublingHolds = false;
}
check("each zoom level halves the tile it belongs to", doublingHolds);

console.log("\n— the world pixel space");

const world = worldPixelPosition(0, 0, 1, 256);
check("at zoom 1 the world is 512px", world.worldSize === 512, String(world.worldSize));
check(
  "the prime meridian is at the world's horizontal middle",
  Math.abs(world.x - 256) < 1e-6,
  String(world.x),
);
check(
  "the equator is at the world's vertical middle",
  Math.abs(world.y - 256) < 1e-6,
  String(world.y),
);

console.log("\n— the tile grid");

const grid = buildTileGrid(139.6503, 35.6762, 14, 3, 2);
check("a 3x2 grid has 6 tiles", grid.tiles.length === 6, String(grid.tiles.length));
check("the mosaic is columns x rows tiles", grid.width === 768 && grid.height === 512);
check(
  "the centre tile holds the coordinate",
  grid.tiles.some(
    (tile) =>
      tile.x === longitudeToTileX(139.6503, 14) && tile.y === latitudeToTileY(35.6762, 14),
  ),
);
check("tile keys are unique", new Set(grid.tiles.map((t) => t.key)).size === grid.tiles.length);

// The sub-tile offset must be a fraction of one tile; a whole-tile offset would
// mean the grid was snapped and the marker is no longer centred.
check(
  "the offset is a sub-tile remainder",
  grid.offsetX >= 0 && grid.offsetX < 256 && grid.offsetY >= 0 && grid.offsetY < 256,
  `x=${grid.offsetX.toFixed(1)} y=${grid.offsetY.toFixed(1)}`,
);

// The whole point of the offset: the coordinate lands exactly in the middle of
// the mosaic, for any coordinate and any zoom.
let allCentred = true;
const worstDrift: string[] = [];
const probes: Array<[string, number, number]> = [
  ["Tokyo", 139.6503, 35.6762],
  ["Sydney", 151.2093, -33.8688],
  ["Paris", 2.3522, 48.8566],
  ["Reykjavik", -21.9426, 64.1466],
  ["Quito", -78.4678, -0.1807],
  ["Suva", 178.4419, -18.1416],
];

for (const [name, longitude, latitude] of probes) {
  for (const zoom of [MIN_MAP_ZOOM, 8, 12, 14, MAX_MAP_ZOOM]) {
    const g = buildTileGrid(longitude, latitude, zoom, 3, 2);
    const w = worldPixelPosition(longitude, latitude, zoom, 256);

    // How the component renders it: tile `firstX + column` is drawn at
    // `column * tileSize - offsetX`. So the coordinate's position inside the
    // mosaic is (worldX - firstX*tileSize) - offsetX, and that must be the
    // mosaic's centre.
    const firstTileX = Math.floor((w.x - g.width / 2) / 256);
    const firstTileY = Math.floor((w.y - g.height / 2) / 256);
    const renderedX = w.x - firstTileX * 256 - g.offsetX;
    const renderedY = w.y - firstTileY * 256 - g.offsetY;

    const drift = Math.max(
      Math.abs(renderedX - g.width / 2),
      Math.abs(renderedY - g.height / 2),
    );
    if (drift > 0.001) {
      allCentred = false;
      worstDrift.push(`${name}@${zoom} drift=${drift.toFixed(3)}px`);
    }
  }
}
check(
  "the coordinate lands dead centre for every probe city and zoom",
  allCentred,
  worstDrift.slice(0, 3).join(", "),
);

// Grids near the poles must not ask for out-of-range rows.
const polar = buildTileGrid(0, 84.9, 12, 3, 2);
check(
  "a polar grid stays within valid rows",
  polar.tiles.every((tile) => tile.y >= 0 && tile.y < 2 ** 12),
);

console.log("\n— zoom clamping");
check("zoom below the minimum clamps up", clampZoom(0) === MIN_MAP_ZOOM, String(clampZoom(0)));
check("zoom above the maximum clamps down", clampZoom(99) === MAX_MAP_ZOOM, String(clampZoom(99)));
check("a fractional zoom rounds", clampZoom(13.6) === 14, String(clampZoom(13.6)));

console.log(`\n${"=".repeat(56)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("=".repeat(56));

process.exit(failed === 0 ? 0 : 1);
