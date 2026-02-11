"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { 
  CheckCircle2, 
  FileText, 
  LayoutDashboard, 
  Users 
} from "lucide-react";
import { cn } from "@/lib/utils";

type Counts = {
  all: number;
  approved: number;
  submitted: number;
  sessions: number;
};

export default function AdminSidebar({
  
  counts,
}: {
  active: "all" | "approved" | "submitted";
  counts: Counts;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

 const tabFromUrl = searchParams.get("tab");

const currentTab =
  pathname.startsWith("/dashboard/Admin/sessions")
    ? "sessions"
    : tabFromUrl || "all";


  const items = [
    { id: "all", label: "All Cases", count: counts.all, icon: LayoutDashboard },
    { id: "approved", label: "Approved", count: counts.approved, icon: CheckCircle2 },
    { id: "sessions", label: "Sessions", count: counts.sessions, icon: Users },
    { id: "submitted", label: "Submitted", count: counts.submitted, icon: FileText },
  ];

  return (
    <aside className="w-80 border-r bg-card/50 backdrop-blur-xl flex flex-col min-h-screen sticky top-0 h-screen transition-all duration-300">
{/* 
      Header
      <div className="px-8 pt-10 pb-6">
        <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-[0.25em]">
          Admin Portal
        </p>
      </div> */}

      {/* Navigation */}
      <nav className="flex-1 px-6 space-y-3">
        {items.map((i) => {
          const isActive =
            i.id === "sessions"
              ? pathname.startsWith("/dashboard/Admin/sessions")
              : currentTab === i.id;

          const Icon = i.icon;

          return (
            <Link
              key={i.id}
              href={
                i.id === "sessions"
                  ? "/dashboard/Admin/sessions"
                  : `/dashboard/Admin?tab=${i.id}`
              }
              className={cn(
                "relative group flex items-center justify-between px-5 py-4 rounded-2xl text-sm transition-all duration-300 ease-in-out border border-transparent",
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-md border-primary/10"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:pl-6"
              )}
            >
              <div className="flex items-center gap-4">
                <Icon
                  className={cn(
                    "h-5 w-5 transition-colors duration-300",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="tracking-wide">{i.label}</span>
              </div>

              {i.count > 0 && (
                <span
                  className={cn(
                    "text-[11px] px-2.5 py-0.5 rounded-full font-semibold transition-all shadow-sm",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                  )}
                >
                  {i.count}
                </span>
              )}

              {isActive && (
                <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-primary rounded-r-full shadow-[0_0_12px_rgba(var(--primary),0.6)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Status */}
      <div className="px-8 pb-10 pt-8 mt-auto border-t border-border/40">
        <div className="flex items-center gap-4 px-5 py-5 rounded-2xl bg-gradient-to-br from-card to-muted/30 border border-border/60 shadow-sm">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-foreground tracking-wide">
              System Online
            </p>
            <p className="text-[11px] text-muted-foreground">
              Secure Connection
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
