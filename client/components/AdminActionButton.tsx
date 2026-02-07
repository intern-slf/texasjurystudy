"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

interface Props {
  label: string;
  activeColor: string;
  hoverColor: string;
}

export function AdminActionButton({ label, activeColor, hoverColor }: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`text-xs ${activeColor} ${hoverColor} text-white px-3 py-1.5 rounded transition-all font-medium flex items-center justify-center min-w-[80px] disabled:opacity-70 disabled:cursor-not-allowed`}
    >
      {pending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        label
      )}
    </button>
  );
}