"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <motion.div
        initial={false}
        whileFocus={{ scale: 1.005 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="w-full"
      >
        <input
          type={type}
          className={cn(
            "flex h-11 w-full rounded-lg border border-muted bg-white/50 px-4 py-2 text-sm shadow-sm transition-all",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
            "placeholder:text-muted-foreground/60 placeholder:font-light",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent focus-visible:bg-white",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "heading-elegant tracking-wide",
            className
          )}
          ref={ref}
          {...props}
        />
      </motion.div>
    );
  },
);
Input.displayName = "Input";

export { Input };