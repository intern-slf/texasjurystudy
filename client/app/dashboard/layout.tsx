"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * IMPORTANT: If you still see a red line on these imports, 
 * rename the files to 'navbar-new.tsx' and 'footer-new.tsx' 
 * and update these paths accordingly to break the TS cache.
 */
import Navbar from "@/components/navbar"; 
import Footer from "@/components/footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const checkUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          router.replace("/auth/login");
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error("Auth check error:", error);
        router.replace("/auth/login");
      }
    };

    checkUser();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        {/* Subtle loading spinner to match your minimalist aesthetic */}
        <div className="w-6 h-6 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium text-gray-600 tracking-tight">Verifying session...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white selection:bg-black selection:text-white">
      {/* 1. Navbar: Positioned at the top */}
      <Navbar />

      {/* 2. Main Content: flex-1 ensures this area grows to fill the page, 
          pushing the footer to the bottom even on empty pages. */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* 3. Footer: Positioned at the bottom */}
      <Footer />
    </div>
  );
}