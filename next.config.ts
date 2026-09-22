import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
