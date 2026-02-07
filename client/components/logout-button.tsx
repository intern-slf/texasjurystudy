"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    try {
      const supabase = createClient();

      // 1️⃣ Supabase logout (clears session + cookies)
      await supabase.auth.signOut();

      // 2️⃣ Firebase logout (clears Google session)
      await signOut(firebaseAuth);

      // 3️⃣ Redirect
      router.push("/auth/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <Button variant="outline" onClick={logout}>
      Logout
    </Button>
  );
}
