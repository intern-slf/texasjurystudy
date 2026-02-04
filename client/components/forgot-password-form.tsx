"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } 
  },
};

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="text-center space-y-6 py-4"
          >
            <div className="mx-auto h-16 w-16 rounded-full bg-accent/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-8 w-8 text-accent animate-in zoom-in duration-500" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-light heading-display">Check Your Email</CardTitle>
              <CardDescription className="text-muted-foreground">
                We've sent recovery instructions to your inbox.
              </CardDescription>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed px-4">
              If an account exists for {email}, you will receive a link to reset your password shortly.
            </p>
            <div className="pt-4">
              <Link href="/auth/login" className="heading-elegant text-[10px] text-accent flex items-center justify-center gap-2 hover:opacity-70 transition-opacity">
                <ArrowLeft className="h-3 w-3" /> Back to Login
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.1 } }
            }}
          >
            <CardHeader className="p-0 mb-8">
              <motion.div variants={fadeUp}>
                <CardTitle className="text-3xl font-light heading-display">Reset Password</CardTitle>
                <CardDescription className="mt-2">
                  Enter your email to receive a secure recovery link.
                </CardDescription>
              </motion.div>
            </CardHeader>

            <CardContent className="p-0">
              <form onSubmit={handleForgotPassword} className="space-y-6">
                <motion.div variants={fadeUp} className="grid gap-2">
                  <Label htmlFor="email" className="heading-elegant text-[10px] text-accent">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-white/50 border-muted focus:border-accent transition-all"
                    />
                  </div>
                </motion.div>

                {error && (
                  <motion.p 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    className="text-xs text-destructive bg-destructive/5 p-3 rounded-lg border border-destructive/10 text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <motion.div variants={fadeUp}>
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-primary text-primary-foreground hover:shadow-lg transition-all rounded-full heading-elegant text-[11px]" 
                    disabled={isLoading}
                  >
                    {isLoading ? "Generating Link..." : "Send Recovery Link"}
                  </Button>
                </motion.div>

                <motion.div variants={fadeUp} className="text-center pt-2">
                  <Link
                    href="/auth/login"
                    className="heading-elegant text-[10px] text-muted-foreground hover:text-accent transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="h-3 w-3" /> Return to Login
                  </Link>
                </motion.div>
              </form>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}