"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowDown,
  Users,
  Briefcase,
  Clock,
  DollarSign,
  MapPin,
  Video,
  Sparkles,
  Scale,
  ShieldCheck,
  Building2,
  Gavel,
  Handshake,
  Check,
} from "lucide-react";

export default function RequesteeLanding() {
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

        <div className="container mx-auto px-6 py-20 md:py-28">
          <div className="mx-auto max-w-4xl text-center space-y-6">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              For attorneys, mediators, arbitrators &amp; adjusters
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl leading-[1.05]">
              Test your case with a{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                virtual Texas jury.
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed">
              Texas Jury Study is a virtual jury study service built for Texas litigation. Get unfiltered reactions from a cross-section of real Texans — at a fraction of the cost of a traditional jury consultant.
            </p>

            <div className="pt-2">
              <a
                href="#what-is-tjs"
                className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background/80 backdrop-blur px-8 text-sm font-semibold shadow-sm transition-all hover:bg-accent hover:text-accent-foreground hover:-translate-y-0.5"
              >
                Learn how it works
                <ArrowDown className="ml-2 h-4 w-4" />
              </a>
            </div>

            <p className="text-sm text-muted-foreground pt-2 flex items-center justify-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" /> Confidential
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Video className="h-4 w-4 text-primary" /> Virtual
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" /> Texas-wide
              </span>
            </p>
          </div>

          {/* Hero stats strip */}
          <div className="mx-auto mt-20 max-w-4xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border bg-border">
              {[
                { value: "6–12", label: "jurors per panel" },
                { value: "254", label: "Texas counties" },
                { value: "$850", label: "starting hourly rate" },
                { value: "$20K+", label: "saved vs. traditional" },
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

      {/* What is Texas Jury Study? */}
      <section id="what-is-tjs" className="container mx-auto px-6 py-24 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12 text-center">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
              The Service
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              What is <span className="text-primary">Texas Jury Study?</span>
            </h2>
          </div>

          <p className="text-lg text-muted-foreground leading-relaxed text-center max-w-3xl mx-auto">
            A virtual jury study service for Texas litigation cases. We assemble panels of <strong className="text-foreground">6 to 12 participants</strong> drawn as a random cross-section of the Texas population — broadly reflective of the venires you&apos;d encounter across the state&apos;s 254 counties. Attorneys, mediators, arbitrators, and insurance adjusters use these panels to pressure-test their case before it matters.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { icon: Users, value: "6–12", label: "participants per panel" },
              { icon: MapPin, value: "254", label: "Texas counties represented" },
              { icon: Video, value: "Virtual", label: "secure Zoom sessions" },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="group relative overflow-hidden rounded-2xl border bg-background p-8 transition-all hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
                >
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
                  <div className="relative">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="text-3xl font-extrabold">{item.value}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Who should submit a case? */}
      <section className="relative bg-secondary/40 py-24 overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="container mx-auto px-6 max-w-5xl">
          <div className="mb-12 text-center">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
              Who It&apos;s For
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              Who should submit a case?
            </h2>
            <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
              Anyone in the legal industry with a case where juror perspective matters.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {[
              {
                icon: Briefcase,
                title: "Litigation & trial attorneys",
                desc: "Plaintiff- and defense-side counsel preparing for trial, mediation, or settlement.",
              },
              {
                icon: Building2,
                title: "Insurance companies & adjusters",
                desc: "Evaluating exposure and the likely jury response on disputed claims.",
              },
              {
                icon: Handshake,
                title: "Mediators",
                desc: "Bringing data-driven perspective to the table before settlement discussions.",
              },
              {
                icon: Gavel,
                title: "Arbitrators",
                desc: "Stress-testing how a panel of laypeople would react to the evidence at hand.",
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
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold">{item.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* When / at what stage? */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12 text-center">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
              Timing
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              When should you <span className="text-primary">run a study?</span>
            </h2>
            <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
              There&apos;s no single right moment — a study is useful at every stage, and the best results often come from running more than one as the case develops.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { stage: "Intake phase", desc: "Decide whether to take the case, and at what value, before you commit resources." },
              { stage: "Throughout litigation", desc: "Re-evaluate strategy as new facts surface, motions are decided, and the record builds." },
              { stage: "Before & after depositions", desc: "Plan what to ask going in, and assess how the testimony actually lands coming out." },
              { stage: "Before trial", desc: "Test openings, themes, exhibits, and damages frameworks while there&apos;s still time to adjust." },
            ].map((item, i) => (
              <div
                key={i}
                className="group flex gap-4 rounded-2xl border bg-background p-6 transition-all hover:shadow-lg hover:border-primary/30"
              >
                <div className="flex-shrink-0 mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{item.stage}</h3>
                  <p className="text-muted-foreground text-sm mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground italic max-w-2xl mx-auto">
            Many of our requestees run studies multiple times on the same case — continuous re-evaluation is part of how good trial strategy is built.
          </p>
        </div>
      </section>

      {/* Cost */}
      <section className="relative bg-secondary/40 py-24 overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="container mx-auto px-6 max-w-5xl">
          <div className="mb-12 text-center">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
              Pricing
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              Flexible, <span className="text-primary">cost-effective</span> pricing.
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="group relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-background p-8 shadow-xl shadow-primary/5">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10" />
              <div className="relative">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5" />
                  Texas Jury Study
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-5xl font-extrabold text-primary">$850</div>
                  <div className="text-lg font-medium text-muted-foreground">/hour</div>
                </div>
                <p className="text-muted-foreground mt-4 leading-relaxed">
                  Starting price for virtual studies. In-person pricing is available and discussed separately based on your needs.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    "Pay per session — no retainer",
                    "Virtual delivery by default",
                    "In-person available on request",
                  ].map((point, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-5 w-5 flex-shrink-0 text-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border bg-background p-8 opacity-80">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <DollarSign className="h-3.5 w-3.5" />
                Traditional consultants
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-5xl font-extrabold text-muted-foreground">$20K–$30K</div>
              </div>
              <p className="text-muted-foreground mt-4 leading-relaxed">
                Typical cost for a comparable engagement with a traditional jury consultant — often out of reach for everyday cases.
              </p>
              <ul className="mt-6 space-y-2.5 text-muted-foreground">
                {[
                  "Large upfront retainers",
                  "Tied to in-person logistics",
                  "Limited to high-stakes cases",
                ].map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-10 text-center text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            We built Texas Jury Study so jury research isn&apos;t reserved for the biggest cases on the biggest dockets. Whether you need a single hour or an ongoing engagement, pricing scales to the case.
          </p>
        </div>
      </section>

      {/* How do I sign up? — final CTA */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12 text-center">
            <span className="inline-block text-sm font-semibold text-primary uppercase tracking-widest">
              Get Started
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              How do I sign up?
            </h2>
            <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
              If the service makes sense for your practice, the next step is to create a requestee account. Submit your first case, share the materials you want the panel to consider, and we&apos;ll handle the rest.
            </p>
          </div>

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
                <Scale className="h-3.5 w-3.5" />
                Ready when you are
              </div>
              <h3 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to submit a case?
              </h3>
              <p className="text-primary-foreground/80 text-lg">
                Create your free requestee account — no commitment, and no charge until you actually run a study.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link
                  href="/auth/signup?role=requestee"
                  className="inline-flex h-12 items-center justify-center rounded-md bg-background px-8 text-sm font-semibold text-primary shadow-lg transition-all hover:bg-background/90 hover:-translate-y-0.5"
                >
                  Create Requestee Account
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
        </div>
      </section>
    </div>
  );
}
