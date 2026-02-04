"use client";

import Link from "next/link";
import { TutorialStep } from "./tutorial-step";
import { ArrowUpRight, Globe, ShieldCheck, MailPlus } from "lucide-react";
import { motion } from "framer-motion";

export function SignUpUserSteps() {
  const isHosted = process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production";

  return (
    <ol className="flex flex-col gap-10 relative">
      {/* Decorative Connector Line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-accent/50 via-muted to-transparent hidden sm:block" />

      {isHosted ? (
        <TutorialStep title="Configure Production Redirects">
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/5 border border-accent/20 w-fit">
              <Globe className="h-3 w-3 text-accent" />
              <span className="heading-elegant text-[9px] text-accent tracking-[0.2em] uppercase">
                Active Environment: {process.env.VERCEL_ENV}
              </span>
            </div>
            
            <p className="text-muted-foreground font-light leading-relaxed">
              To ensure secure authentication handshakes, update your{" "}
              <Link
                className="heading-elegant text-accent font-semibold hover:underline"
                href="https://supabase.com/dashboard/project/_/auth/url-configuration"
                target="_blank"
              >
                Supabase URL Configuration
              </Link>{" "}
              with the following authorized redirect patterns:
            </p>

            <ul className="space-y-3">
              {[
                "http://localhost:3000/**",
                `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/**`,
                `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(".vercel.app", "")}-*-[vercel-team-url].vercel.app/**`
              ].map((url, i) => (
                <motion.li 
                  key={i}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="h-1 w-1 rounded-full bg-accent" />
                  <code className="relative rounded-lg bg-muted/40 px-3 py-1.5 font-mono text-[11px] text-foreground/80 border border-muted/50 break-all">
                    {url}
                  </code>
                </motion.li>
              ))}
            </ul>

            <Link
              href="https://supabase.com/docs/guides/auth/redirect-urls#vercel-preview-urls"
              target="_blank"
              className="heading-elegant text-[10px] text-muted-foreground/60 hover:text-accent flex items-center gap-1 transition-colors tracking-widest uppercase"
            >
              Protocol Documentation <ArrowUpRight size={12} />
            </Link>
          </div>
        </TutorialStep>
      ) : null}

      <TutorialStep title="Provision Initial User Identity">
        <div className="space-y-4">
          <p className="text-muted-foreground font-light leading-relaxed">
            Finalize your infrastructure setup by creating the primary administrator account. 
            Navigate to the secure gateway to begin.
          </p>
          
          <motion.div whileHover={{ x: 5 }} transition={{ type: "spring", stiffness: 400 }}>
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-primary text-primary-foreground heading-elegant text-[10px] tracking-widest shadow-xl shadow-primary/10 hover:shadow-accent/20 transition-all"
            >
              <MailPlus className="h-3.5 w-3.5" />
              Initialize Sign Up
            </Link>
          </motion.div>
          
          <div className="flex items-center gap-2 pt-4">
            <ShieldCheck className="h-3.5 w-3.5 text-accent opacity-40" />
            <p className="text-[9px] heading-elegant text-muted-foreground/40 uppercase tracking-[0.3em]">
              Verified Infrastructure Protocol
            </p>
          </div>
        </div>
      </TutorialStep>
    </ol>
  );
}