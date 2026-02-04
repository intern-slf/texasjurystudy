"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export default function DashboardRouter() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/auth/login");
        return;
      }

      // Fetching role with a slight delay to ensure smooth transition
      const { data: roleData } = await supabase
        .from("roles")
        .select("role")
        .eq("user_id", data.user.id)
        .single();

      if (roleData?.role === "participant") {
        router.replace("/dashboard/participant");
      } else if (roleData?.role === "presenter") {
        router.replace("/dashboard/presenter/onboarding");
      } else {
        router.replace("/");
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background visual depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(180,149,85,0.03)_0%,transparent_70%)]" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="z-10 flex flex-col items-center space-y-8"
      >
        {/* Animated Brand Ring */}
        <div className="relative">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
            className="h-20 w-20 rounded-full border border-accent/10 border-t-accent shadow-[0_0_15px_rgba(180,149,85,0.1)]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <span className="text-[8px] font-bold text-primary-foreground tracking-tighter uppercase">Focus</span>
            </div>
          </div>
        </div>

        {/* Status Messaging */}
        <div className="text-center space-y-2">
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="heading-elegant text-accent text-[10px] tracking-[0.4em] uppercase"
          >
            Authentication Verified
          </motion.p>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground font-light heading-display text-sm"
          >
            Routing to your workspace...
          </motion.p>
        </div>
      </motion.div>

      {/* Subtle versioning footer */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        className="absolute bottom-10 text-[8px] heading-elegant tracking-widest text-muted-foreground"
      >
        SECURE GATEWAY V2.6
      </motion.div>
    </div>
  );
}