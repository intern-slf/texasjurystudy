"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

type Counts = {
  all: number;
  approved: number;
  submitted: number;
  sessions: number;
};

export default function AdminSidebar({
  active,
  counts,
}: {
  active: "all" | "approved" | "submitted";
  counts: Counts;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentTab = searchParams.get("tab") || active;

  const items = [
    { id: "all", label: "All Cases", count: counts.all },
    { id: "approved", label: "Approved", count: counts.approved },
    { id: "sessions", label: "Sessions", count: counts.sessions },
    { id: "submitted", label: "Upcomig Sessions", count: counts.submitted },
  ];

  return (
    <aside className="w-64 border-r bg-slate-50 p-6 flex flex-col min-h-screen">
      <h2 className="text-xs font-semibold uppercase text-slate-500 mb-6 tracking-wider">
        Admin Panel
      </h2>

      <nav className="space-y-2 flex-1">
        {items.map((i) => (
          <Link
            key={i.id}
            href={
              i.id === "sessions"
                ? "/dashboard/Admin/sessions"
                : `/dashboard/Admin?tab=${i.id}`
            }
            className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm transition-all ${
              (i.id === "sessions"
                ? pathname.startsWith("/dashboard/Admin/sessions")
                : currentTab === i.id)
                ? "bg-white text-blue-600 border border-slate-200 shadow-sm font-medium"
                : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
            }`}
          >
            <span>{i.label}</span>

            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                (i.id === "sessions"
                  ? pathname.startsWith("/dashboard/Admin/sessions")
                  : currentTab === i.id)
                  ? "bg-blue-50 text-blue-600"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {i.count}
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-200">
        <p className="text-[10px] text-center text-slate-400">
          Administrator Access Only
        </p>
      </div>
    </aside>
  );
}
