"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Role = "requestee" | "participant" | null;

function homeHrefForRole(role: Role): string {
  if (role === "requestee") return "/requestee";
  if (role === "participant") return "/participants";
  return "/";
}

export default function Navbar() {
  const pathname = usePathname();
  const [role, setRole] = useState<Role>(null);

  useEffect(() => {
    const supabase = createClient();

    const readRole = (metadataRole: unknown): Role => {
      if (metadataRole === "requestee" || metadataRole === "participant") {
        return metadataRole;
      }
      return null;
    };

    supabase.auth.getUser().then(({ data: { user } }) => {
      setRole(readRole(user?.user_metadata?.role));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setRole(readRole(session?.user?.user_metadata?.role));
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const navItems = [
    { label: "Home", href: homeHrefForRole(role) },
    { label: "Login", href: "/auth/login" },
    { label: "Sign Up", href: "/auth/signup" },
  ];

  return (
    <header className="sticky top-0 z-[999] w-full border-b bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Texas Jury Study logo"
            width={140}
            height={36}
            priority
            className="object-contain"
          />
        </Link>

        {/* Navigation */}
        <div className="flex items-center gap-8">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative text-sm font-medium transition-colors ${isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-primary"
                  }`}
              >
                {item.label}

                {/* Active underline */}
                {isActive && (
                  <span className="absolute -bottom-1 left-0 h-[2px] w-full rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
