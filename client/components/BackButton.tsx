"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type BackButtonProps = {
  /**
   * Explicit destination. Prefer this over history navigation — it stays
   * predictable when the user landed on the page from an email link or a
   * fresh tab, where there is nothing to go back to.
   */
  href?: string;
  /** Defaults to "Back". Keep it specific, e.g. "Back to Cases". */
  label?: string;
  className?: string;
};

const BASE_CLASSES =
  "group inline-flex items-center gap-1.5 -ml-2 rounded-md px-2 py-1.5 text-sm font-medium " +
  "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function BackButton({
  href,
  label = "Back",
  className = "",
}: BackButtonProps) {
  const router = useRouter();

  const content = (
    <>
      <ArrowLeft
        aria-hidden="true"
        className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
      />
      {label}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${BASE_CLASSES} ${className}`}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`${BASE_CLASSES} ${className}`}
    >
      {content}
    </button>
  );
}
