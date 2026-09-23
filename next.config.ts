import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Remote listing photography. Avatars are bundled in /public/avatars now
    // (i.pravatar.cc started returning 403 for every request).
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
    // Next 16 defaults `qualities` to [75]; the seed builds URLs with q=75.
    qualities: [75],
  },
  /**
   * `@napi-rs/canvas` ships a native .node binary and must stay a runtime
   * require. `unpdf` embeds pdf.js, which also does not survive bundling.
   * Both are only used server-side to rasterise scanned PDFs for OCR.
   */
  serverExternalPackages: ["@napi-rs/canvas", "unpdf"],
};

export default nextConfig;
