import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import { UserCircle } from "lucide-react";

export async function AuthButton() {
  const supabase = await createClient();

  // getUser() is the secure choice for Server Components to prevent spoofing
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex items-center">
      {user ? (
        <div className="flex items-center gap-4 md:gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/30 border border-accent/10 backdrop-blur-md">
            <UserCircle className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] heading-elegant text-muted-foreground max-w-[120px] truncate tracking-wider">
              {user.email}
            </span>
          </div>
          <LogoutButton />
        </div>
      ) : (
        <div className="flex items-center gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
          <Link 
            href="/auth/login" 
            className="heading-elegant text-[10px] text-muted-foreground hover:text-accent tracking-[0.2em] uppercase transition-all"
          >
            Sign in
          </Link>
          
          <Button 
            asChild 
            size="sm" 
            className="rounded-full px-6 h-9 bg-primary text-primary-foreground heading-elegant text-[10px] tracking-widest shadow-xl shadow-primary/10 hover:shadow-accent/20 hover:-translate-y-0.5 transition-all active:scale-95"
          >
            <Link href="/auth/sign-up">Get Started</Link>
          </Button>
        </div>
      )}
    </div>
  );
}