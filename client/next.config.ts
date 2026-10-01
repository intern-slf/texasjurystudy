import "./lib/env";
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
  // The project's *.vercel.app URL still serves the app, which splits links
  // and login sessions across two hosts. Send it to the custom domain; the
  // query string carries over, so old email-action links keep working.
  // Matched on the exact host, so preview deployments are left alone.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "texasjurystudy.vercel.app" }],
        destination: "https://www.texasjurystudy.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
