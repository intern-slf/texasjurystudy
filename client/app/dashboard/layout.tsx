"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion"; // Required for premium motion
import { Loader2 } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Since middleware handles redirects, this is a secondary safety check 
    // and initialization step for the client state.
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/auth/login");
      } else {
        // Subtle delay to allow the "Entrance Aura" to be felt
        const timer = setTimeout(() => setLoading(false), 800);
        return () => clearTimeout(timer);
      }
    });
  }, [router]);

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden"
        >
          {/* Subtle background aura */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(180,149,85,0.05)_0%,transparent_70%)]" />
          
          <div className="z-10 flex flex-col items-center space-y-6">
            <div className="relative">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="h-12 w-12 rounded-full border-2 border-accent/20 border-t-accent"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              </div>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center space-y-1"
            >
              <p className="heading-elegant text-accent text-[10px] tracking-[0.3em]">FocusGroup</p>
              <p className="text-sm font-light heading-display text-muted-foreground">Initializing Secure Session...</p>
            </motion.div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0, filter: "blur(10px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}