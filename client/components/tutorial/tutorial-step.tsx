"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function TutorialStep({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.li 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative list-none group"
    >
      {/* Interactive Checkbox with Gold Glow */}
      <Checkbox
        id={title}
        name={title}
        className={cn(
          "absolute top-[2px] left-0 z-10",
          "h-5 w-5 rounded-md border-muted transition-all duration-500",
          "data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:shadow-[0_0_15px_rgba(180,149,85,0.3)]",
          "peer"
        )}
      />

      <label
        htmlFor={title}
        className={cn(
          "relative block cursor-pointer transition-all duration-500",
          "peer-checked:opacity-50"
        )}
      >
        <div className="ml-10 space-y-2">
          {/* Step Title */}
          <h3 className={cn(
            "text-sm font-medium tracking-tight transition-all duration-500",
            "heading-display peer-checked:line-through peer-checked:text-muted-foreground",
            "group-hover:text-accent"
          )}>
            {title}
          </h3>

          {/* Step Content */}
          <div
            className={cn(
              "text-[13px] leading-relaxed font-light text-muted-foreground transition-all duration-500",
              "peer-checked:line-through"
            )}
          >
            {children}
          </div>
        </div>
      </label>
    </motion.li>
  );
}