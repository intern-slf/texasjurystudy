"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

export default function Footer() {
  const [year, setYear] = useState<number | string>("");

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="relative mt-auto border-t border-muted/30 bg-background/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto py-10 px-6 sm:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          
          {/* Brand & Copyright */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded-full bg-accent/20 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-accent" />
              </div>
              <span className="heading-display text-sm font-light tracking-wide">FocusGroup</span>
            </div>
            <p className="heading-elegant text-[10px] text-muted-foreground tracking-[0.2em] uppercase">
              © {year} Texas Jury Research Platform
            </p>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center space-x-8">
            {["Privacy", "Terms", "Contact"].map((item) => (
              <motion.div key={item} whileHover={{ y: -1 }}>
                <Link 
                  href={`/${item.toLowerCase()}`} 
                  className="heading-elegant text-[10px] text-muted-foreground tracking-widest uppercase hover:text-accent transition-colors duration-300"
                >
                  {item}
                </Link>
              </motion.div>
            ))}
          </div>

        </div>

        {/* Decorative Bottom Line */}
        <div className="mt-10 h-px w-full bg-gradient-to-r from-transparent via-muted/20 to-transparent" />
        
        <div className="mt-4 text-center">
          <p className="text-[8px] heading-elegant text-muted-foreground/30 uppercase tracking-[0.4em]">
            Professional Integrity • Data Privacy • Legal Accuracy
          </p>
        </div>
      </div>
    </footer>
  );
}