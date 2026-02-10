"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { 
  CheckCircle2, 
  FileText, 
  LayoutDashboard, 
  Users 
} from "lucide-react"; // BarChart3 removed
import { cn } from "@/lib/utils";

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
    { 
      id: "all", 
      label: "All Cases", 
      count: counts.all,
      icon: LayoutDashboard 
    },
    { 
      id: "approved", 
      label: "Approved", 
      count: counts.approved,
      icon: CheckCircle2 
    },
    { 
      id: "sessions", 
      label: "Sessions", 
      count: counts.sessions,
      icon: Users 
    },
    { 
      id: "submitted", 
      label: "Submitted", 
      count: counts.submitted,
      icon: FileText 
    },
  ];

  return (
    <aside className="w-80 border-r bg-card/40 backdrop-blur-xl flex flex-col min-h-screen z-10 sticky top-0 h-screen transition-all duration-300">
      <div className="p-8 pb-4">
        
        <div className="px-3 mb-6">
          <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-[0.2em]">
            Admin Portal
          </p>
        </div>
      </div>

      <nav className="space-y-2 px-6 flex-1">
        {items.map((i) => {
          const isActive = i.id === "sessions"
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
                "group flex items-center justify-between px-4 py-3.5 rounded-xl text-sm transition-all duration-300 ease-in-out border border-transparent",
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-sm border-primary/5"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:pl-5"
              )}
            >
              <div className="flex items-center gap-3.5">
                <Icon className={cn(
                  "h-5 w-5 transition-colors duration-300",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )} />
                <span className="tracking-wide">{i.label}</span>
              </div>

              {i.count > 0 && (
                <span
                  className={cn(
                    "text-[10px] px-2.5 py-0.5 rounded-full font-bold transition-colors shadow-sm",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                  )}
                >
                  {i.count}
                </span>
              )}
              
              {isActive && (
                <div className="absolute left-0 w-1.5 h-full top-0 bg-primary/80 rounded-r-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-8 mt-auto border-t border-border/40">
        <div className="flex items-center gap-4 px-4 py-4 rounded-2xl bg-gradient-to-br from-card to-muted/30 border border-border/60 shadow-sm">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold text-foreground tracking-wide">System Online</p>
            <p className="text-[10px] text-muted-foreground">Secure Connection</p>
          </div>
        </div>
      </div>
    </aside>
  );
}