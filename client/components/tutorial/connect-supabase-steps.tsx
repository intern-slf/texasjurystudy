"use client";

import { TutorialStep } from "./tutorial-step";
import { ExternalLink, Terminal, RefreshCw, database } from "lucide-react";
import { motion } from "framer-motion";

export function ConnectSupabaseSteps() {
  return (
    <ol className="flex flex-col gap-10 relative">
      {/* Decorative Connector Line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-accent/50 via-muted to-transparent hidden sm:block" />

      <TutorialStep title="Initialize Supabase Infrastructure">
        <p className="text-muted-foreground font-light leading-relaxed">
          Provision your secure backend by visiting{" "}
          <a
            href="https://database.new"
            target="_blank"
            className="heading-elegant text-accent hover:text-accent/80 transition-colors font-semibold gap-1 inline-flex items-center"
            rel="noreferrer"
          >
            database.new <ExternalLink className="h-3 w-3" />
          </a>{" "}
          to create a professional research environment.
        </p>
      </TutorialStep>

      <TutorialStep title="Synchronize Environment Variables">
        <div className="space-y-4">
          <p className="text-muted-foreground font-light">
            Locate your API credentials in the{" "}
            <a
              href="https://app.supabase.com/project/_/settings/api"
              target="_blank"
              className="text-accent hover:underline font-medium"
              rel="noreferrer"
            >
              Supabase Project Settings
            </a>.
          </p>
          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-muted/50 w-fit">
            <span className="text-[10px] heading-elegant opacity-40 uppercase">Action:</span>
            <code className="text-[11px] font-mono text-foreground/80">
              mv .env.example .env.local
            </code>
          </div>
        </div>
      </TutorialStep>

      <TutorialStep title="Rebuild Development Environment">
        <div className="space-y-3">
          <p className="text-muted-foreground font-light">
            Terminate your current session and re-initialize the server to inject the new security headers.
          </p>
          <div className="flex items-center gap-3 px-4 py-2 bg-black text-white rounded-md w-fit shadow-lg">
            <Terminal className="h-3.5 w-3.5 text-accent" />
            <code className="text-xs font-mono">npm run dev</code>
          </div>
        </div>
      </TutorialStep>

      <TutorialStep title="Finalize System Handshake">
        <div className="flex items-center gap-4 text-muted-foreground font-light">
          <p>Perform a browser refresh to complete the secure connection protocol.</p>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
          >
            <RefreshCw className="h-4 w-4 text-accent/40" />
          </motion.div>
        </div>
      </TutorialStep>
    </ol>
  );
}