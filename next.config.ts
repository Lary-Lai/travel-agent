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
};

export default nextConfig;
