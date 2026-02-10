"use client";

import Link from "next/link";
import Image from "next/image";
import {
  PlusCircle,
  PlayCircle,
  History,
  CheckCircle2,
  Presentation
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
    <aside className="w-80 border-r bg-card/40 backdrop-blur-xl flex flex-col min-h-screen z-10 sticky top-0 h-screen transition-all duration-300">
      <div className="p-8 pb-4">
        <div className="flex items-center gap-4 mb-8 px-2">
          <Image
            src="/logo.png"
            alt="Texas Jury Study"
            width={160}
            height={48}
            className="w-auto h-12 object-contain"
            priority
          />
        </div>
        
        <div className="px-3 mb-6">
          <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-[0.2em]">
            Presenter Portal
          </p>
        </div>
      </div>

      <nav className="space-y-2 px-6 flex-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm transition-all duration-300 ease-in-out border border-transparent relative",
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-sm border-primary/5"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:pl-5"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 transition-colors duration-300",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
              
              <span className="tracking-wide">{item.label}</span>

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
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
             <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold text-foreground tracking-wide">Status: Active</p>
            <p className="text-[10px] text-muted-foreground">Connected to server</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
