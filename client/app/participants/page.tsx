"use client";

import Link from "next/link";
import {
  ArrowRight,
  DollarSign,
  ShieldCheck,
  Video,
  Clock,
  MessageSquare,
  BadgeCheck,
  Sparkles,
  Users,
  Heart,
} from "lucide-react";

export default function ParticipantsLanding() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-secondary/10 to-background" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
        <div
          className="absolute inset-0 -z-10 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="container mx-auto px-6 py-20 md:py-32">
          <div className="mx-auto max-w-4xl text-center space-y-6">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              Paid virtual focus groups for Texas residents
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl leading-[1.05]">
              Get paid to share <br className="hidden md:block" />
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                your honest opinion.
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
              Join short, paid Zoom sessions where you hear real legal cases and share what you think. No legal background needed — just your honest perspective.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row pt-4">
              <Link
                href="/auth/signup?role=participant"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
              >
                Sign Up as a Participant
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>

              <Link
                href="/auth/login"
                className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background/80 backdrop-blur px-8 text-sm font-semibold shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5"
              >
                I already have an account
              </Link>
            </div>

            <p className="text-sm text-muted-foreground pt-2 flex items-center justify-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" /> Secure
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" /> Anonymous
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-primary" /> Paid via PayPal
              </span>
            </p>
          </div>

          {/* Hero stats strip */}
          <div className="mx-auto mt-20 max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border bg-border">
              {[
                { value: "1–3 hrs", label: "average session" },
                { value: "Paid", label: "after each session" },
                { value: "100%", label: "remote via Zoom" },
                { value: "Anonymous", label: "identity protected" },
              ].map((stat, i) => (
                <div key={i} className="bg-background px-6 py-6 text-center">
                  <div className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</div>
                  <div className="mt-1 text-xs md:text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-6 py-24">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
            Why participants love this
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
            A few hours of your time, <br className="hidden md:block" />
            <span className="text-primary">paid &amp; meaningful.</span>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: DollarSign,
              title: "Real compensation",
              desc: "We pay competitively for your time and attention. Payment is sent via PayPal shortly after each completed session.",
            },
            {
              icon: Video,
              title: "100% remote",
              desc: "All sessions happen over secure Zoom. Join from anywhere in Texas — no travel, no courthouse.",
            },
            {
              icon: ShieldCheck,
              title: "Private & anonymous",
              desc: "Your identity stays protected. Attorneys only see your demographic profile and your honest feedback.",
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
                <div className="relative">
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="relative bg-secondary/40 py-24 overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="container mx-auto px-6">
          <div className="mb-16 text-center max-w-3xl mx-auto">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
              How it works
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              From sign-up to payday <br className="hidden md:block" />
              in <span className="text-primary">four simple steps.</span>
            </h2>
          </div>

          <div className="relative grid gap-8 md:grid-cols-4">
            <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            {[
              { icon: BadgeCheck, title: "Sign up & verify", desc: "Create a free account, answer a few demographic questions, and upload a photo of your driver's license to verify your identity." },
              { icon: Clock, title: "Get invited", desc: "We'll email you when a case matches your profile and schedule." },
              { icon: MessageSquare, title: "Join the session", desc: "Hop on Zoom, listen to the case, and share your honest reaction." },
              { icon: DollarSign, title: "Get paid", desc: "Receive your payment after the session is completed." },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 ring-8 ring-secondary/40">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="absolute top-0 right-1/2 translate-x-12 -translate-y-2 text-5xl font-black text-primary/10 select-none">
                    0{i + 1}
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{item.title}</h3>
                  <p className="text-muted-foreground leading-relaxed max-w-xs">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-6 py-24">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
            Questions answered
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
            What to <span className="text-primary">expect.</span>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
          {[
            {
              q: "Do I need legal experience?",
              a: "No. We want your everyday perspective — the same kind a real juror would bring. There's no preparation required.",
            },
            {
              q: "How long are sessions?",
              a: "Most sessions are 1–3 hours. You'll see the schedule in your invitation before you accept.",
            },
            {
              q: "What do I need to sign up?",
              a: "A PayPal account (we only pay through PayPal) and a clear photo of your driver's license for identity verification. Your ID is used only to confirm you're a real Texas resident — it's never shared with attorneys.",
            },
            {
              q: "Will my name be shared?",
              a: "Yes. Your name is visible to the attorney's case team along with your responses and demographic profile. Sensitive details such as your driver's license and payment information are never shared.",
            },
            {
              q: "How am I paid?",
              a: "We pay exclusively through PayPal. You'll need an active PayPal account on file in your participant dashboard — we don't offer checks, direct deposit, or any other payout method.",
            },
            {
              q: "Why do you need my driver's license?",
              a: "You'll upload a clear photo of your driver's license when you sign up, and we ask you to keep your current address up to date in your participant dashboard. This is how we confirm you're a real Texas resident — your ID and address are never shared with attorneys or other participants.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-lg hover:border-primary/30"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Heart className="h-4 w-4" />
                </div>
                <h3 className="text-xl font-bold">{item.q}</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed pl-11">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground shadow-2xl shadow-primary/20 sm:px-16 md:py-20">
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10 max-w-2xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 backdrop-blur px-4 py-1.5 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              Open to new participants
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to earn while shaping real cases?
            </h2>
            <p className="text-primary-foreground/80 text-lg">
              Sign up today — the next case that matches your profile could land in your inbox this week.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link
                href="/auth/signup?role=participant"
                className="inline-flex h-12 items-center justify-center rounded-md bg-background px-8 text-sm font-semibold text-primary shadow-lg transition-all hover:bg-background/90 hover:-translate-y-0.5"
              >
                Create Your Participant Account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex h-12 items-center justify-center rounded-md border border-primary-foreground/30 bg-transparent px-8 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-foreground/10 hover:-translate-y-0.5"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
