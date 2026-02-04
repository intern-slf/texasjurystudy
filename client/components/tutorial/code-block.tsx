"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export function CodeBlock({ code, label = "Terminal" }: { code: string; label?: string }) {
  const [hasCopied, setHasCopied] = useState(false);

  const copy = async () => {
    await navigator?.clipboard?.writeText(code);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-8 overflow-hidden rounded-xl border border-muted/40 bg-card shadow-2xl"
    >
      {/* Header / Tab Bar */}
      <div className="flex items-center justify-between bg-muted/30 px-4 py-2 border-b border-muted/40">
        <div className="flex items-center gap-2">
          <Terminal className="h-3 w-3 text-accent" />
          <span className="heading-elegant text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-semibold">
            {label}
          </span>
        </div>
        
        <Button
          size="icon"
          onClick={copy}
          variant="ghost"
          className="h-7 w-7 rounded-md hover:bg-accent/10 hover:text-accent transition-all"
        >
          <AnimatePresence mode="wait">
            {hasCopied ? (
              <motion.div
                key="check"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
              >
                <Check className="h-3.5 w-3.5" />
              </motion.div>
            ) : (
              <motion.div
                key="copy"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
              >
                <Copy className="h-3.5 w-3.5" />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </div>

      {/* Code Area */}
      <div className="relative group">
        <pre className="p-6 overflow-x-auto bg-primary/[0.02] backdrop-blur-sm scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
          <code className="text-[13px] font-mono leading-relaxed text-foreground/90 block">
            {code}
          </code>
        </pre>
        
        {/* Subtle Decorative Aura */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(180,149,85,0.03)_0%,transparent_50%)]" />
      </div>
    </motion.div>
  );
}