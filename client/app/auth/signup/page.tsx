"use client";

import { Suspense } from "react";
import { SignUpForm } from "@/components/sign-up-form";
import { motion, Variants } from "framer-motion";
import Link from "next/link";
// Fix: Correct package name is lucide-react
import { ShieldCheck } from "lucide-react"; 

/**
 * FocusGroup Animation Configuration
 * Using 'as const' to ensure cubic-bezier tuples are strictly typed.
 */
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
      ease: [0.4, 0, 0.2, 1] as const // Fixed: tuple assertion for Easing type
    } 
  },
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-background">
      {/* LEFT PANEL: Branding & Credibility Anchor */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-primary overflow-hidden"
      >
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 rounded-full bg-accent/5 blur-3xl" />
        
        <Link href="/" className="z-10 flex items-center gap-2 group">
          <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg shadow-accent/20">
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
          <motion.div variants={fadeUp} className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <p className="heading-elegant text-accent">Registration Portal</p>
          </motion.div>
          
          <motion.h1 variants={fadeUp} className="text-5xl font-light leading-tight text-primary-foreground heading-display">
            Join the Premier <br />
            <span className="text-accent text-6xl font-normal">Jury Study</span> <br />
            Network.
          </motion.h1>
          
          <motion.p variants={fadeUp} className="max-w-md text-lg text-primary-foreground/60 font-light leading-relaxed">
            Contribute your unique perspective to legal research. Our platform ensures 
            the highest standards of privacy and professional integrity for all participants.
          </motion.p>
        </motion.div>

        <div className="z-10">
          <p className="text-[10px] text-primary-foreground/30 heading-elegant tracking-[0.3em]">
            SECURE ACCESS SYSTEM V2.6
          </p>
        </div>
      </motion.div>

      {/* RIGHT PANEL: Interaction Area */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 md:p-10 bg-background lg:bg-secondary/20">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-sm"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-10 space-y-4">
            <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center shadow-2xl">
              <span className="text-sm font-bold text-primary-foreground">FG</span>
            </div>
            <h2 className="heading-display text-2xl">FocusGroup</h2>
          </div>

          <div className="glass-card shadow-2xl rounded-3xl border-accent/10 bg-white/80 backdrop-blur-sm p-8">
            <Suspense fallback={
              <div className="space-y-6">
                <div className="h-8 w-3/4 animate-pulse bg-muted rounded-md" />
                <div className="h-[300px] animate-pulse bg-muted rounded-xl" />
              </div>
            }>
              <SignUpForm />
            </Suspense>
          </div>

          <p className="mt-8 text-center text-[10px] text-muted-foreground heading-elegant">
            Protected by SSL Encryption • Privacy Guaranteed
          </p>
        </motion.div>
      </div>
    </div>
  );
}