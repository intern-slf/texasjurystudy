"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Login", href: "/auth/login" },
  { label: "Sign Up", href: "/auth/signup" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky position-fix top-1 z-500 w-full border-b bg-background shadow-sm">
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
                className={`relative text-sm font-medium transition-colors ${
                  isActive
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
