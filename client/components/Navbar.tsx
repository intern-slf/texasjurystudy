"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Navbar() {
  return (
    <nav className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md",
      "transition-all duration-300 ease-in-out"
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand Logo with Tactile Feedback */}
          <div className="flex-shrink-0">
            <Link href="/" className="group flex items-center gap-2">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="h-8 w-8 rounded-full bg-primary flex items-center justify-center"
              >
                <span className="text-[10px] font-bold text-primary-foreground">FG</span>
              </motion.div>
              <span className="text-xl font-light tracking-tight heading-display">
                Focus<span className="text-accent">Group</span>
              </span>
            </Link>
          </div>
          
          <div className="hidden md:flex space-x-8 items-center">
            {/* Login Link with Elegant Typography */}
            <Link 
              href="/auth/login" 
              className="heading-elegant text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>

            {/* High-Motion CTA Button */}
            <motion.div
              whileHover={{ y: -2 }}
              whileTap={{ y: 0 }}
            >
              <Link 
                href="/auth/signup?role=participant" 
                className={cn(
                  "bg-primary text-primary-foreground px-5 py-2 rounded-full",
                  "heading-elegant text-[10px] shadow-sm hover:shadow-md transition-all border border-primary/10"
                )}
              >
                Join as Participant
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </nav>
  );
}