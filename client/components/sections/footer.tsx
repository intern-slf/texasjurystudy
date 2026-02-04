"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Footer() {
  // 1. Prevent hydration mismatch for the dynamic year
  const [currentYear, setCurrentYear] = useState<number | string>("");

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="w-full py-16 px-6 bg-white border-t border-border/50 relative z-30">
      <div className="container mx-auto max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16 text-left">
          
          {/* Brand Identity: Matches the Navbar logo style */}
          <div className="col-span-1 md:col-span-2 space-y-6">
            <Link href="/" className="flex items-center gap-2 group w-fit">
              <div className="h-8 w-8 rounded-full bg-[#1C1C1C] flex items-center justify-center transition-transform group-hover:scale-110">
                <span className="text-[10px] font-bold text-white">FG</span>
              </div>
              <span className="font-semibold text-xl tracking-tight heading-display text-[#1C1C1C]">
                FocusGroup
              </span>
            </Link>
            <p className="text-[15px] text-[#1C1C1C]/70 max-w-xs font-light leading-relaxed">
              The premier platform for professional legal research and structured focus group studies.
            </p>
          </div>

          {/* Platform Links: Styled with the 14px Desert Gold labels */}
          <div className="flex flex-col">
            <h4 className="heading-elegant text-accent mb-6 font-medium">
              Platform
            </h4>
            <nav className="flex flex-col gap-4 text-sm font-light text-[#1C1C1C]/80">
              <Link href="/auth/signup?role=participant" className="hover:text-accent transition-colors w-fit">
                Join as Participant
              </Link>
              <Link href="/auth/signup?role=presenter" className="hover:text-accent transition-colors w-fit">
                Run a Study
              </Link>
            </nav>
          </div>

          {/* Legal Links */}
          <div className="flex flex-col">
            <h4 className="heading-elegant text-accent mb-6 font-medium">
              Legal
            </h4>
            <nav className="flex flex-col gap-4 text-sm font-light text-[#1C1C1C]/80">
              <Link href="/privacy" className="hover:text-accent transition-colors w-fit">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-accent transition-colors w-fit">
                Terms of Service
              </Link>
            </nav>
          </div>
        </div>

        {/* Bottom Bar: Professional tracking and muted onyx tones */}
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#1C1C1C]/40 font-medium">
            © {currentYear || "2026"} Texas Jury Study • All Rights Reserved
          </p>
          <p className="text-[10px] uppercase tracking-[0.4em] text-[#1C1C1C]/20 font-medium">
            Secure Access System V2.6
          </p>
        </div>
      </div>
    </footer>
  );
}