"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { LogoutButton } from "@/components/logout-button";
import AccountButton from "@/components/AccountButton";
import { readRole, type Role } from "@/lib/auth-role";
import { rememberVisit } from "@/lib/last-visited";

function homeHrefForRole(role: Role): string {
  if (role === "requestee") return "/requestee";
  if (role === "participant") return "/participants";
  return "/";
}

export default function Navbar({
  initialSignedIn,
  initialRole = null,
}: {
  /** Resolved on the server so the first paint already shows the right links. */
  initialSignedIn: boolean;
  initialRole?: Role;
}) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role>(initialRole);
  const [signedIn, setSignedIn] = useState<boolean>(initialSignedIn);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    // Both writers below read the same local session, so whichever settles last
    // still writes the same answer. Mixing in getUser() (a network call) raced
    // with onAuthStateChange's immediate INITIAL_SESSION event and could leave
    // signedIn stuck at false for a signed-in user.
    const apply = (user: { user_metadata?: { role?: unknown } } | null) => {
      if (!active) return;
      setRole(readRole(user?.user_metadata?.role));
      setSignedIn(Boolean(user));
    };

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => apply(session?.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.user ?? null),
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // The navbar sits in the root layout, so it sees every navigation — which
  // makes it the one place that can remember where the user was when they
  // wander back out to Home.
  useEffect(() => {
    rememberVisit(pathname);
  }, [pathname]);

  // Signing in swaps the last two slots: Login becomes Logout, Sign Up becomes
  // the account icon. Keeping them in the list preserves their positions.
  type NavEntry =
    | { kind: "link"; label: string; href: string }
    | { kind: "logout" }
    | { kind: "account" };

  const navItems: NavEntry[] = [
    { kind: "link", label: "Home", href: homeHrefForRole(role) },
    signedIn
      ? { kind: "logout" }
      : { kind: "link", label: "Login", href: "/auth/login" },
    signedIn
      ? { kind: "account" }
      : { kind: "link", label: "Sign Up", href: "/auth/signup" },
  ];

  return (
    <header className="sticky top-0 z-[999] w-full border-b bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-9 w-auto" />
        </Link>

        {/* Navigation */}
        <div className="flex items-center gap-8">
          {navItems.map((item) => {
            if (item.kind === "logout") {
              return (
                <LogoutButton
                  key="logout"
                  variant="ghost"
                  size="sm"
                  // Stripped back to match the plain text links beside it.
                  className="h-auto p-0 text-sm font-medium text-muted-foreground transition-colors hover:bg-transparent hover:text-primary"
                />
              );
            }

            if (item.kind === "account") {
              return (
                <AccountButton
                  key="account"
                  className="text-muted-foreground transition-colors hover:text-primary"
                />
              );
            }

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
