"use client";

import { NextLogo } from "./next-logo";
import { SupabaseLogo } from "./supabase-logo";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

// Animation Variants for choreographed entry
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

export function Hero() {
  return (
    <div className="flex flex-col gap-12 items-center py-12">
      {/* Logos: Strategic Partnership View */}
      <motion.div 
        custom={0}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="flex gap-8 justify-center items-center grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
      >
        <a
          href="https://supabase.com/"
          target="_blank"
          rel="noreferrer"
          className="hover:scale-105 transition-transform"
        >
          <SupabaseLogo />
        </a>
        <span className="border-l border-muted h-6 rotate-12" />
        <a 
          href="https://nextjs.org/" 
          target="_blank" 
          rel="noreferrer"
          className="hover:scale-105 transition-transform"
        >
          <NextLogo />
        </a>
      </motion.div>

      {/* Main Brand Section */}
      <div className="space-y-6 text-center">
        <motion.div 
          custom={1}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20"
        >
          <ShieldCheck className="h-3 w-3 text-accent" />
          <span className="heading-elegant text-[10px] text-accent tracking-[0.2em] uppercase">
            Texas Professional Standards
          </span>
        </motion.div>

        <motion.h1 
          custom={2}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="sr-only"
        >
          FocusGroup: Professional Jury Study Infrastructure
        </motion.h1>
        
        <motion.p 
          custom={3}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="text-4xl lg:text-5xl font-light heading-display !leading-[1.15] mx-auto max-w-2xl text-center"
        >
          The premier infrastructure for <br />
          <span className="text-accent">Modern Legal Research.</span>
        </motion.p>
      </div>

      {/* Premium Separator */}
      <motion.div 
        custom={4}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="w-full max-w-md h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent my-4" 
      />
      
      <motion.p
        custom={5}
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        className="text-[10px] heading-elegant text-muted-foreground tracking-widest uppercase"
      >
        Built with Supabase • Powered by Next.js
      </motion.p>
    </div>
  );
}