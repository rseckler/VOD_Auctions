import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tape-mag.com",
      },
    ],
  },
};

export default nextConfig;
