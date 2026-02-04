"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { motion } from "framer-motion";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Use replace for a clean state reset
    router.replace("/auth/login");
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Button 
        variant="ghost" 
        onClick={logout}
        className="rounded-full px-4 h-9 flex items-center gap-2 group hover:bg-destructive/5 hover:text-destructive transition-all"
      >
        <LogOut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive transition-colors" />
        <span className="heading-elegant text-[10px] tracking-widest uppercase">
          Sign Out
        </span>
      </Button>
    </motion.div>
  );
}