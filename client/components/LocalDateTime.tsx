"use client";

interface Props {
  iso: string;
  /** "date" = date only, "datetime" = date + time (default) */
  mode?: "date" | "datetime";
}

export default function LocalDateTime({ iso, mode = "datetime" }: Props) {
  const d = new Date(iso);
  const str =
    mode === "date"
      ? d.toLocaleDateString()
      : d.toLocaleString();
  return <>{str}</>;
}
