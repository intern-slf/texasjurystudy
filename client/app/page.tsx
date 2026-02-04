"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
// Removed 'Zap' to resolve ESLint '@typescript-eslint/no-unused-vars'
import { ArrowRight, ShieldCheck } from "lucide-react"; 

// Section Imports
import { WhyFocusGroup } from "@/components/sections/why-focus-group";
import { HowItWorks } from "@/components/sections/how-it-works";
import { CTAFinal } from "@/components/sections/cta-final"; 

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
    transition: { 
      duration: 0.8, 
      ease: [0.16, 1, 0.3, 1] as const 
    } 
  },
};

export default function Home() {
  return (
    <main className="min-h-screen relative flex flex-col items-center text-center overflow-x-hidden bg-background">
      
      {/* Visual Depth Background Orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      {/* HERO SECTION */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center min-h-[95vh] justify-center px-6 max-w-7xl mx-auto"
      >
        {/* Label: Professional Research Platform Style */}
        <motion.div 
          variants={itemVariants}
          className="mb-8"
        >
          <span className="heading-elegant">
            Professional Research Platform
          </span>
        </motion.div>

        {/* Heading: Serif 'Playfair Display' Style */}
        <motion.h1 
          variants={itemVariants}
          className="text-6xl md:text-[85px] heading-display max-w-5xl mb-8 leading-[1.05]"
        >
          Elevate Your <span className="text-accent italic">Focus Group</span> Research
        </motion.h1>

        {/* Subtext: Sophisticated & Lightweight Typography */}
        <motion.p 
          variants={itemVariants}
          className="max-w-3xl text-lg md:text-[20px] text-muted-foreground font-light leading-relaxed mb-12"
        >
          A sophisticated platform designed for legal professionals to conduct 
          structured, demographic-driven focus group research with precision and elegance.
        </motion.p>

        {/* Action Buttons: Custom 'Desert Gold' Classes */}
        <motion.div 
          variants={itemVariants}
          className="flex flex-col sm:flex-row gap-6"
        >
          <Link
            href="/auth/signup?role=presenter"
            className="btn-gold"
          >
            Start as Presenter
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/auth/signup?role=participant"
            className="btn-outline-elegant"
          >
            Join as Participant
          </Link>
        </motion.div>

        {/* Professional Trust Indicator */}
        <motion.div 
          variants={itemVariants}
          className="mt-16 flex items-center gap-3 text-muted-foreground/50"
        >
          <ShieldCheck className="h-4 w-4 text-accent/60" />
          <p className="text-[10px] uppercase tracking-[0.3em] font-medium">
            Encrypted • Secure • Professional
          </p>
        </motion.div>
      </motion.div>

      {/* WHY FOCUS GROUP SECTION */}
      <div className="w-full relative z-20">
        <WhyFocusGroup />
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