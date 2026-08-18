"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";
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
    | { kind: "link"; label: string; href: string; cta?: true }
    | { kind: "logout" }
    | { kind: "account" };

  const navItems: NavEntry[] = [
    { kind: "link", label: "Home", href: homeHrefForRole(role) },
    signedIn
      ? { kind: "logout" }
      : { kind: "link", label: "Login", href: "/auth/login" },
    signedIn
      ? { kind: "account" }
      : { kind: "link", label: "Sign Up", href: "/auth/signup", cta: true },
  ];

  const renderItem = (item: NavEntry) => {
    if (item.kind === "logout") {
      return <LogoutButton variant="outline" size="sm" className="h-9 px-4 text-sm" />;
    }

    if (item.kind === "account") {
      return <AccountButton />;
    }

    // The sign-up slot is the one call to action on the bar, so it carries the
    // solid fill; everything else stays quiet until hovered.
    if (item.cta) {
      return (
        <Link
          href={item.href}
          className={buttonVariants({ size: "sm", className: "h-9 px-4 text-sm shadow-sm" })}
        >
          {item.label}
        </Link>
      );
    }

    const isActive = pathname === item.href;

    return (
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          isActive
            ? "bg-secondary text-primary"
            : "text-muted-foreground hover:bg-secondary/70 hover:text-primary"
        }`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-[999] w-full border-b bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Logo className="h-9 w-auto" />
        </Link>

        {/* Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {navItems.map((item, index) => (
            <Fragment key={item.kind === "link" ? item.href : item.kind}>
              {/* Separates the page links from the account actions. */}
              {index === 1 && (
                <span
                  aria-hidden="true"
                  className="mx-1 hidden h-5 w-px bg-border sm:block"
                />
              )}
              {renderItem(item)}
            </Fragment>
          ))}
        </div>
      </nav>
    </header>
  );
}
