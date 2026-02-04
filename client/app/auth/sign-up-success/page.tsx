"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { motion, Variants } from "framer-motion";
import { MailCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";

// Explicitly type the variants to resolve TS error 2322
const containerVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.5,
      // 'as const' tells TS this is a fixed tuple of 4 numbers, not just a generic array
      ease: [0.4, 0, 0.2, 1] as const, 
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-background lg:bg-secondary/20">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        <Card className="glass-card border-accent/20 overflow-hidden shadow-2xl">
          <CardHeader className="text-center pt-10">
            <motion.div 
              variants={itemVariants}
              className="mx-auto h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center mb-6"
            >
              <MailCheck className="h-8 w-8 text-accent" />
            </motion.div>
            
            <motion.div variants={itemVariants} className="space-y-2">
              <p className="heading-elegant text-accent text-[10px] tracking-[0.2em]">Verification Required</p>
              <CardTitle className="text-3xl font-light heading-display">
                Confirm Your <span className="text-accent">Account</span>
              </CardTitle>
              <CardDescription className="text-muted-foreground pt-2">
                We have sent a secure confirmation link to your inbox.
              </CardDescription>
            </motion.div>
          </CardHeader>

          <CardContent className="px-10 pb-10 text-center space-y-8">
            <motion.p variants={itemVariants} className="text-sm text-muted-foreground leading-relaxed">
              Thank you for registering with FocusGroup. To maintain the integrity of 
              our legal research platform, please verify your email address to activate 
              your dashboard access.
            </motion.p>

            <motion.div variants={itemVariants} className="pt-4">
              <Link href="/auth/login">
                <button className="inline-flex items-center gap-2 heading-elegant text-[10px] text-muted-foreground hover:text-accent transition-colors group">
                  <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
                  Return to Login
                </button>
              </Link>
            </motion.div>
          </CardContent>

          {/* Bottom decorative bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        </Card>
        
        <motion.p 
          variants={itemVariants}
          className="text-center mt-8 text-[10px] heading-elegant text-muted-foreground/60 tracking-widest"
        >
          © 2026 TEXAS JURY STUDY
        </motion.p>
      </motion.div>
    </div>
  );
}