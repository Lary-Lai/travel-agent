import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Remote photography + placeholder avatars come from these two hosts.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
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
