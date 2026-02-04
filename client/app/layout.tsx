import "./globals.css";
import { Inter } from "next/font/google"; // 1. Using Inter as the primary professional font
import Navbar from "@/components/Navbar"; 
import Footer from "@/components/sections/footer"; 
import RootLayoutClient from "./layout-client"; 
import { Metadata } from "next";

// 2. Configure Inter for the entire platform (72px headers to 14px labels)
const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-sans",
  display: 'swap',
});

export const metadata: Metadata = {
  title: "FocusGroup | Texas Jury Research Platform",
  description: "Structured legal focus groups with targeted demographic screening and real-time sentiment analysis.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 3. Injecting the Inter variable for global consistency
    <html lang="en" className={`scroll-smooth ${inter.variable}`}>
      <body
        suppressHydrationWarning
        className="min-h-screen flex flex-col bg-background text-foreground antialiased font-sans"
      >
        <Navbar />
        
        {/* Main container ensures the footer stays at the bottom */}
        <main className="flex-grow flex flex-col">
          {/* RootLayoutClient handles secure session initialization and entrance animations */}
          <RootLayoutClient>
            {children}
          </RootLayoutClient>
        </main>

        <Footer />
      </body>
    </html>
  );
}