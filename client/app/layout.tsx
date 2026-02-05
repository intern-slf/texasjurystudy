import "./globals.css";
import type { Metadata } from "next";

import Navbar from "@/components/Navbar-temp";
import Footer from "@/components/Footer-temp";

export const metadata: Metadata = {
  title: "FocusGroup",
  description: "Structured focus groups with the right people",
  icons: {
    // Adding a version query (?v=1) tells the browser this is a new file
    icon: "/icon.png?v=1", 
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
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}