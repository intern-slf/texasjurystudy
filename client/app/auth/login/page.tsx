"use client";

import { LoginForm } from "@/components/login-form";
import { motion, Variants } from "framer-motion"; // Added Variants type
import Link from "next/link";

// 1. Explicitly type as Variants and use 'as const' for the easing tuple
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.6, 
      ease: [0.22, 1, 0.36, 1] as const // Fixes the easing array type error
    } 
  },
};

export default function Page() {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-background">
      {/* LEFT PANEL: Branding & Visual Anchor */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-primary overflow-hidden"
      >
        {/* Background Decorative Element */}
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 rounded-full bg-accent/10 blur-3xl" />
        
        <Link href="/" className="z-10 flex items-center gap-2 group">
          <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center transition-transform group-hover:scale-110">
            <span className="text-xs font-bold text-accent-foreground">FG</span>
          </div>
          <span className="heading-display text-2xl text-primary-foreground tracking-tight">
            FocusGroup
          </span>
        </Link>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="z-10 space-y-6"
        >
          <motion.p variants={fadeUp} className="heading-elegant text-accent">
            Professional Research Platform
          </motion.p>
          <motion.h1 variants={fadeUp} className="text-5xl font-light leading-tight text-primary-foreground heading-display">
            Unlock Insights. <br />
            <span className="text-accent">Shape the Future</span> <br />
            of Legal Study.
          </motion.h1>
          <motion.p variants={fadeUp} className="max-w-md text-lg text-primary-foreground/60 font-light">
            {/* 2. Escaped apostrophe for linting compliance */}
            Join the nation&apos;s premier jury research platform designed for precision, 
            privacy, and meaningful results.
          </motion.p>
        </motion.div>

        <div className="z-10">
          <p className="text-xs text-primary-foreground/40 heading-elegant">
            © 2026 TEXAS JURY STUDY
          </p>
        </div>
      </motion.div>

      {/* RIGHT PANEL: Form Area */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 md:p-10 bg-background lg:bg-secondary/20">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-sm space-y-8"
        >
          {/* Mobile-only Logo */}
          <div className="lg:hidden flex flex-col items-center mb-8 space-y-4">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <span className="text-sm font-bold text-primary-foreground">FG</span>
            </div>
            <h2 className="heading-display text-2xl">FocusGroup</h2>
          </div>

          <div className="glass-card p-8 rounded-2xl border-muted/50 bg-white/50">
            <LoginForm />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Protected by secure encryption. <br />
            By signing in, you agree to our <Link href="#" className="underline hover:text-accent">Terms of Service</Link>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}