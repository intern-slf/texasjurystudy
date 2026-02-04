"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap } from "lucide-react";

// Section Imports
import { Features } from "@/components/sections/features";
import { HowItWorks } from "@/components/sections/how-it-works";
import { CTAFinal } from "@/components/sections/cta-final";

// Animation Variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } 
  },
};

export default function Home() {
  return (
    <main className="min-h-screen relative flex flex-col items-center text-center overflow-x-hidden bg-background">
      
      {/* Visual Depth Background Orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      {/* HERO SECTION */}
      <section className="px-6 w-full max-w-7xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative z-10 flex flex-col items-center min-h-[90vh] justify-center pt-20"
        >
          <motion.div 
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border border-muted mb-8"
          >
            <Zap className="h-3 w-3 text-accent" />
            <span className="heading-elegant text-[10px] text-accent tracking-widest uppercase font-bold">
              Texas Jury Research Platform
            </span>
          </motion.div>

          <motion.h1 
            variants={itemVariants}
            className="text-5xl md:text-7xl font-light tracking-tight heading-display max-w-4xl leading-[1.1] text-foreground"
          >
            Structured focus groups with the <span className="text-accent italic">right people.</span>
          </motion.h1>

          <motion.p 
            variants={itemVariants}
            className="mt-8 max-w-2xl text-lg md:text-xl text-muted-foreground font-light leading-relaxed"
          >
            Enable professional legal research through targeted demographic screening, 
            real-time sentiment analysis, and structured pre-session questionnaires.
          </motion.p>

          <motion.div 
            variants={itemVariants}
            className="mt-12 flex flex-col sm:flex-row gap-6"
          >
            <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/auth/signup?role=participant"
                className="px-8 py-4 rounded-full bg-primary text-primary-foreground font-medium heading-elegant text-[11px] shadow-xl hover:shadow-accent/20 transition-all flex items-center gap-2 uppercase tracking-widest"
              >
                Join as Participant
                <ArrowRight className="h-4 w-4 text-accent" />
              </Link>
            </motion.div>

            <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/auth/signup?role=presenter"
                className="px-8 py-4 rounded-full border border-muted bg-white/50 backdrop-blur-sm font-medium heading-elegant text-[11px] hover:bg-white hover:shadow-md transition-all flex items-center gap-2 uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Run a Focus Group
              </Link>
            </motion.div>
          </motion.div>

          <motion.div 
            variants={itemVariants}
            className="mt-16 flex items-center gap-2 text-muted-foreground/40"
          >
            <ShieldCheck className="h-4 w-4" />
            <p className="text-[9px] heading-elegant tracking-[0.3em] uppercase font-bold">
              Encrypted • Secure • Professional
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* FEATURES SECTION - The new block we added */}
      <div className="w-full relative z-20">
        <Features />
      </div>

      {/* PROCESS SECTION */}
      <div className="w-full relative z-20">
        <HowItWorks />
      </div>

      {/* FINAL CTA SECTION */}
      <div className="w-full relative z-20">
         <CTAFinal />
      </div>

    </main>
  );
}