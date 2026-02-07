"use client";

import { googleLogin } from "@/lib/firebase-auth";
import { Button } from "./ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GoogleLoginClientButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await googleLogin();
      
      // Use router.push for a faster, single-page transition
      router.push("/dashboard");
      router.refresh(); 
    } catch (error) {
      console.error("Login sequence failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleGoogleLogin}
      disabled={loading}
    >
      {loading ? "Connecting..." : "Continue with Google"}
    </Button>
  );
}