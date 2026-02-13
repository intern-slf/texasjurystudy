"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { Loader2 } from "lucide-react";

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
      // 1. Authenticate the user
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (authError) throw authError;

      // 2. Fetch the user's role from the roles table
      const { data: roleData, error: roleError } = await supabase
        .from("roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .single();

      if (roleError) {
        console.error("Role fetch error:", roleError.message);
        // Default redirect if role check fails
        router.push("/dashboard");
        return;
      }

      // 3. Conditional redirection based on role
      if (roleData?.role === "admin") {
        router.push("/dashboard/Admin");
      } else {
        router.push("/dashboard");
      }

    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
  <div
    className={cn(
      "flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-500/10 via-background to-purple-500/10 px-4",
      className
    )}
    {...props}
  >
    <Card className="w-full max-w-md border border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl rounded-2xl">
      <CardHeader className="space-y-2 text-center pb-2">
        <CardTitle className="text-3xl font-bold tracking-tight">
          Welcome Back
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Login to access your dashboard
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleLogin} className="space-y-6">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="email@address.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 bg-background/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 transition-all"
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-primary hover:underline transition"
              >
                Forgot?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 bg-background/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 transition-all"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* Button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full text-base font-semibold rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </Button>

          {/* Footer */}
          <p className="pt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="font-medium text-primary hover:underline transition"
            >
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  </div>
);

}
