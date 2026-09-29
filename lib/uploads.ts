/**
 * Local image uploads (profile avatars and banners).
 *
 * **Server-only.** This module imports `node:fs` and `node:crypto`, so it must
 * never reach a client component. It is reachable from `lib/validators.ts`,
 * which is only ever imported by Route Handlers for that reason — the one
 * function a browser needs (`isUploadedMediaPath`) is a plain regex, but it
 * travels with the module.
 *
 * ## Where the bytes go
 *
 * `data/uploads/`, not `public/`. Next snapshots `public/` into the build, so a
 * file written after `next build` would 404 in production, and mixing user
 * uploads into the repository's own assets makes it impossible to tell them
 * apart later. Files are served back through `/api/media/<name>`, which keeps
 * the storage location an implementation detail of the server.
 *
 * ## Why the validation looks like this
 *
 * `file.type` and `file.name` are *client-supplied strings*. Trusting them is how
 * an "image" upload becomes stored XSS, so:
 *
 *  - the real type is sniffed from the **magic bytes**, and the extension we
 *    store is derived from that sniff, never from the uploaded filename (which
 *    also kills `../../` traversal and `avatar.png.html` double extensions);
 *  - SVG is rejected outright. It is an image format that can contain scripts,
 *    and serving attacker-controlled SVG from our own origin is a script
 *    injection with extra steps. The bundled preset avatars are SVG, but those
 *    ship in the repository instead of arriving from a browser;
 *  - the response for a stored file pins a whitelisted `Content-Type` and sets
 *    `X-Content-Type-Options: nosniff`, so the browser cannot be talked into
 *    re-interpreting the bytes.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { badRequest } from "./http";
import type { UploadKindValue } from "../types";

/** Uploaded images are profile decorations; 4 MB is generous for one. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

/** Sniffed type → the extension and Content-Type we will serve it with. */
const IMAGE_TYPES = {
  png: { ext: "png", mime: "image/png" },
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  webp: { ext: "webp", mime: "image/webp" },
  gif: { ext: "gif", mime: "image/gif" },
} as const;

type ImageFormat = keyof typeof IMAGE_TYPES;

/**
 * Deliberately narrower than the upload name pattern would suggest: a *storage*
 * name is `<kind>-<16 hex>.<ext>` and nothing else. Anything else is somebody
 * probing for traversal or a stale file from an older format.
 */
const STORED_NAME = /^(avatar|cover)-[0-9a-f]{16}\.(png|jpg|webp|gif)$/;

// ------------------------------------------------------------------ sniffing

/**
 * Identify the format from the first bytes.
 *
 * Returns null for anything unrecognised, including SVG — see the note above.
 */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

  // GIF87a / GIF89a
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header === "GIF87a" || header === "GIF89a") return "gif";

  // WebP: "RIFF" .... "WEBP"
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

// ---------------------------------------------------------------- dimensions

const utf8 = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/**
 * Read the pixel dimensions straight out of the file header.
 *
 * Worth the ~50 lines: without it the UI cannot tell a 4 MB 40×40 avatar from a
 * 2000 px banner, and "uploaded successfully" would be the only feedback a user
 * ever gets. Returns nulls rather than throwing — a file whose header parses
 * oddly is still a usable image.
 */
export function readImageSize(
  bytes: Uint8Array,
  format: ImageFormat,
): { width: number | null; height: number | null } {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (format === "png") {
      // 8-byte signature, then a chunk length (4) and "IHDR" (4).
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    if (format === "gif") {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }

    if (format === "jpeg") {
      // Walk the segment chain to the frame header (SOF0…SOF15, minus the
      // non-frame markers DHT/DAC/RST).
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = bytes[offset + 1];
        const length = view.getUint16(offset + 2);
        const isFrameHeader =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);
        if (isFrameHeader) {
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        offset += 2 + length;
      }
      return { width: null, height: null };
    }

    // WebP has three container flavours.
    const chunk = utf8(bytes.slice(12, 16));
    if (chunk === "VP8X") {
      // 24-bit little-endian, stored as (value - 1).
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
    if (chunk === "VP8 ") {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
    if (chunk === "VP8L") {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}

// ------------------------------------------------------------------- storage

export type StoredUpload = {
  /** Storage name (not a path) — the caller turns it into a URL. */
  name: string;
  url: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
};

/** Validate and persist one upload. Throws `badRequest` with a readable reason. */
export async function saveUpload(
  input: { bytes: Uint8Array; kind: UploadKindValue },
): Promise<StoredUpload> {
  const { bytes, kind } = input;

  if (bytes.length === 0) throw badRequest("上传的文件为空");
  if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest("图片过大，请上传 4MB 以内的图片");

  const format = sniffImageFormat(bytes);
  if (!format) {
    throw badRequest("仅支持 JPG / PNG / WebP / GIF 图片（不支持 SVG）");
  }

  const { ext, mime } = IMAGE_TYPES[format];
  const name = `${kind}-${randomBytes(8).toString("hex")}.${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), bytes);

  const size = readImageSize(bytes, format);
  return { name, url: `/api/media/${name}`, mimeType: mime, bytes: bytes.length, ...size };
}

/**
 * Read a stored upload for serving.
 *
 * The name is matched against `STORED_NAME` before touching the disk, so a
 * request for `../.env` or a nested path can never resolve to a file outside
 * `data/uploads/`. `path.basename` is a belt-and-braces second check.
 */
export async function readUpload(
  name: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!STORED_NAME.test(name) || path.basename(name) !== name) return null;

  const ext = name.split(".").pop() as (typeof IMAGE_TYPES)[ImageFormat]["ext"];
  const entry = Object.values(IMAGE_TYPES).find((type) => type.ext === ext);
  if (!entry) return null;

  try {
    const bytes = await readFile(path.join(UPLOAD_DIR, name));
    return { bytes, contentType: entry.mime };
  } catch {
    return null;
  }
}

/**
 * True when a stored value is a path this app produced.
 *
 * Used by the profile update validation, which accepts a preset, an uploaded
 * file, or (for backwards compatibility with data entered before uploads
 * existed) an absolute http(s) URL.
 */
export function isUploadedMediaPath(value: string): boolean {
  return /^\/api\/media\/[A-Za-z0-9._-]+$/.test(value);
}
