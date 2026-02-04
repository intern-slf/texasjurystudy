"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Verification check
    supabase.auth.getUser().then(({ data }) => {
      // Public routes that don't need the secure initialization delay
      const isPublicRoute = pathname === "/" || pathname.startsWith("/auth");

      if (!data.user && !isPublicRoute) {
        router.replace("/auth/login");
      } else {
        // Maintain the high-end feel with a controlled entrance
        const timer = setTimeout(() => setLoading(false), 800);
        return () => clearTimeout(timer);
      }
    });
  }, [router, pathname]);

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: "blur(20px)" }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background overflow-hidden"
        >
          {/* Signature Gold background aura */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(180,149,85,0.08)_0%,transparent_70%)]" />
          
          <div className="z-10 flex flex-col items-center space-y-6">
            <div className="relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                className="h-12 w-12 rounded-full border-2 border-accent/10 border-t-accent shadow-[0_0_15px_rgba(180,149,85,0.1)]"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              </div>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center space-y-1"
            >
              <p className="heading-elegant text-accent text-[10px] tracking-[0.4em] uppercase font-bold">FocusGroup</p>
              <p className="text-[11px] heading-display text-muted-foreground/60 tracking-widest uppercase">Initializing Secure Session</p>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}