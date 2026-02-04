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
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { motion, Variants } from "framer-motion"; 
import { UserPlus, Mail } from "lucide-react";

// 1. Explicitly type as Variants and use 'as const' for the easing tuple
const formContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
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

function SignUpFormFields({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const role = searchParams.get("role") === "presenter" ? "presenter" : "participant";

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role },
          emailRedirectTo: `${window.location.origin}/auth/sign-up-success`,
        },
      });
      if (error) throw error;
      router.push("/auth/sign-up-success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // Decouple ...props from motion.div to resolve the onDrag/PanInfo mismatch
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <motion.div 
        variants={formContainer}
        initial="hidden"
        animate="visible"
      >
        <CardHeader className="p-0 text-center lg:text-left">
          <motion.div variants={itemFade} className="space-y-2">
            <div className="flex items-center justify-center lg:justify-start gap-2 mb-2">
              <UserPlus className="h-5 w-5 text-accent" />
              <span className="heading-elegant text-[10px] text-accent tracking-[0.2em] uppercase">Identity Setup</span>
            </div>
            <CardTitle className="text-3xl font-light heading-display">
              Sign up as <span className="text-accent italic capitalize">{role}</span>
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Create your secure account to join our research network.
            </CardDescription>
          </motion.div>
        </CardHeader>

        <CardContent className="p-0 mt-8">
          <form onSubmit={handleSignUp} className="space-y-6">
            <div className="flex flex-col gap-5">
              <motion.div variants={itemFade} className="grid gap-2">
                <Label htmlFor="email" className="heading-elegant text-[10px] text-accent">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
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

              <motion.div variants={itemFade} className="grid gap-2">
                <Label htmlFor="password" title="Password must be at least 6 characters" className="heading-elegant text-[10px] text-accent">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/50 border-muted focus:border-accent transition-all"
                />
              </motion.div>

              <motion.div variants={itemFade} className="grid gap-2">
                <Label htmlFor="repeat-password" className="heading-elegant text-[10px] text-accent">Verify Password</Label>
                <Input
                  id="repeat-password"
                  type="password"
                  required
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  className="bg-white/50 border-muted focus:border-accent transition-all"
                />
              </motion.div>

              {error && (
                <motion.p 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-xs text-destructive bg-destructive/5 p-3 rounded-lg border border-destructive/10 text-center font-medium"
                >
                  {error}
                </motion.p>
              )}

              <motion.div variants={itemFade} className="pt-2">
                <Button type="submit" className="w-full h-12 bg-primary text-primary-foreground hover:shadow-lg transition-all rounded-full heading-elegant text-[11px]" disabled={isLoading}>
                  {isLoading ? "Provisioning Account..." : "Create Account"}
                </Button>
              </motion.div>
            </div>

            <motion.div variants={itemFade} className="text-center pt-2">
              <p className="text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link href="/auth/login" className="underline underline-offset-4 hover:text-accent transition-colors font-medium">
                  Login
                </Link>
              </p>
            </motion.div>
          </form>
        </CardContent>
      </motion.div>
    </div>
  );
}

export function SignUpForm(props: React.ComponentPropsWithoutRef<"div">) {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="space-y-3">
          <div className="h-4 w-24 bg-accent/10 rounded-full" />
          <div className="h-8 w-64 bg-muted rounded-md" />
          <div className="h-4 w-full bg-muted/50 rounded-md" />
        </div>
        <div className="space-y-6 pt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-20 bg-accent/5 rounded" />
              <div className="h-10 w-full bg-muted/30 rounded-lg" />
            </div>
          ))}
          <div className="h-12 w-full bg-muted rounded-full mt-4" />
        </div>
      </div>
    }>
      <SignUpFormFields {...props} />
    </Suspense>
  );
}