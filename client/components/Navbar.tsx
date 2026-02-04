"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils"; 
import { Button } from "@/components/ui/button";

export default function Navbar() {
  return (
    <nav 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        "bg-background/80 backdrop-blur-md border-b border-border"
      )}
    >
      <div className="container mx-auto px-6 h-16 flex items-center justify-between max-w-7xl">
        
        {/* Brand Identity */}
        <Link href="/" className="flex items-center gap-2 group">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center transition-colors group-hover:bg-primary/90"
          >
            <span className="text-primary-foreground text-sm font-semibold">F</span>
          </motion.div>
          <span className="font-semibold text-lg tracking-tight heading-display text-[#1C1C1C]">
            FocusGroup
          </span>
        </Link>

        {/* Navigation Actions */}
        <div className="flex items-center gap-4">
          <Link href="/auth">
            <Button 
              variant="ghost" 
              className="text-[#1C1C1C]/60 hover:text-[#1C1C1C] hover:bg-accent/10 transition-all font-sans font-medium uppercase text-[12px] tracking-widest"
            >
              Sign In
            </Button>
          </Link>
          
          <Link href="/auth?mode=signup">
            <Button 
              className={cn(
                "bg-accent hover:bg-accent/90 transition-all shadow-sm rounded-md",
                "text-[#1C1C1C] font-sans font-semibold uppercase text-[12px] tracking-widest", // Corrected text color to Deep Onyx
                "px-4 py-2 h-auto" // Adjusted to 8px 16px padding equivalent
              )}
            >
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}