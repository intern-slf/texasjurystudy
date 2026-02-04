"use client";

import { UpdatePasswordForm } from "@/components/update-password-form";
import { motion } from "framer-motion"; // Required for premium motion
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

// Animation Variants for orchestrated entrance
const containerVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1], // Premium cubic-bezier
      staggerChildren: 0.1,
    },
  },
};

const itemFade = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.5, ease: "easeOut" } 
  },
};

export default function Page() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center p-6 md:p-10 bg-background lg:bg-secondary/10 overflow-hidden relative">
      {/* Visual background depth elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 rounded-full bg-accent/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md z-10"
      >
        {/* Navigation back with elegant tracking */}
        <motion.div variants={itemFade} className="mb-8 flex justify-center">
          <Link 
            href="/auth/login" 
            className="group flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
            <span className="heading-elegant text-[10px] tracking-[0.2em]">Return to Account</span>
          </Link>
        </motion.div>

        <div className="glass-card p-1 shadow-2xl rounded-3xl border-accent/10">
          <div className="bg-white/90 backdrop-blur-sm p-8 rounded-[1.4rem] border border-white/50 space-y-8">
            {/* Security Header */}
            <motion.div variants={itemFade} className="text-center space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-2">
                <ShieldAlert className="h-6 w-6 text-accent" />
              </div>
              <h1 className="text-3xl font-light heading-display">
                Set New <span className="text-accent">Password</span>
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
                Secure your access by choosing a strong, unique password for your profile.
              </p>
            </motion.div>

            <motion.div variants={itemFade}>
              <UpdatePasswordForm />
            </motion.div>
          </div>
        </div>

        {/* Footer legal text */}
        <motion.p 
          variants={itemFade}
          className="text-center mt-10 text-[9px] heading-elegant text-muted-foreground/50 tracking-widest uppercase"
        >
          Encryption Standards V2.6 • Secure Update
        </motion.p>
      </motion.div>
    </div>
  );
}