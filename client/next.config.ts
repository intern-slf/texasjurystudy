import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["heic-convert", "libheif-js"],
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/**",
      },
    ],
  },
};

export default nextConfig;
