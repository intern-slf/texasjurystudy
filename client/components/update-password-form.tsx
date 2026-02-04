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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Lock } from "lucide-react";

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } 
  },
};

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      
      // Redirect to the dashboard router for role-based placement
      router.push("/dashboard");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.1 } }
      }}
      className={cn("flex flex-col gap-6", className)} 
      {...props}
    >
      <CardHeader className="p-0 mb-6">
        <motion.div variants={itemVariants} className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <span className="heading-elegant text-[10px] text-accent tracking-[0.2em] uppercase">Security Protocol</span>
          </div>
          <CardTitle className="text-3xl font-light heading-display">Secure Your Account</CardTitle>
          <CardDescription className="text-muted-foreground font-light">
            Please establish a new, strong password to finalize your access.
          </CardDescription>
        </motion.div>
      </CardHeader>

      <CardContent className="p-0">
        <form onSubmit={handleUpdatePassword} className="space-y-6">
          <div className="flex flex-col gap-5">
            <motion.div variants={itemVariants} className="grid gap-2">
              <Label htmlFor="password" className="heading-elegant text-[10px] text-accent">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 6 characters"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-white/50 border-muted focus:border-accent transition-all"
                />
              </div>
            </motion.div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs text-destructive bg-destructive/5 p-3 rounded-lg border border-destructive/10 text-center"
              >
                {error}
              </motion.p>
            )}

            <motion.div variants={itemVariants} className="pt-2">
              <Button 
                type="submit" 
                className="w-full h-12 bg-primary text-primary-foreground hover:shadow-lg transition-all rounded-full heading-elegant text-[11px]" 
                disabled={isLoading}
              >
                {isLoading ? "Encrypting & Saving..." : "Save New Password"}
              </Button>
            </motion.div>
          </div>
        </form>
      </CardContent>
    </motion.div>
  );
}