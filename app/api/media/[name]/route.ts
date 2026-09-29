import type { NextRequest } from "next/server";

import { readUpload } from "@/lib/uploads";

export const runtime = "nodejs";

/**
 * GET /api/media/[name]
 *
 * Serve a stored upload. Public on purpose: an avatar or banner appears on a
 * public profile page, so requiring a session would break those pages for
 * signed-out visitors.
 *
 * The headers are the security-relevant part. `nosniff` stops the browser from
 * deciding a stored file is really HTML based on its first bytes, and the
 * content type is pinned to a whitelist rather than echoed from the request —
 * together those are what make "upload an image" stay an image.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const file = await readUpload(decodeURIComponent(name));

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      // Safe to cache hard: the filename contains 64 bits of randomness and is
      // never reused, so a given URL always maps to the same bytes.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
