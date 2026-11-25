import "./lib/env";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

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

// Sentry (instrumentation.ts) only needs this wrapper to upload source maps,
// so its stack traces name our files and lines. It does that when
// SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are set in Vercel, and skips
// it otherwise; the build never fails on it.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  telemetry: false,
});
