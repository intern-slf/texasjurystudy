import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";

import Navbar from "@/components/Navbar-temp";
import Footer from "@/components/Footer-temp";

export const metadata: Metadata = {
  title: "FocusGroup",
  description: "Structured focus groups with the right people",
  icons: {
    icon: "/cropped-tjs-fav@2x-8-32x32.png",
    shortcut: "/icon.png?v=1",
    apple: "/icon.png?v=1",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        
        {/* ✅ Prevent blocking route */}
        <Suspense fallback={<div className="h-16 border-b bg-white" />}>
          <Navbar />
        </Suspense>

        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
          {children}
        </main>

        <Suspense fallback={<div className="h-20 bg-white border-t" />}>
          <Footer />
        </Suspense>

      </body>
    </html>
  );
}
