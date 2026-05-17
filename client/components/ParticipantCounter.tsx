"use client";

import { useEffect, useState } from "react";

export default function ParticipantCounter({ total }: { total: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let prev = -1;
    const update = () => {
      const checked = document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="participants"]:checked'
      ).length;
      if (checked !== prev) {
        prev = checked;
        setCount(checked);
      }
    };
    update();
    document.addEventListener("change", update);
    const interval = setInterval(update, 250);
    return () => {
      document.removeEventListener("change", update);
      clearInterval(interval);
    };
  }, []);

  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
      {count} / {total} selected
    </span>
  );
}
