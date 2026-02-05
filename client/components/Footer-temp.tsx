"use client";

import { useEffect, useState } from "react";

export default function Footer() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="w-full border-t bg-white">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-6 md:flex-row">
        <p className="text-sm text-gray-500">
          © {year ?? "—"} FocusGroup. All rights reserved.
        </p>

        <div className="flex gap-6 text-sm text-gray-600">
          <a href="/privacy" className="hover:text-blue-500">
            Privacy Policy
          </a>
          <a href="/terms" className="hover:text-blue-500">
            Terms of Service
          </a>
          <a href="/contact" className="hover:text-blue-500">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
