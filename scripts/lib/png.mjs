/**
 * Minimal PNG decoder, for measuring what was actually rendered.
 *
 * Why this exists: two rounds of screenshot review disagreed about whether the
 * hero grain and the card shadows are visible, and neither answer was trustworthy
 * — the screenshots get downscaled and re-encoded before anyone looks at them, so
 * a 1-2% per-pixel effect is destroyed on the way. Decoding the PNG lets the
 * checks measure the composited pixels directly, in the same units the browser
 * paints them (0-255 per channel), instead of asking for an opinion.
 *
 * Scope: 8-bit RGB / RGBA / greyscale, non-interlaced — which is what
 * `Page.captureScreenshot` produces. Anything else throws rather than guessing.
 */
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Paeth predictor, as defined by the PNG spec. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG buffer into raw 8-bit samples.
 *
 * @returns {{ width: number, height: number, channels: number, data: Uint8Array }}
 */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length; // length + type + body + crc
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced PNG is not supported");

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = new Uint8Array(height * stride);

  // Undo the per-scanline filter. Each row is prefixed by its filter type.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = y * stride;
    const prior = row - stride;

    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? data[row + x - channels] : 0;
      const up = y > 0 ? data[prior + x] : 0;
      const upLeft = y > 0 && x >= channels ? data[prior + x - channels] : 0;
      const value = src[x];

      data[row + x] =
        filter === 0
          ? value
          : filter === 1
            ? (value + left) & 0xff
            : filter === 2
              ? (value + up) & 0xff
              : filter === 3
                ? (value + ((left + up) >> 1)) & 0xff
                : (value + paeth(left, up, upLeft)) & 0xff;
    }
  }

  return { width, height, channels, data };
}

/** Perceptual luminance of the pixel at (x, y). */
export function luminanceAt(image, x, y) {
  const index = (y * image.width + x) * image.channels;
  const [r, g, b] = [image.data[index], image.data[index + 1] ?? 0, image.data[index + 2] ?? 0];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Mean absolute difference between horizontally adjacent pixels.
 *
 * This is the measurement that distinguishes "grain" from "a flat wash": noise
 * makes neighbouring pixels differ, a smooth gradient leaves them almost
 * identical. Reported in 0-255 units, so a value below ~0.5 means the effect is
 * at or under one 8-bit step and therefore invisible.
 */
export function neighbourDelta(image, region) {
  const { x, y, width, height } = region;
  let total = 0;
  let count = 0;

  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width - 1; col++) {
      total += Math.abs(luminanceAt(image, col + 1, row) - luminanceAt(image, col, row));
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/** Mean luminance over a region. */
export function meanLuminance(image, region) {
  const { x, y, width, height } = region;
  let total = 0;
  let count = 0;

  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      total += luminanceAt(image, col, row);
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}
