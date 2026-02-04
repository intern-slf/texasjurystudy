"use client";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export function EnvVarWarning() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap gap-4 items-center bg-accent/5 border border-accent/10 px-4 py-2 rounded-full backdrop-blur-sm"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-accent animate-pulse" />
        <Badge variant="glass" className="font-medium bg-transparent border-none p-0 lowercase">
          Supabase configuration required
        </Badge>
      </div>

      <div className="flex gap-3">
        <Button 
          size="sm" 
          variant="outline" 
          disabled 
          className="rounded-full h-8 px-4 text-[10px] heading-elegant opacity-40"
        >
          Sign in
        </Button>
        <Button 
          size="sm" 
          variant="default" 
          disabled 
          className="rounded-full h-8 px-4 text-[10px] heading-elegant opacity-40 bg-muted"
        >
          Sign up
        </Button>
      </div>
    </motion.div>
  );
}