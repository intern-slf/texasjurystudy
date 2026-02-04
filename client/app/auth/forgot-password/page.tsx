"use client";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-background overflow-hidden">
      {/* Visual Depth: Atmospheric background aura */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm space-y-8"
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center group-hover:bg-accent/30 transition-colors">
              <div className="h-2 w-2 rounded-full bg-accent" />
            </div>
            <span className="heading-display text-xl font-light tracking-tight">FocusGroup</span>
          </Link>
        </div>

        {/* The Form Container */}
        <div className="glass-card p-8 md:p-10 rounded-3xl border border-muted/50 bg-white/40 backdrop-blur-xl shadow-2xl">
          <ForgotPasswordForm />
        </div>

        {/* Footer Trust Indicator */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <div className="flex items-center gap-2 text-muted-foreground/50">
            <ShieldCheck className="h-3.5 w-3.5" />
            <p className="text-[10px] heading-elegant tracking-[0.3em] uppercase">
              Secure Recovery Protocol
            </p>
          </div>
        </div>
      </motion.div>
    </main>
  );
}