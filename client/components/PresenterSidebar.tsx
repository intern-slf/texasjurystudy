import Link from "next/link";
import { PlusCircle, PlayCircle, History } from "lucide-react"; // Optional: lucide-react icons

type Props = {
  activeTab?: "current" | "previous" | "new";
};

export default function PresenterSidebar({ activeTab }: Props) {
  const navItems = [
    { 
      label: "Current Cases", 
      href: "/dashboard/presenter?tab=current", 
      id: "current",
      icon: <PlayCircle className="w-4 h-4" /> 
    },
    { 
      label: "Create New Case", 
      href: "/dashboard/presenter/new", 
      id: "new",
      icon: <PlusCircle className="w-4 h-4" /> 
    },
    { 
      label: "Previous Cases", 
      href: "/dashboard/presenter?tab=previous", 
      id: "previous",
      icon: <History className="w-4 h-4" /> 
    },
  ];

  return (
    <aside className="w-64 border-r bg-slate-50/50 min-h-screen px-4 py-8 flex flex-col">
      <div className="mb-8 px-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Presenter Dashboard
        </h2>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                isActive
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200 font-medium"
                  : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Optional: User section or footer at bottom */}
      <div className="mt-auto pt-4 border-t border-slate-200">
        <p className="text-[10px] text-center text-slate-400">Texas Jury Study v1.0</p>
      </div>
    </aside>
  );
}