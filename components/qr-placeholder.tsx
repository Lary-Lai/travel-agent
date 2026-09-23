/**
 * Decorative QR placeholder.
 *
 * Draws a deterministic QR-*looking* matrix (real finder patterns, seeded
 * modules) as an inline SVG. It is NOT a scannable code — the demo has no
 * payment gateway, and shipping a real encoder would imply otherwise.
 *
 * Being deterministic from `seed` means the same order always renders the same
 * pattern, so it looks stable across reloads.
 */

const MODULES = 25;
/** Quiet zone, in modules, required around a real QR code. */
const QUIET = 2;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 7x7 eye pattern found in three corners of a real QR code. */
function finderModule(row: number, col: number): boolean {
  if (row === 0 || row === 6 || col === 0 || col === 6) return true;
  return row >= 2 && row <= 4 && col >= 2 && col <= 4;
}

/** Returns the finder value for a cell, or null when it is data area. */
function finderAt(row: number, col: number): boolean | null {
  if (row < 7 && col < 7) return finderModule(row, col);
  if (row < 7 && col >= MODULES - 7) return finderModule(row, col - (MODULES - 7));
  if (row >= MODULES - 7 && col < 7) return finderModule(row - (MODULES - 7), col);
  return null;
}

function buildModules(seed: string): boolean[][] {
  const random = mulberry32(hashSeed(seed));
  const grid: boolean[][] = [];

  for (let row = 0; row < MODULES; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < MODULES; col++) {
      const finder = finderAt(row, col);
      if (finder !== null) {
        line.push(finder);
        continue;
      }
      // Keep the separator ring around each finder light, like a real code.
      const nearFinder =
        (row < 8 && col < 8) ||
        (row < 8 && col >= MODULES - 8) ||
        (row >= MODULES - 8 && col < 8);
      line.push(nearFinder ? false : random() > 0.47);
    }
    grid.push(line);
  }

  // Alignment pattern (5x5) near the bottom-right, as real codes have.
  const alignRow = MODULES - 9;
  const alignCol = MODULES - 9;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const edge = r === 0 || r === 4 || c === 0 || c === 4;
      const center = r === 2 && c === 2;
      grid[alignRow + r][alignCol + c] = edge || center;
    }
  }

  return grid;
}

export function QrPlaceholder({
  seed,
  size = 208,
  className,
  children,
  darkColor = "#111827",
}: {
  seed: string;
  size?: number;
  className?: string;
  /** Rendered as a badge in the middle of the code. */
  children?: React.ReactNode;
  darkColor?: string;
}) {
  const grid = buildModules(seed);
  const total = MODULES + QUIET * 2;

  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size }}
      role="img"
      aria-label="演示用二维码（不可真实支付）"
    >
      <svg viewBox={`0 0 ${total} ${total}`} width={size} height={size} shapeRendering="crispEdges">
        <rect width={total} height={total} fill="#ffffff" />
        {grid.flatMap((line, row) =>
          line.map((filled, col) =>
            filled ? (
              <rect
                key={`${row}-${col}`}
                x={col + QUIET}
                y={row + QUIET}
                width={1}
                height={1}
                fill={darkColor}
              />
            ) : null,
          ),
        )}
      </svg>

      {children ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white p-1 shadow-sm">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
