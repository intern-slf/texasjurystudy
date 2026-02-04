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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, Variants } from "framer-motion";

// 1. Explicitly type as Variants and use 'as const' for the easing tuple
const formContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.4 },
  },
};

const itemFade: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.5, 
      ease: [0.4, 0, 0.2, 1] as const // Fixes the easing array type error
    } 
  },
};

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Spreading props on a motion.div can sometimes cause event conflicts.
    // We wrap the motion logic inside the div that receives the props.
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <motion.div 
        variants={formContainer}
        initial="hidden"
        animate="visible"
      >
        <CardHeader className="p-0">
          <motion.div variants={itemFade}>
            <CardTitle className="text-3xl font-light heading-display">Welcome Back</CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              Enter your credentials to access your legal research dashboard.
            </CardDescription>
          </motion.div>
        </CardHeader>
        
        <CardContent className="p-0 mt-6">
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <motion.div variants={itemFade} className="grid gap-2">
                <Label htmlFor="email" className="heading-elegant text-[10px] text-accent">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/50 border-muted focus:border-accent transition-all"
                />
              </motion.div>
              
              <motion.div variants={itemFade} className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password" className="heading-elegant text-[10px] text-accent">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="ml-auto inline-block text-[10px] heading-elegant underline-offset-4 hover:text-accent transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/50 border-muted focus:border-accent transition-all"
                />
              </motion.div>

              {error && (
                <motion.p 
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 text-center"
                >
                  {error}
                </motion.p>
              )}

              <motion.div variants={itemFade}>
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-primary text-primary-foreground hover:shadow-lg transition-all rounded-full heading-elegant text-[11px]" 
                  disabled={isLoading}
                >
                  {isLoading ? "Authenticating..." : "Secure Login"}
                </Button>
              </motion.div>
            </div>

            <motion.div variants={itemFade} className="mt-8 text-center text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/auth/sign-up"
                className="underline underline-offset-4 hover:text-accent transition-colors font-medium"
              >
                Request Access
              </Link>
            </motion.div>
          </form>
        </CardContent>
      </motion.div>
    </div>
  );
}