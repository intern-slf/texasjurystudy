"use client";

import Link from "next/link";
import { ArrowRight, DollarSign, ShieldCheck, Video, Clock, MessageSquare, BadgeCheck } from "lucide-react";

export default function ParticipantsLanding() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center py-20 text-center md:py-32 bg-gradient-to-b from-background to-secondary/20">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

        <div className="space-y-6 max-w-5xl px-6">
          <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium border-transparent bg-secondary text-secondary-foreground">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse" />
            Paid virtual focus groups — Texas residents
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl">
            Get Paid to Share <br className="hidden md:block" />
            <span className="text-primary">Your Honest Opinion</span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
            Join short, paid Zoom sessions where you hear real legal cases and share what you think. No legal background needed — just your honest perspective.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row pt-4">
            <Link
              href="/auth/signup?role=participant"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Sign Up as a Participant
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>

            <Link
              href="/auth/login"
              className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              I already have an account
            </Link>
          </div>

          <p className="text-sm text-muted-foreground pt-4">
            Secure • Anonymous • Paid via direct deposit
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-6 py-24">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Why participants love this</h2>
          <p className="mt-4 text-lg text-muted-foreground">A few hours of your time can pay well — and make a real difference.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DollarSign className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">Real Compensation</h3>
            <p className="text-muted-foreground">
              We pay competitively for your time and attention. Payment is sent shortly after each completed session.
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Video className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">100% Remote</h3>
            <p className="text-muted-foreground">
              All sessions happen over secure Zoom. Join from anywhere in Texas — no travel, no courthouse.
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h3 className="mb-3 text-xl font-bold">Private &amp; Anonymous</h3>
            <p className="text-muted-foreground">
              Your identity stays protected. Attorneys only see your demographic profile and your honest feedback.
            </p>
          </div>
        </div>
      </section>

      {/* How it works for participants */}
      <section className="bg-secondary/50 py-24">
        <div className="container mx-auto px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How it works</h2>
            <p className="mt-4 text-lg text-muted-foreground">From sign-up to payday in four simple steps.</p>
          </div>

          <div className="grid gap-12 md:grid-cols-4">
            {[
              { step: "01", icon: BadgeCheck, title: "Sign Up", desc: "Create a free account and answer a few quick demographic questions." },
              { step: "02", icon: Clock, title: "Get Invited", desc: "We'll email you when a case matches your profile and schedule." },
              { step: "03", icon: MessageSquare, title: "Join the Session", desc: "Hop on Zoom, listen to the case, and share your honest reaction." },
              { step: "04", icon: DollarSign, title: "Get Paid", desc: "Receive your payment after the session is completed." },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
                    <Icon className="h-7 w-7" />
                  </div>
                  <span className="text-xs font-semibold text-primary mb-2">STEP {item.step}</span>
                  <h3 className="mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ-ish reassurance */}
      <section className="container mx-auto px-6 py-24">
        <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
          <div className="rounded-2xl border bg-background p-8">
            <h3 className="mb-3 text-xl font-bold">Do I need legal experience?</h3>
            <p className="text-muted-foreground">
              No. We want your everyday perspective — the same kind a real juror would bring. There&apos;s no preparation required.
            </p>
          </div>
          <div className="rounded-2xl border bg-background p-8">
            <h3 className="mb-3 text-xl font-bold">How long are sessions?</h3>
            <p className="text-muted-foreground">
              Most sessions are 1–3 hours. You&apos;ll see the schedule in your invitation before you accept.
            </p>
          </div>
          <div className="rounded-2xl border bg-background p-8">
            <h3 className="mb-3 text-xl font-bold">Will my name be shared?</h3>
            <p className="text-muted-foreground">
              No. Your identifying details stay private. Only your responses and general demographic profile are visible to the case team.
            </p>
          </div>
          <div className="rounded-2xl border bg-background p-8">
            <h3 className="mb-3 text-xl font-bold">How am I paid?</h3>
            <p className="text-muted-foreground">
              Payment is sent after each completed session. You&apos;ll set up your payment details in your participant dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground shadow-2xl sm:px-16 md:py-20">
          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to earn while shaping real cases?
            </h2>
            <p className="text-lg text-primary-foreground/80">
              Sign up today — the next case that matches your profile could land in your inbox this week.
            </p>
            <div className="pt-4">
              <Link
                href="/auth/signup?role=participant"
                className="inline-flex h-12 items-center justify-center rounded-md bg-background px-8 text-sm font-medium text-primary shadow transition-colors hover:bg-background/90"
              >
                Create Your Participant Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="absolute left-1/2 top-1/2 -z-0 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
        </div>
      </section>
    </div>
  );
}
