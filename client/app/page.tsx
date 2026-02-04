"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap } from "lucide-react";

// Animation Variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } 
  },
};

export default function Home() {
  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center px-6 text-center overflow-hidden bg-background">
      {/* Visual Depth Background Orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center"
      >
        {/* Badge Indicator */}
        <motion.div 
          variants={itemVariants}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 border border-muted mb-8"
        >
          <Zap className="h-3 w-3 text-accent" />
          <span className="heading-elegant text-[10px] text-accent tracking-widest uppercase">
            Texas Jury Research Platform
          </span>
        </motion.div>

        {/* Hero Title */}
        <motion.h1 
          variants={itemVariants}
          className="text-5xl md:text-7xl font-light tracking-tight heading-display max-w-4xl leading-[1.1]"
        >
          Structured focus groups with the <span className="text-accent italic">right people.</span>
        </motion.h1>

        {/* Hero Description */}
        <motion.p 
          variants={itemVariants}
          className="mt-8 max-w-2xl text-lg md:text-xl text-muted-foreground font-light leading-relaxed"
        >
          Enable professional legal research through targeted demographic screening, 
          real-time sentiment analysis, and structured pre-session questionnaires.
        </motion.p>

        {/* High-Motion CTA Buttons */}
        <motion.div 
          variants={itemVariants}
          className="mt-12 flex flex-col sm:flex-row gap-6"
        >
          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/auth/signup?role=participant"
              className="px-8 py-4 rounded-full bg-primary text-primary-foreground font-medium heading-elegant text-[11px] shadow-xl hover:shadow-accent/20 transition-all flex items-center gap-2"
            >
              Join as Participant
              <ArrowRight className="h-4 w-4 text-accent" />
            </Link>
          </motion.div>

          <motion.div whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/auth/signup?role=presenter"
              className="px-8 py-4 rounded-full border border-muted bg-white/50 backdrop-blur-sm font-medium heading-elegant text-[11px] hover:bg-white hover:shadow-md transition-all flex items-center gap-2"
            >
              Run a Focus Group
            </Link>
          </motion.div>
        </motion.div>

        {/* Trust Indicator */}
        <motion.div 
          variants={itemVariants}
          className="mt-12 flex items-center gap-2 text-muted-foreground/60"
        >
          <ShieldCheck className="h-4 w-4" />
          <p className="text-[10px] heading-elegant tracking-widest uppercase">
            Encrypted • Secure • Professional
          </p>
        </motion.div>
      </motion.div>
    </main>
  );
}