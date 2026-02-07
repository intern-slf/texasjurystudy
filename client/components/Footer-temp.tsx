"use client";

import { useEffect, useState } from "react";

export default function Footer() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="w-full border-t bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-8 md:flex-row">
        {/* Copyright */}
        <p className="text-sm text-muted-foreground">
          © {year ?? "—"} Texas Jury Study. All rights reserved.
        </p>

        {/* Links */}
        <div className="flex items-center gap-8 text-sm">
          <a
            href="/privacy"
            className="transition-colors text-muted-foreground hover:text-primary"
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            className="transition-colors text-muted-foreground hover:text-primary"
          >
            Terms of Service
          </a>
          <a
            href="/contact"
            className="transition-colors text-muted-foreground hover:text-primary"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
