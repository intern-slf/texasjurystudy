"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import {
  PlusCircle,
  PlayCircle,
  History,
  CheckCircle2,
} from "lucide-react";

type Props = {
  activeTab?: "current" | "request" | "approved" | "previous" | "new";
};

export default function PresenterSidebar({ activeTab }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentTab = searchParams.get("tab") || activeTab;

  const navItems = [
    {
      label: "Request Cases",
      href: "/dashboard/presenter?tab=current",
      id: "current",
      icon: PlayCircle,
    },
    {
      label: "Approved Cases",
      href: "/dashboard/presenter?tab=approved",
      id: "approved",
      icon: CheckCircle2,
    },
    {
      label: "Create New Case",
      href: "/dashboard/presenter/new",
      id: "new",
      icon: PlusCircle,
    },
    {
      label: "Previous Cases",
      href: "/dashboard/presenter?tab=previous",
      id: "previous",
      icon: History,
    },
  ];

  return (
    <aside className="w-64 border-r bg-slate-50 p-6 flex flex-col min-h-screen">
      <h2 className="text-xs font-semibold uppercase text-slate-500 mb-6 tracking-wider">
        Presenter Panel
      </h2>

      <nav className="space-y-2 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;

          const isActive =
            item.id === "new"
              ? pathname === "/dashboard/presenter/new"
              : currentTab === item.id;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-white text-blue-600 border border-slate-200 shadow-sm font-medium"
                  : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-200">
        <p className="text-[10px] text-center text-slate-400">
          Presenter Access Only
        </p>
      </div>
    </aside>
  );
}
