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
  // No other site may show ours in a frame (clickjacking: dressing up a Pay or
  // Accept button under a decoy page). frame-ancestors for current browsers,
  // X-Frame-Options for older ones. Nothing frames the app itself; framing
  // others, like the Loom embed, isn't affected.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
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
