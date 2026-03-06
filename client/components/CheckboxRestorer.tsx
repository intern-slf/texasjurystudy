"use client";

import { useEffect } from "react";

export default function CheckboxRestorer() {
  useEffect(() => {
    const stored = sessionStorage.getItem("session_builder_checked");
    if (!stored) return;

    let checkedIds: string[] = [];
    try {
      checkedIds = JSON.parse(stored);
    } catch {
      return;
    }

    if (!checkedIds.length) return;

    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="participants"]'
    );
    checkboxes.forEach((cb) => {
      if (checkedIds.includes(cb.value)) {
        cb.checked = true;
      }
    });
  }, []);

  return null;
}
