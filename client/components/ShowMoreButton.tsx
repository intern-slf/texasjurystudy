"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function ShowMoreButton({ nextLimit }: { nextLimit: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleClick() {
    // Save current selections to sessionStorage before navigating
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="participants"]'
    );

    const checkedIds: string[] = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) checkedIds.push(cb.value);
    });
    sessionStorage.setItem("session_builder_checked", JSON.stringify(checkedIds));

    // Navigate with only the limit incremented — no IDs in URL
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(nextLimit));
    params.delete("shownIds");
    params.delete("checkedIds");

    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="block w-full text-center py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
    >
      Show 30 More... (currently {nextLimit - 30})
    </button>
  );
}
