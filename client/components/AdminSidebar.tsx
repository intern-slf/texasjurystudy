"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";

type Counts = {
  requested: number;
  approved: number;
  sessions: number;
  approvedParticipants: number;
  newParticipants: number;
  blacklistedParticipants: number;
};

const caseItems = [
  { id: "requested", label: "Requested Cases", countKey: "requested" },
  { id: "approved", label: "Approved Cases", countKey: "approved" },
  { id: "sessions", label: "Sessions", countKey: "sessions" },
] as const;

const participantItems = [
  { id: "new_participants", label: "New Requests", countKey: "newParticipants" },
  { id: "participants", label: "Participants", countKey: "approvedParticipants" },
  { id: "blacklisted", label: "Blacklisted", countKey: "blacklistedParticipants" },
] as const;

function getHref(id: string) {
  switch (id) {
    case "sessions":
      return "/dashboard/Admin/sessions";
    case "participants":
      return "/dashboard/Admin/participants";
    case "new_participants":
      return "/dashboard/Admin/participants?tab=new";
    case "blacklisted":
      return "/dashboard/Admin/participants?tab=blacklisted";
    default:
      return `/dashboard/Admin?tab=${id}`;
  }
}

function isActive(id: string, pathname: string, currentTab: string) {
  switch (id) {
    case "sessions":
      return pathname.startsWith("/dashboard/Admin/sessions");
    case "new_participants":
      return pathname.startsWith("/dashboard/Admin/participants") && currentTab === "new";
    case "participants":
      return pathname.startsWith("/dashboard/Admin/participants") && currentTab !== "new" && currentTab !== "blacklisted";
    case "blacklisted":
      return pathname.startsWith("/dashboard/Admin/participants") && currentTab === "blacklisted";
    default:
      return pathname === "/dashboard/Admin" && currentTab === id;
  }
}

export default function AdminSidebar({
  active,
  counts,
}: {
  active: "requested" | "approved";
  counts: Counts;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentTab = searchParams.get("tab") || active;
  const isOnParticipants = pathname.startsWith("/dashboard/Admin/participants");

  const activeMode = isOnParticipants ? "participants" : "cases";
  const items = activeMode === "cases" ? caseItems : participantItems;

  return (
    /* Full-width band above the content on phones, fixed rail from lg up. */
    <aside className="w-full shrink-0 border-b bg-slate-50 p-4 flex flex-col sm:p-6 lg:w-64 lg:min-h-screen lg:border-b-0 lg:border-r">
      <h2 className="text-xs font-semibold uppercase text-slate-500 mb-4 tracking-wider">
        Admin Panel
      </h2>

      {/* ====== MODE TOGGLE ====== */}
      <div className="flex bg-slate-200/70 p-1 rounded-lg mb-4 lg:mb-6">
        <Link
          href="/dashboard/Admin?tab=requested"
          className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all ${
            activeMode === "cases"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Cases
        </Link>
        <Link
          href="/dashboard/Admin/participants?tab=new"
          className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-md transition-all ${
            activeMode === "participants"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Participants
        </Link>
      </div>

      {/* ====== NAV ITEMS ======
          Wraps as a row of chips on phones, stacks from lg up. */}
      <nav className="flex flex-wrap gap-2 lg:flex-1 lg:flex-col lg:flex-nowrap">
        {items.map((i) => {
          const count = counts[i.countKey];
          const active = isActive(i.id, pathname, currentTab);

          return (
            <Link
              key={i.id}
              href={getHref(i.id)}
              className={`flex justify-between items-center gap-3 whitespace-nowrap px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? "bg-white text-blue-600 border border-slate-200 shadow-sm font-medium"
                  : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
              }`}
            >
              <span>{i.label}</span>

              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  active
                    ? "bg-blue-50 text-blue-600"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 pt-4 border-t border-slate-200 lg:mt-auto">
        <p className="text-[10px] text-center text-slate-400">
          Administrator Access Only
        </p>
      </div>
    </aside>
  );
}
