import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";

import Navbar from "@/components/Navbar-temp";
import Footer from "@/components/Footer-temp";
import { createClient } from "@/lib/supabase/server";
import { readRole } from "@/lib/auth-role";

// Without this, Next.js resolves the og/twitter image URLs against Vercel's
// project URL, which pointed link previews at the old *.vercel.app domain.
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  metadataBase: appUrl ? new URL(appUrl) : undefined,
  title: "Texas Jury Study",
  description: "Structured focus groups with the right people",
  // app/apple-icon.png is served by Next.js, but an explicit `icons` object
  // suppresses its automatic <link>, so it is listed here too.
  icons: {
    icon: "/cropped-tjs-fav@2x-8-32x32.png",
    apple: "/apple-icon.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved here rather than in the client so the very first paint already
  // shows Login (signed out) or Logout (signed in) — no flash of the wrong one.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | { user_metadata?: { role?: unknown } }
    | undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background text-foreground">

        {/* ✅ Prevent blocking route */}
        <Suspense fallback={<div className="h-16 border-b bg-white" />}>
          <Navbar
            initialSignedIn={Boolean(claims)}
            initialRole={readRole(claims?.user_metadata?.role)}
          />
        </Suspense>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <Suspense fallback={<div className="h-20 bg-white border-t" />}>
          <Footer />
        </Suspense>

      </body>
    </html>
  );
}
