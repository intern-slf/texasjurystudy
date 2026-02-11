"use client";

import Link from "next/link";
import {
  PlusCircle,
  PlayCircle,
  History,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  activeTab?: "current" | "approved" | "previous" | "new";
};

export default function PresenterSidebar({ activeTab }: Props) {
  const navItems = [
    {
      label: "Current Cases",
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
    <aside className="w-80 border-r bg-card flex flex-col sticky top-16 h-[calc(100vh-4rem)]">

      {/* Header */}
      <div className="px-8 pt-10 pb-8">
        <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-[0.25em]">
          Presenter Portal
        </p>
      </div>

      {/* Navigation */}
      <nav className="px-6 flex-1 space-y-4">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative group flex items-center gap-4 px-5 py-4 rounded-2xl text-sm transition-all duration-300 border border-transparent",
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-md border-primary/10"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:pl-6"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-colors duration-300",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
              />

              <span>{item.label}</span>

              {isActive && (
                <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-primary rounded-r-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-8 mt-auto border-t border-border/40">
        <div className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-muted/30 border shadow-sm">
          <div className="h-3 w-3 rounded-full bg-blue-500" />
          <div>
            <p className="text-xs font-semibold">Status: Active</p>
            <p className="text-[11px] text-muted-foreground">
              Connected to server
            </p>
          </div>
        </div>
      </div>

    </aside>
  );
}
